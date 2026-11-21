-- =============================================================================
-- Agorbis · Verificación de RLS y de las funciones `security definer`
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS del seed, con `psql` o pegado en el SQL Editor de Supabase:
--
--   psql "$DATABASE_URL" -f supabase/tests/rls_checks.sql
--
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja rastro
-- y se puede repetir. Cada aserción falla ruidosamente con un mensaje que dice
-- qué regla se rompió.
--
-- El foco está puesto donde el sistema es más frágil: las funciones
-- `security definer` que **replican a mano** reglas de visibilidad que también
-- viven en las policies. Cuando alguien cambia una policy y se olvida de la
-- función, nada avisa: la función sigue devolviendo lo que devolvía. Estos
-- tests son ese aviso.
-- =============================================================================

begin;

-- --- Utilidades ---------------------------------------------------------------
create or replace function pg_temp.as_user(p_username text)
returns void language plpgsql as $$
declare v_id uuid;
begin
  -- La búsqueda va como owner, no bajo el rol que esté activo. 0012 cambió
  -- `profiles_select_all` por `profiles_select_own_or_moderator`, así que
  -- llamar a `as_user` desde una sesión `anon` no encontraba el perfil y el
  -- error culpaba al seed. Se restablece el rol antes de mirar la tabla.
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  select id into v_id from public.profiles where username = p_username;
  if v_id is null then
    raise exception 'El usuario demo % no existe: ¿corriste el seed?', p_username;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub', v_id::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text, true);
  -- Los documentos legales y el aviso de transferencias current forman parte
  -- del contrato de una sesión participativa. Cada prueba termina en rollback.
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
end $$;

create or replace function pg_temp.as_user_aal2(p_username text)
returns void language plpgsql as $$
declare v_id uuid; v_factor uuid; v_session uuid := gen_random_uuid();
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  select id into v_id from public.profiles where username = p_username;
  if v_id is null then
    raise exception 'El usuario demo % no existe: ¿corriste el seed?', p_username;
  end if;
  select approved.factor_id into v_factor
  from private.privileged_mfa_factors approved
  where approved.user_id = v_id
  order by approved.approved_at desc
  limit 1;
  if v_factor is null then
    raise exception 'El usuario privilegiado % no tiene TOTP aprobado', p_username;
  end if;
  insert into auth.sessions (
    id, user_id, created_at, updated_at, factor_id, aal
  ) values (
    v_session, v_id, statement_timestamp(), statement_timestamp(),
    v_factor, 'aal2'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub', v_id::text, 'role', 'authenticated', 'aal', 'aal2',
      'session_id', v_session::text
    )::text, true);
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
end $$;

create or replace function pg_temp.as_user_without_legal(p_username text)
returns void language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  select id into v_id from public.profiles where username = p_username;
  if v_id is null then
    raise exception 'El usuario demo % no existe: ¿corriste el seed?', p_username;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object(
      'sub', v_id::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text, true);
end $$;

create or replace function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice '  ok   · %', p_what;
  else
    raise exception 'FALLÓ · %', p_what;
  end if;
end $$;

-- 0039 revoca el EXECUTE incorporado de PUBLIC también para funciones que se
-- creen después. Los helpers temporales del test necesitan su ACL explícita.
grant execute on function pg_temp.as_user(text) to anon, authenticated, service_role;
grant execute on function pg_temp.as_user_aal2(text) to anon, authenticated, service_role;
grant execute on function pg_temp.as_user_without_legal(text) to anon, authenticated, service_role;
grant execute on function pg_temp.as_anon() to anon, authenticated, service_role;
grant execute on function pg_temp.as_owner() to anon, authenticated, service_role;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated, service_role;

-- =============================================================================
-- 1 · is_member: la regla que sostiene todo lo demás
-- =============================================================================
do $$
declare v_sofia uuid;
begin
  raise notice '── 1 · is_member ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  perform pg_temp.as_user('sofia_mdq');

  perform pg_temp.ok(
    public.is_member(v_sofia, (select id from public.communities where slug = 'mar-del-plata')),
    'sofía es miembro de su propia ciudad');
  perform pg_temp.ok(
    public.is_member(v_sofia, (select id from public.communities where slug = 'earth')),
    'sofía es miembro de la raíz de su cadena');
  perform pg_temp.ok(
    not public.is_member(v_sofia, (select id from public.communities where slug = 'cordoba')),
    'sofía NO es miembro de una provincia ajena');
  perform pg_temp.ok(
    not public.is_member(v_sofia, (select id from public.communities where slug = 'necochea')),
    'sofía NO es miembro de una ciudad hermana');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 2 · Escrituras: la prueba negativa
--     Es la que importa. Que un residente pueda escribir se ve en la UI todos
--     los días; que un no residente NO pueda sólo se ve acá.
-- =============================================================================
do $$
declare
  v_sofia    uuid;
  v_cordoba  uuid;
  v_debate   uuid := 'c0000000-0000-4000-8000-000000000001';
  v_rechazado boolean;
begin
  raise notice '── 2 · escrituras fuera de la cadena de residencia ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_cordoba from public.communities where slug = 'cordoba';

  perform pg_temp.as_user('sofia_mdq');

  -- 2.1 · comentar en la columna de otra provincia
  v_rechazado := false;
  begin
    insert into public.debate_comments (debate_id, column_community_id, user_id, body)
    values (v_debate, v_cordoba, v_sofia, 'no debería poder escribir acá');
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'no puede comentar en la columna de otra provincia');

  -- 2.2 · publicar un reclamo en una comunidad ajena
  v_rechazado := false;
  begin
    insert into public.claims (community_id, author_id, title, description, category)
    values (v_cordoba, v_sofia, 'Reclamo ajeno', 'No vivo acá.', 'otro');
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'no puede publicar un reclamo donde no reside');

  -- 2.3 · suplantar a otro usuario como autor
  v_rechazado := false;
  begin
    insert into public.claims (community_id, author_id, title, description, category)
    values ((select id from public.communities where slug = 'mar-del-plata'),
            (select id from public.profiles where username = 'bruno_lp'),
            'Firmado por otro', 'Debería rechazarse.', 'otro');
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'no puede publicar en nombre de otra persona');

  -- 2.4 · escalar privilegios
  v_rechazado := false;
  begin
    update public.profiles set role = 'admin' where id = v_sofia;
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'no puede darse a sí misma el rol de admin');

  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 3 · Secreto del voto
-- =============================================================================
do $$
declare
  v_own_receipts int;
  v_all_receipts int;
begin
  raise notice '── 3 · secreto del voto ──';

  perform pg_temp.as_owner();
  select count(*) into v_all_receipts
  from public.poll_participation_receipts;
  perform pg_temp.ok(
    to_regclass('public.poll_votes') is null
    and has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'select'
    )
    and not has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'delete'
    )
    and has_table_privilege('anon', 'public.polls', 'select'),
    'el voto identificado desapareció y los recibos sólo se leen, nunca se escriben directo');

  perform pg_temp.ok(
    not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'poll_participation_receipts'
        and column_name in ('option_id', 'ballot_id')
    )
    and not exists (
      select 1
      from information_schema.columns
      where table_schema = 'private'
        and table_name in ('poll_option_tallies', 'budget_proposal_tallies')
        and column_name in (
          'user_id', 'created_at', 'participated_at', 'ballot_id'
        )
    )
    and to_regclass('private.poll_ballots') is null
    and to_regclass('private.poll_ballot_selections') is null
    and to_regclass('private.budget_ballots') is null
    and to_regclass('private.budget_ballot_allocations') is null
    and not exists (
      select 1
      from information_schema.tables
      where table_schema = 'private'
        and table_name like '%ballot%'
    ),
    'no existe una fila individual de boleta/reparto ni una tabla que combine identidad y selección');

  perform pg_temp.ok(
    has_function_privilege(
      'authenticated', 'public.cast_poll_ballot(uuid,uuid[])', 'execute'
    )
    and not has_function_privilege(
      'anon', 'public.cast_poll_ballot(uuid,uuid[])', 'execute'
    )
    and not has_schema_privilege('authenticated', 'private', 'usage'),
    'sólo una sesión autenticada puede emitir por RPC y PostgREST no entra al esquema de tallies');

  perform pg_temp.as_user('sofia_mdq');
  select count(*) into v_own_receipts
  from public.poll_participation_receipts;
  perform pg_temp.ok(
    v_own_receipts > 0 and v_own_receipts < v_all_receipts,
    'un usuario sólo ve sus propios recibos de participación');

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    to_regclass('public.poll_vote_events') is null,
    'no existe una señal pública que revele el instante de cada voto');
end $$;

-- =============================================================================
-- 4 · Paridad entre las funciones `security definer` y las policies
--     Acá es donde el sistema se desincroniza en silencio.
-- =============================================================================
do $$
declare
  v_low       uuid := 'a0000000-0000-4000-8000-000000000003'; -- 2 participantes
  v_global    uuid := 'a0000000-0000-4000-8000-000000000001'; -- 7 participantes
  v_arg       uuid := 'a0000000-0000-4000-8000-000000000002';
  v_community uuid;
  v_feed      int;
  v_visible   int;
  v_can_see   boolean;
  v_rows      int;
begin
  raise notice '── 4 · poll_feed / poll_results / poll_stats vs. policies ──';

  perform pg_temp.as_owner();
  select community_id into v_community from public.polls where id = v_arg;

  -- 4.1 · `poll_feed` replica a mano el "status <> removed" de la policy.
  --       Si alguien cambia la policy y no la función, esto lo detecta.
  perform pg_temp.as_anon();
  select count(*) into v_feed
  from public.poll_feed(v_community, 100, null, null);
  select count(*) into v_visible from public.polls where community_id = v_community;
  perform pg_temp.ok(
    v_feed = v_visible,
    'poll_feed devuelve exactamente lo que anon puede leer de polls');

  -- 4.2 · Ni siquiera una encuesta con más de cinco participantes publica
  --       conteos mientras sigue abierta.
  select count(*) into v_rows from public.poll_results(v_global);
  perform pg_temp.ok(v_rows = 0, 'una encuesta abierta nunca publica resultados');
  select can_see into v_can_see from public.poll_stats(v_global);
  perform pg_temp.ok(
    v_can_see = false,
    'poll_stats también oculta conteos exactos durante la votación');

  -- 4.3 · Haber participado no abre un canal after_vote.
  perform pg_temp.as_user('sofia_mdq');
  select count(*) into v_rows from public.poll_results(v_global);
  perform pg_temp.ok(v_rows = 0, 'un recibo propio no permite ver resultados antes del cierre');

  -- 4.4 · Al cerrar se publica sólo si hay cinco participantes o más.
  perform pg_temp.as_owner();
  update public.polls set status = 'closed' where id in (v_global, v_low);
  perform pg_temp.as_anon();
  select count(*) into v_rows from public.poll_results(v_global);
  select can_see into v_can_see from public.poll_stats(v_global);
  perform pg_temp.ok(v_rows > 0 and v_can_see, 'al cierre, siete participantes habilitan agregados');

  select count(*) into v_rows from public.poll_results(v_low);
  select can_see into v_can_see from public.poll_stats(v_low);
  perform pg_temp.ok(
    v_rows = 0 and not v_can_see,
    'al cierre, dos participantes siguen protegidos sin revelar el conteo exacto');

  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 5 · No hay desglose territorial ni identidad asociada a una opción
-- =============================================================================
do $$
begin
  raise notice '── 5 · sin canales de reidentificación ──';
  perform pg_temp.as_owner();

  perform pg_temp.ok(
    to_regprocedure('public.poll_results_by_child(uuid)') is null
    and to_regprocedure('public.sibling_poll_contrast(uuid,integer)') is null
    and to_regprocedure('public.poll_option_voters(uuid)') is null
    and to_regprocedure('public.poll_option_anonymous_counts(uuid)') is null,
    'no existen RPC territoriales ni públicas que permitan ligar una opción con identidad');
end $$;

-- =============================================================================
-- 6 · Cuotas: el tope se aplica en el motor, no sólo en la action
-- =============================================================================
do $$
declare
  v_sofia     uuid;
  v_mdp       uuid;
  v_limite    int;
  v_nivel     smallint;
  v_restante  int;
  v_rechazado boolean := false;
  v_first     uuid;
  v_other     uuid;
  i           int;
begin
  raise notice '── 6 · cuotas ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  -- D127: Mar del Plata es nivel 5 bajo General Pueyrredón; el cupo se lee
  -- del nivel real de la comunidad, no de un número fijo.
  select id, level into v_mdp, v_nivel
  from public.communities where slug = 'mar-del-plata';
  select monthly_limit into v_limite
  from public.content_quotas where level = v_nivel and content_type = 'claim';
  select id into v_other
  from public.claims
  where author_id is distinct from v_sofia
  limit 1;

  perform pg_temp.as_user('sofia_mdq');

  select remaining into v_restante
  from public.quota_summary(v_sofia)
  where level = v_nivel and content_type = 'claim';
  perform pg_temp.ok(v_restante is not null, 'un usuario común tiene cuota (no es NULL)');
  perform pg_temp.ok(v_restante <= v_limite, 'el restante nunca supera el límite configurado');

  -- Se consume todo el cupo del mes…
  for i in 1..v_restante loop
    if i = 1 then
      insert into public.claims (community_id, author_id, title, description, category)
      values (v_mdp, v_sofia, 'Reclamo de prueba ' || i, 'Generado por rls_checks.sql', 'otro')
      returning id into v_first;
    else
      insert into public.claims (community_id, author_id, title, description, category)
      values (v_mdp, v_sofia, 'Reclamo de prueba ' || i, 'Generado por rls_checks.sql', 'otro');
    end if;
  end loop;

  perform pg_temp.ok(
    (select remaining = 0 from public.quota_summary(v_sofia)
      where level = v_nivel and content_type = 'claim'),
    'el cupo llega a cero después de consumirlo');

  perform pg_temp.ok(
    public.remove_own_content('claim', v_first),
    'el autor puede dar de baja una publicación propia aunque deje de ser visible');
  perform pg_temp.ok(
    (select remaining = 1 from public.quota_summary(v_sofia)
      where level = v_nivel and content_type = 'claim'),
    'una baja propia dentro de 24 horas devuelve el cupo');
  perform pg_temp.ok(
    not public.remove_own_content('claim', v_first)
    and not public.remove_own_content('claim', v_other),
    'la RPC no repite la baja ni permite tocar contenido ajeno');

  -- Se vuelve a consumir la unidad devuelta para comprobar el límite.
  insert into public.claims (community_id, author_id, title, description, category)
  values (v_mdp, v_sofia, 'Reemplazo del reclamo removido', 'Generado por rls_checks.sql', 'otro');

  -- …y el siguiente insert lo rechaza el trigger, no la aplicación.
  begin
    insert into public.claims (community_id, author_id, title, description, category)
    values (v_mdp, v_sofia, 'Uno de más', 'Debería rechazarse.', 'otro');
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'el trigger rechaza el insert que excede la cuota');

  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 7 · Moderación no consume cuota
-- =============================================================================
do $$
declare v_mod uuid; v_remaining integer;
begin
  raise notice '── 7 · moderación sin tope ──';
  perform pg_temp.as_owner();
  select id into v_mod from public.profiles where username = 'mod_nacional';
  perform pg_temp.as_user_aal2('mod_nacional');
  select remaining into v_remaining
  from public.quota_summary(v_mod)
  where level = 2 and content_type = 'poll';

  perform pg_temp.ok(
    v_remaining is null,
    'un moderador no tiene tope (quota_summary devuelve NULL)');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 8 · Restauración de moderación y privacidad de perfiles (0012)
-- =============================================================================
do $$
declare
  v_project_id uuid;
  v_project_before text;
  v_project_after text;
  v_poll_id uuid;
  v_poll_before text;
  v_poll_after text;
begin
  raise notice '── 8.1 · restaurar contenido conserva el estado anterior ──';
  perform pg_temp.as_owner();
  select id, status into v_project_id, v_project_before
  from public.projects
  where status <> 'removed'
  order by created_at asc
  limit 1;
  select id, status into v_poll_id, v_poll_before
  from public.polls
  where status <> 'removed'
  order by created_at asc
  limit 1;

  perform pg_temp.as_user_aal2('mod_nacional');
  update public.projects set status = 'removed' where id = v_project_id;
  -- `proposal` es el fallback válido que manda la action; el trigger repone el
  -- estado original aunque fuera funding, in_progress o completed.
  update public.projects set status = 'proposal' where id = v_project_id;
  select status into v_project_after from public.projects where id = v_project_id;
  perform pg_temp.ok(
    v_project_after = v_project_before,
    'un proyecto vuelve a su estado previo y no a un estado inventado');

  update public.polls set status = 'removed' where id = v_poll_id;
  -- `active` es el fallback válido de encuestas; el trigger conserva closed si
  -- ese era el estado antes de ocultarla.
  update public.polls set status = 'active' where id = v_poll_id;
  select status into v_poll_after from public.polls where id = v_poll_id;
  perform pg_temp.ok(
    v_poll_after = v_poll_before,
    'una encuesta vuelve a su estado previo y no queda en open');

  perform pg_temp.as_owner();
end $$;

do $$
declare
  v_diego uuid;
  v_raw_rows int;
  v_public_rows int;
begin
  raise notice '── 8.2 · perfiles: residencia privada, identidad pública segura ──';
  perform pg_temp.as_owner();
  select id into v_diego from public.profiles where username = 'diego_mza';

  perform pg_temp.as_anon();
  select count(*) into v_raw_rows from public.profiles where id = v_diego;
  perform pg_temp.ok(v_raw_rows = 0, 'anon no puede leer profiles ni inferir home_community_id');

  select count(*) into v_public_rows from public.public_profile(v_diego);
  perform pg_temp.ok(v_public_rows = 1, 'anon obtiene la identidad pública sólo por la función segura');

  perform pg_temp.as_user('sofia_mdq');
  select count(*) into v_raw_rows from public.profiles where id = v_diego;
  perform pg_temp.ok(v_raw_rows = 0, 'un usuario tampoco puede leer la residencia cruda de otra persona');

  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 9 · Identidad pública opcional (0011): miembros y voto público
-- =============================================================================
do $$
declare
  v_diego   uuid;
  v_visible int;
begin
  raise notice '── 8.1 · listado de miembros: la tabla cruda es privada ──';
  perform pg_temp.as_owner();
  select id into v_diego from public.profiles where username = 'diego_mza';

  -- Diego sólo tiene un opt-in público en Mendoza; la ausencia de fila en
  -- cualquier otra comunidad significa anonimato.
  perform pg_temp.as_user('sofia_mdq');
  select count(*) into v_visible
  from public.community_visibility where user_id = v_diego;
  perform pg_temp.ok(
    v_visible = 0,
    'otro usuario no puede leer la fila de preferencia de Diego (revelaría su anonimato)');

  perform pg_temp.as_user('diego_mza');
  select count(*) into v_visible
  from public.community_visibility where user_id = v_diego;
  perform pg_temp.ok(v_visible > 0, 'Diego sí puede leer su propia preferencia');

  perform pg_temp.as_owner();
end $$;

do $$
declare
  v_diego     uuid;
  v_argentina uuid;
  v_mendoza   uuid;
  v_la_plata  uuid;
  v_public    int;
  v_anon      bigint;
  v_small     bigint;
begin
  raise notice '── 8.2 · community_public_members respeta la preferencia por comunidad ──';
  perform pg_temp.as_owner();
  select id into v_diego     from public.profiles where username = 'diego_mza';
  select id into v_argentina from public.communities where slug = 'argentina';
  select id into v_mendoza   from public.communities where slug = 'mendoza';
  select id into v_la_plata  from public.communities where slug = 'la-plata';

  perform pg_temp.as_anon();

  select count(*) into v_public
  from public.community_public_members(v_argentina, null, 500)
  where user_id = v_diego;
  perform pg_temp.ok(
    v_public = 0,
    'Diego pidió anonimato en Argentina: no aparece con identidad en el listado');

  select count(*) into v_public
  from public.community_public_members(v_mendoza, null, 500)
  where user_id = v_diego;
  perform pg_temp.ok(
    v_public = 1,
    'Diego NO pidió anonimato en Mendoza (la preferencia es por comunidad, no global): sí aparece');

  select anonymous_count into v_anon
  from public.community_member_visibility_counts(v_argentina);
  select anonymous_count into v_small
  from public.community_member_visibility_counts(v_la_plata);
  perform pg_temp.ok(
    v_anon = 5,
    'los anónimos de Argentina se informan como piso en bloques de cinco');
  perform pg_temp.ok(
    v_small = -1,
    'entre una y cuatro membresías anónimas se informa presencia sin cantidad exacta');

  perform pg_temp.as_owner();
end $$;

do $$
declare
  v_sofia     uuid;
  v_cordoba   uuid;
  v_rechazado boolean := false;
begin
  raise notice '── 8.3 · no se puede fijar visibilidad en una comunidad ajena ──';
  perform pg_temp.as_owner();
  select id into v_sofia   from public.profiles where username = 'sofia_mdq';
  select id into v_cordoba from public.communities where slug = 'cordoba';

  perform pg_temp.as_user('sofia_mdq');
  begin
    insert into public.community_visibility (user_id, community_id, is_anonymous)
    values (v_sofia, v_cordoba, true);
  exception when others then v_rechazado := true;
  end;
  perform pg_temp.ok(v_rechazado, 'Sofía no puede configurar su visibilidad en Córdoba: no vive ahí');

  perform pg_temp.as_owner();
end $$;

do $$
declare
  v_poll         uuid := 'a0000000-0000-4000-8000-000000000001';
  v_receipts     bigint;
  v_selections   bigint;
  v_participants bigint;
begin
  raise notice '── 8.4 · sólo recibos y tallies agregados ──';
  perform pg_temp.as_owner();
  select count(*) into v_receipts
  from public.poll_participation_receipts where poll_id = v_poll;
  select coalesce(sum(votes), 0), coalesce(max(participants), 0)
  into v_selections, v_participants
  from private.poll_option_tallies where poll_id = v_poll;

  perform pg_temp.ok(
    v_receipts = v_selections and v_receipts = v_participants,
    'el seed conserva una constancia por persona y sólo preferencias agregadas');
  perform pg_temp.ok(
    not has_table_privilege('service_role', 'private.poll_option_tallies', 'select')
    and not has_table_privilege(
      'service_role', 'private.budget_proposal_tallies', 'select'
    ),
    'ni service_role recibe lectura directa de los tallies privados');

end $$;

-- =============================================================================
-- 10 · Búsqueda global y aprobación automática de comunidades (0020)
-- =============================================================================
do $$
declare
  v_matches int;
  v_removed int;
begin
  raise notice '── 10.1 · búsqueda pública segura y sin acentos ──';
  perform pg_temp.as_anon();
  select count(*), count(*) filter (where status = 'removed')
    into v_matches, v_removed
  from public.global_search('cordoba', null, null, null, 20, 0);
  perform pg_temp.ok(v_matches > 0, 'buscar cordoba encuentra Córdoba aunque el input no tenga tilde');
  perform pg_temp.ok(v_removed = 0, 'la búsqueda global nunca expone contenido removido');
  perform pg_temp.as_owner();
end $$;

do $$
declare
  v_sofia uuid;
  v_parent uuid;
  v_request uuid;
  v_created uuid;
  v_slug text;
  v_level smallint;
  v_path text;
  v_status text;
  v_rejected boolean := false;
begin
  raise notice '── 10.2 · aprobación transaccional de comunidades ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_parent from public.communities where slug = 'buenos-aires';
  insert into public.community_requests (
    user_id, requested_name, country, parent_community_id, requested_level, reason
  ) values (
    v_sofia, 'Ciudad de Prueba Automatizada', 'Argentina', v_parent, 'city',
    'Solicitud temporal para verificar el flujo automático de creación de comunidades.'
  ) returning id into v_request;

  perform pg_temp.as_user('sofia_mdq');
  begin
    perform public.approve_community_request(v_request, v_parent);
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un usuario común no puede aprobar su propia solicitud');

  perform pg_temp.as_user_aal2('mod_nacional');
  select id, slug, level, path into v_created, v_slug, v_level, v_path
  from public.approve_community_request(
    v_request, v_parent, 'ciudad-prueba-automatizada', '🧪',
    'Comunidad creada dentro de una prueba transaccional.', -38.0, -57.0,
    'Aprobada automáticamente por la prueba.'
  );

  perform pg_temp.as_owner();
  select status into v_status from public.community_requests where id = v_request;
  perform pg_temp.ok(v_created is not null, 'la aprobación crea una comunidad en la misma transacción');
  perform pg_temp.ok(v_level = 4, 'una ciudad debajo de una provincia recibe nivel 4');
  perform pg_temp.ok(v_path like 'earth.south-america.argentina.buenos-aires.%', 'el path se deriva de la comunidad superior');
  perform pg_temp.ok(v_status = 'approved', 'la solicitud queda aprobada y enlazada al nuevo nodo');
end $$;

-- =============================================================================
-- 11 · Resúmenes IA server-only y resultados ligados a auth.uid() (0023-0025)
-- =============================================================================
do $$
begin
  raise notice '── 11.1 · privilegios de la cache y RPC de IA ──';
  perform pg_temp.as_owner();

  perform pg_temp.ok(
    not has_table_privilege('anon', 'public.ai_summaries', 'select')
    and not has_table_privilege('authenticated', 'public.ai_summaries', 'select'),
    'anon/authenticated no pueden enumerar versiones de ai_summaries');
  perform pg_temp.ok(
    has_table_privilege('service_role', 'public.ai_summaries', 'select'),
    'sólo el backend service_role puede leer la cache de resúmenes');
  perform pg_temp.ok(
    not has_table_privilege('anon', 'public.ai_summary_generation_jobs', 'select')
    and not has_table_privilege('authenticated', 'public.ai_summary_generation_jobs', 'select')
    and not has_table_privilege('anon', 'public.ai_summary_generation_events', 'select')
    and not has_table_privilege('authenticated', 'public.ai_summary_generation_events', 'select'),
    'jobs y eventos de generación no tienen lectura desde el navegador');

  perform pg_temp.ok(
    not has_function_privilege(
      'anon',
      'public.begin_ai_summary_generation(uuid,text,uuid,text,text,integer,boolean)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.begin_ai_summary_generation(uuid,text,uuid,text,text,integer,boolean)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.complete_ai_summary_generation(text,uuid,text,text,uuid,text,jsonb,integer,text,boolean)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.fail_ai_summary_generation(uuid,text)',
      'execute'
    ),
    'las RPC que escriben cache/leases son exclusivas del backend');
end $$;

-- =============================================================================
-- 15 · Escrituras compuestas: nunca dejan media operación confirmada
-- =============================================================================
do $$
declare
  v_sofia       uuid;
  v_community   uuid;
  v_own_claim   uuid;
  v_other_claim uuid;
  v_poll        uuid;
  v_old_status  text;
  v_new_status  text;
  v_rejected    boolean;
begin
  raise notice '── 15 · escrituras de contenido atómicas ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_community from public.communities where slug = 'mar-del-plata';
  select id, status into v_own_claim, v_old_status
  from public.claims
  where author_id = v_sofia and status <> 'removed'
  limit 1;
  select id into v_other_claim
  from public.claims
  where author_id is distinct from v_sofia and status <> 'removed'
  limit 1;
  v_new_status := case when v_old_status = 'resolved' then 'in_progress' else 'resolved' end;

  perform pg_temp.as_user('sofia_mdq');

  v_rejected := false;
  begin
    perform public.create_poll_with_options(
      v_community, 'Encuesta que debe revertirse', '', 'single', 'comunidad',
      0::smallint, 'after_close',
      (statement_timestamp() + interval '1 day')::text,
      array['Opción válida', repeat('x', 121)]
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'una opción inválida rechaza la encuesta completa');
  perform pg_temp.ok(
    not exists (select 1 from public.polls where question = 'Encuesta que debe revertirse'),
    'si falla una opción no queda una encuesta huérfana');

  v_rejected := false;
  begin
    perform public.create_poll_with_options(
      v_community, 'Encuesta con resultados anticipados', '', 'single',
      'comunidad', 0::smallint, 'always',
      (statement_timestamp() + interval '1 day')::text,
      array['Primera', 'Segunda']
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza publicar resultados antes del cierre');

  v_rejected := false;
  begin
    perform public.create_poll_with_options(
      v_community, 'Encuesta sin cierre', '', 'single', 'comunidad',
      0::smallint, 'after_close', '', array['Primera', 'Segunda']
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC exige una fecha de cierre');

  v_poll := public.create_poll_with_options(
    v_community, 'Encuesta atómica válida', '', 'single', 'comunidad',
    0::smallint, 'after_close',
    (statement_timestamp() + interval '1 day')::text,
    array['Primera', 'Segunda']
  );
  perform pg_temp.ok(
    (select count(*) = 2 from public.poll_options where poll_id = v_poll),
    'la encuesta válida confirma sus dos opciones en la misma operación');

  v_rejected := false;
  begin
    perform public.create_project_with_relation(
      v_community, 'Proyecto que debe revertirse', 'Resumen temporal',
      'Plan temporal', 0, 'ARS', '', '', v_other_claim::text
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un vínculo no autorizado rechaza el proyecto');
  perform pg_temp.ok(
    not exists (select 1 from public.projects where title = 'Proyecto que debe revertirse'),
    'si falla el vínculo no queda un proyecto desvinculado');

  v_rejected := false;
  begin
    perform public.add_claim_event_with_status(
      v_own_claim, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'update',
      'Evento que debe revertirse', '', '', '', v_new_status
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un evento inválido rechaza toda la actualización');
  perform pg_temp.ok(
    (select status = v_old_status from public.claims where id = v_own_claim)
    and not exists (
      select 1 from public.claim_events
      where claim_id = v_own_claim and title = 'Evento que debe revertirse'
    ),
    'el reclamo conserva su estado si no se puede guardar el historial');

  v_rejected := false;
  begin
    perform public.add_claim_event_with_status(
      v_own_claim, '', 'update', 'Cambio de estado por autor', '', '', '', v_new_status
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected and (select status = v_old_status from public.claims where id = v_own_claim),
    'el autor no puede atribuirse una transición institucional');

  perform public.add_claim_event_with_status(
    v_own_claim, '', 'update', 'Actualización del autor', '', '', '', ''
  );
  perform pg_temp.ok(
    (select status = v_old_status from public.claims where id = v_own_claim)
    and exists (
      select 1 from public.claim_events
      where claim_id = v_own_claim and title = 'Actualización del autor'
    ),
    'el autor puede agregar historial sin alterar el estado institucional');

  perform pg_temp.as_user_aal2('mod_nacional');
  perform public.add_claim_event_with_status(
    v_own_claim, '', 'update', 'Evento atómico válido', '', '', '', v_new_status
  );
  perform pg_temp.ok(
    (select status = v_new_status from public.claims where id = v_own_claim)
    and exists (
      select 1 from public.claim_events
      where claim_id = v_own_claim and title = 'Evento atómico válido'
    ),
    'un cambio válido confirma estado e historial juntos');

  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 26 · Contratos reales de PostgREST y campos sellados
-- =============================================================================
do $$
declare
  v_sofia uuid;
  v_mod uuid;
  v_mdp uuid;
  v_ba uuid;
  v_poll uuid;
  v_option uuid;
  v_debate uuid;
  v_comment uuid;
  v_project uuid;
  v_milestone uuid;
  v_claim uuid;
  v_report uuid;
  v_budget uuid;
  v_source_user uuid;
  v_source_mod uuid;
  v_rejected boolean;
  v_rows integer;
begin
  raise notice '── 26 · payloads reales, RPC atómicas y sellado DB ──';
  perform pg_temp.as_owner();

  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_mdp from public.communities where slug = 'mar-del-plata';
  select id into v_ba from public.communities where slug = 'buenos-aires';

  perform pg_temp.ok(
    not exists (
      select 1 from information_schema.role_table_grants g
      where g.grantee = 'anon' and g.table_schema = 'public'
        and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    )
    and not exists (
      select 1 from information_schema.role_column_grants g
      where g.grantee = 'anon' and g.table_schema = 'public'
        and g.privilege_type in ('INSERT', 'UPDATE')
    ),
    'anon no conserva ningún privilegio DML en el esquema público');

  perform pg_temp.ok(
    not has_table_privilege('authenticated', 'public.communities', 'insert')
    and not has_table_privilege('authenticated', 'public.communities', 'update')
    and not has_table_privilege('authenticated', 'public.communities', 'delete')
    and not has_table_privilege('authenticated', 'public.community_info', 'insert')
    and not has_table_privilege('authenticated', 'public.content_quotas', 'update')
    and not has_table_privilege('authenticated', 'public.organizations', 'insert')
    and not has_table_privilege('authenticated', 'public.organization_members', 'update')
    and not has_table_privilege('authenticated', 'public.activation_events', 'delete'),
    'tablas estructurales y operativas sólo se mutan por RPC o rol confiable');

  perform pg_temp.ok(
    has_column_privilege(
      'authenticated', 'public.community_budgets', 'title', 'insert'
    )
    and not has_column_privilege(
      'authenticated', 'public.community_budgets', 'created_by', 'insert'
    )
    and not has_column_privilege(
      'authenticated', 'public.community_budgets', 'created_at', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.community_budgets', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.community_budgets', 'delete'
    )
    and has_column_privilege(
      'authenticated', 'public.reports', 'status', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.reports', 'reason', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.reports', 'resolved_at', 'update'
    )
    and has_column_privilege(
      'authenticated', 'public.project_milestones', 'status', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.project_milestones', 'completed_at', 'update'
    ),
    'presupuestos, reportes e hitos exponen sólo campos de entrada');

  perform pg_temp.ok(
    not has_column_privilege(
      'authenticated', 'public.project_contributions', 'updated_at', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.community_requests', 'reviewed_by', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.community_requests', 'reviewed_at', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.organization_requests', 'reviewed_by', 'update'
    )
    and not has_column_privilege(
      'authenticated', 'public.organization_requests', 'reviewed_at', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'insert'
    )
    and not has_column_privilege(
      'authenticated', 'public.content_sources', 'verified_at', 'insert'
    ),
    'timestamps, revisores y recibos sellados quedan fuera del payload');

  perform pg_temp.ok(
    has_column_privilege(
      'authenticated', 'public.moderation_audit_log', 'id', 'select'
    )
    and has_column_privilege(
      'authenticated', 'public.moderation_audit_log', 'target_type', 'select'
    )
    and not has_column_privilege(
      'authenticated', 'public.moderation_audit_log', 'metadata', 'select'
    )
    and not has_table_privilege(
      'authenticated', 'public.moderation_audit_log', 'select'
    ),
    'moderación lee trazabilidad pero no la metadata operativa');

  perform pg_temp.ok(
    to_regclass('public.activation_events_id_seq') is not null
    and to_regclass('public.moderation_audit_log_id_seq') is not null
    and (
      select bool_and(pg_get_userbyid(c.relowner) = 'postgres')
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'activation_events_id_seq',
          'moderation_audit_log_id_seq'
        )
        and c.relkind = 'S'
    ),
    'las secuencias operativas esperadas existen y pertenecen a postgres');

  perform pg_temp.ok(
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, acldefault('S', c.relowner))
      ) acl
      where n.nspname = 'public'
        and (
          (
            c.relname = 'activation_events_id_seq'
            and pg_get_userbyid(acl.grantee) = 'anon'
          )
          or (
            c.relname = 'moderation_audit_log_id_seq'
            and pg_get_userbyid(acl.grantee) in (
              'anon', 'authenticated', 'service_role'
            )
          )
        )
        and acl.privilege_type in ('SELECT', 'USAGE')
    ),
    'las ocho ACL de secuencias no versionadas permanecen revocadas');

  perform pg_temp.ok(
    (
      select count(*)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(
        coalesce(c.relacl, acldefault('S', c.relowner))
      ) acl
      where n.nspname = 'public'
        and c.relname = 'activation_events_id_seq'
        and pg_get_userbyid(acl.grantee) in (
          'authenticated', 'service_role'
        )
        and acl.privilege_type in ('SELECT', 'USAGE')
    ) = 4,
    '0061 preserva las cuatro ACL de activación autorizadas por 0031');

  perform pg_temp.ok(
    has_function_privilege(
      'authenticated', 'public.set_comment_vote(uuid,smallint)', 'execute'
    )
    and has_function_privilege(
      'authenticated', 'public.set_project_pledge(uuid,numeric,text)', 'execute'
    )
    and has_function_privilege(
      'authenticated', 'public.set_community_visibility(uuid,boolean)', 'execute'
    )
    and not has_function_privilege(
      'anon', 'public.set_comment_vote(uuid,smallint)', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.set_project_pledge(uuid,numeric,text)', 'execute'
    ),
    'las RPC de preferencia/voto pertenecen sólo a la sesión autenticada');

  insert into public.polls (
    community_id, author_id, question, description, type,
    results_visibility, closes_at
  ) values (
    v_mdp, v_sofia, 'Encuesta temporal de contrato',
    'Comprueba el payload real sin poll_type.', 'single', 'after_close',
    now() + interval '1 day'
  ) returning id into v_poll;
  insert into public.poll_options (poll_id, label, sort_order)
  values (v_poll, 'Primera opción', 0) returning id into v_option;
  insert into public.poll_options (poll_id, label, sort_order)
  values (v_poll, 'Segunda opción', 1);

  insert into public.debates (community_id, author_id, title, body)
  values (
    v_ba, v_sofia, 'Debate temporal de contrato',
    'Contenido suficiente para probar el voto de comentarios.'
  ) returning id into v_debate;
  insert into public.debate_comments (
    debate_id, column_community_id, user_id, body
  ) values (
    -- D127: la columna de un debate provincial es la hija directa; desde 0076
    -- la de Sofía es General Pueyrredón, que contiene a Mar del Plata.
    v_debate,
    (select parent_id from public.communities where id = v_mdp),
    v_sofia, 'Comentario temporal para votar.'
  ) returning id into v_comment;

  insert into public.projects (
    community_id, author_id, title, summary, plan, currency
  ) values (
    v_mdp, v_sofia, 'Proyecto temporal de contratos',
    'Resumen temporal del proyecto.',
    'Plan temporal suficiente para validar los contratos.', 'ARS'
  ) returning id into v_project;
  insert into public.project_milestones (
    project_id, title, description, sort_order
  ) values (
    v_project, 'Hito temporal sellado', 'Comprueba completed_at.', 0
  ) returning id into v_milestone;

  insert into public.claims (
    community_id, author_id, title, description, category
  ) values (
    v_mdp, v_sofia, 'Reclamo temporal para contratos',
    'Contenido temporal que permite probar fuentes y reportes.', 'otro'
  ) returning id into v_claim;

  perform pg_temp.as_user('sofia_mdq');
  perform public.cast_poll_ballot(v_poll, array[v_option]);
  perform pg_temp.ok(
    (select has_voted from public.poll_stats(v_poll)),
    'el payload de la app emite el recibo y actualiza los tallies en una única RPC');

  perform public.set_comment_vote(v_comment, 1::smallint);
  perform public.set_comment_vote(v_comment, -1::smallint);
  perform pg_temp.ok(
    (select count(*) = 1 and min(value) = -1
      from public.comment_votes
      where comment_id = v_comment and user_id = v_sofia)
    and (select score = -1 from public.debate_comments where id = v_comment),
    'set_comment_vote actualiza una sola fila y conserva el agregado');

  perform public.set_project_pledge(v_project, 10, ' primer mensaje ');
  perform public.set_project_pledge(v_project, 25, '');
  perform pg_temp.ok(
    (select count(*) = 1 and min(amount) = 25 and min(message) is null
      from public.project_pledges
      where project_id = v_project and user_id = v_sofia)
    and (select pledged_total = 25 from public.projects where id = v_project),
    'set_project_pledge reemplaza monto/mensaje sin tocar las claves');

  perform public.set_community_visibility(v_mdp, true);
  perform public.set_community_visibility(v_mdp, false);
  perform pg_temp.ok(
    (select count(*) = 1 and not bool_or(is_anonymous)
      from public.community_visibility
      where community_id = v_mdp and user_id = v_sofia),
    'set_community_visibility actualiza la preferencia sin duplicarla');

  insert into public.content_sources (
    content_type, content_id, added_by, title, url
  ) values (
    'claim', v_claim, v_sofia, 'Fuente de la persona autora',
    'https://example.test/fuente-persona'
  ) returning id into v_source_user;
  perform pg_temp.ok(
    (select verified_at is null
      and created_at > clock_timestamp() - interval '1 minute'
      from public.content_sources where id = v_source_user),
    'una fuente normal usa reloj DB y no se autoverifica');

  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_sofia, 'claim', v_claim, 'Motivo original e inmutable')
  returning id into v_report;

  v_rejected := false;
  begin
    update public.project_milestones
    set status = 'completed', completed_at = now() + interval '100 years'
    where id = v_milestone;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el cliente no controla completed_at');
  update public.project_milestones set status = 'completed'
  where id = v_milestone;
  perform pg_temp.ok(
    (select status = 'completed'
      and completed_at between clock_timestamp() - interval '1 minute'
        and clock_timestamp()
      from public.project_milestones where id = v_milestone),
    'el estado completed deriva su timestamp en la base');
  v_rejected := false;
  begin
    update public.project_milestones set status = 'pending'
    where id = v_milestone;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un hito completado no salta a pending');

  perform pg_temp.as_user_aal2('mod_nacional');
  insert into public.content_sources (
    content_type, content_id, added_by, title, url
  ) values (
    'claim', v_claim, v_mod, 'Fuente verificada por moderación',
    'https://example.test/fuente-moderacion'
  ) returning id into v_source_mod;
  perform pg_temp.ok(
    (select verified_at between clock_timestamp() - interval '1 minute'
        and clock_timestamp()
      from public.content_sources where id = v_source_mod),
    'la base verifica la fuente agregada por moderación');

  v_rejected := false;
  begin
    update public.reports
    set status = 'reviewing', reason = 'Motivo reemplazado'
    where id = v_report;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'moderación no puede reescribir la denuncia');
  update public.reports set status = 'reviewing' where id = v_report;
  perform pg_temp.ok(
    (select status = 'reviewing' and resolved_at is null and resolved_by is null
      from public.reports where id = v_report),
    'reviewing no simula una resolución');
  update public.reports set status = 'resolved' where id = v_report;
  perform pg_temp.ok(
    (select status = 'resolved' and resolved_by = v_mod
      and resolved_at between clock_timestamp() - interval '1 minute'
        and clock_timestamp()
      from public.reports where id = v_report),
    'la resolución deriva actor y timestamp');
  v_rejected := false;
  begin
    update public.reports set status = 'pending' where id = v_report;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un reporte resuelto no vuelve a pending');

  insert into public.community_budgets (
    community_id, title, description, amount, currency,
    tokens_per_voter, max_tokens_per_proposal,
    proposals_close_at, voting_opens_at, voting_closes_at, report_due_at
  ) values (
    v_mdp, 'Partida temporal sellada', 'Prueba del payload real.', 1000, 'ARS',
    10, 4, now() + interval '1 day', now() + interval '2 days',
    now() + interval '3 days', now() + interval '4 days'
  ) returning id into v_budget;
  -- `created_by` es trazabilidad operativa y 0054 ya no la publica por REST.
  -- La prueba del sello se hace con el rol dueño y luego vuelve a la sesión
  -- moderadora para comprobar los privilegios reales del navegador.
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select created_by = v_mod
      and created_at between clock_timestamp() - interval '1 minute'
        and clock_timestamp()
      from public.community_budgets where id = v_budget),
    'una partida deriva creador y reloj en la base');
  perform pg_temp.as_user_aal2('mod_nacional');

  v_rejected := false;
  begin
    update public.community_budgets set amount = 999999 where id = v_budget;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'las partidas no admiten UPDATE directo');

  v_rejected := false;
  begin
    update public.communities
    set member_count = 2147483647, created_at = '2000-01-01'
    where id = v_mdp;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'moderación no puede falsificar una comunidad por REST');

  perform pg_temp.as_owner();
  select count(*) into v_rows
  from public.moderation_audit_log
  where target_type in ('reports', 'community_budgets', 'content_sources')
    and moderator_id = v_mod;
  perform pg_temp.ok(
    v_rows >= 4,
    'fuentes, reportes y partidas moderadas dejan auditoría');
end $$;

-- =============================================================================
-- 26 · Límites autoritativos, cron privado y avatar propio (0043)
-- =============================================================================
do $$
declare
  v_sofia uuid;
  v_mdp uuid;
  v_rate_project uuid;
  v_rate_claim uuid;
  v_cap_project uuid;
  v_cap_claim uuid;
  v_rejected boolean;
  v_bad integer;
  v_avatar_path text;
  v_table text;
  v_ghost constant uuid := '43434343-4343-4434-8434-434343434343';
begin
  raise notice '── 26 · límites autoritativos y capacidades operativas ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_mdp from public.communities where slug = 'mar-del-plata';

  insert into public.projects (
    community_id, author_id, title, summary, plan, currency
  ) values (
    v_mdp, v_sofia, 'Proyecto temporal de ventanas',
    'Proyecto aislado para probar límites horarios.',
    'Plan temporal para la prueba adversarial.', 'ARS'
  ) returning id into v_rate_project;
  insert into public.claims (
    community_id, author_id, title, description, category
  ) values (
    v_mdp, v_sofia, 'Reclamo temporal de ventanas',
    'Reclamo aislado para probar límites horarios.', 'otro'
  ) returning id into v_rate_claim;

  -- Las restricciones universales deben rechazar payloads que la UI limpia.
  v_rejected := false;
  begin
    insert into public.project_comments (project_id, user_id, body)
    values (v_rate_project, v_sofia, '   ');
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'comentarios de sólo espacios se rechazan en DB');

  v_rejected := false;
  begin
    insert into public.claim_events (claim_id, actor_id, title, body)
    values (v_rate_claim, v_sofia, 'Evento inválido', repeat('x', 3001));
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el cuerpo de un evento no supera 3.000 caracteres');

  v_rejected := false;
  begin
    insert into public.content_sources (
      content_type, content_id, added_by, title, url, publisher
    ) values (
      'project', v_rate_project, v_sofia, 'Fuente inválida',
      'https://example.test/fuente', repeat('p', 121)
    );
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'publisher de una fuente no supera 120 caracteres');

  v_rejected := false;
  begin
    insert into public.project_milestones (
      project_id, title, description, sort_order
    ) values (v_rate_project, 'Hito inválido', repeat('m', 1001), 0);
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la descripción de un hito queda acotada');

  v_rejected := false;
  begin
    insert into public.project_tasks (
      project_id, title, description, skills_needed
    ) values (v_rate_project, 'Tarea inválida', 'Descripción.', repeat('s', 301));
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'las habilidades de una tarea quedan acotadas');

  v_rejected := false;
  begin
    insert into public.project_contributions (
      project_id, user_id, kind, description, quantity, unit
    ) values (
      v_rate_project, v_sofia, 'time', 'Cantidad infinita inválida.',
      'Infinity'::numeric, 'horas'
    );
  exception
    when check_violation or numeric_value_out_of_range then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un aporte no admite cantidades no finitas');

  -- REST, RPC y columna agregada comparten el mismo contrato monetario.
  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    insert into public.project_pledges (project_id, user_id, amount)
    values (v_rate_project, v_sofia, 'Infinity'::numeric);
  exception
    when check_violation or numeric_value_out_of_range then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'REST no admite compromisos infinitos');

  v_rejected := false;
  begin
    perform public.set_project_pledge(v_rate_project, 1000000000.01, 'Excede');
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC limita cada compromiso a mil millones');

  perform pg_temp.as_owner();
  v_rejected := false;
  begin
    update public.projects
    set pledged_total = 'Infinity'::numeric
    where id = v_rate_project;
  exception
    when check_violation or numeric_value_out_of_range then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el agregado del proyecto siempre es finito');

  -- Prellenar las ventanas permite probar cada rama sin hacer 200 requests.
  insert into private.abuse_windows (
    scope, actor_id, window_started_at, hits
  )
  select limits.scope, v_sofia,
    date_bin(limits.duration, clock_timestamp(), timestamptz '2000-01-01'),
    limits.hits
  from (values
    ('project-comments-minute', 10, interval '1 minute'),
    ('claim-events-hour', 30, interval '1 hour'),
    ('content-sources-hour', 30, interval '1 hour'),
    ('content-relations-hour', 30, interval '1 hour'),
    ('project-milestones-hour', 20, interval '1 hour'),
    ('project-tasks-hour', 60, interval '1 hour'),
    ('project-contributions-hour', 20, interval '1 hour')
  ) limits(scope, hits, duration)
  on conflict (scope, actor_id, window_started_at) do update
    set hits = excluded.hits;

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    insert into public.project_comments (project_id, user_id, body)
    values (v_rate_project, v_sofia, 'Supera la ventana por minuto.');
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'comentarios de proyecto aplican 10 por minuto');

  v_rejected := false;
  begin
    perform public.add_claim_event_with_status(
      v_rate_claim, '', 'update', 'Supera la ventana', '', '', '', ''
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'eventos de reclamo aplican 30 por hora');

  v_rejected := false;
  begin
    insert into public.content_sources (
      content_type, content_id, added_by, title, url
    ) values (
      'project', v_rate_project, v_sofia, 'Fuente temporal',
      'https://example.test/rate-source'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'fuentes aplican 30 altas por hora');

  v_rejected := false;
  begin
    insert into public.content_relations (
      source_type, source_id, target_type, target_id, relation_type, created_by
    ) values (
      'project', v_rate_project, 'claim', v_rate_claim, 'related', v_sofia
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'relaciones aplican 30 altas por hora');

  v_rejected := false;
  begin
    insert into public.project_milestones (project_id, title, sort_order)
    values (v_rate_project, 'Hito fuera de ventana', 1);
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'hitos aplican 20 altas por hora');

  v_rejected := false;
  begin
    insert into public.project_tasks (project_id, title)
    values (v_rate_project, 'Tarea fuera de ventana');
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'tareas aplican 60 altas por hora');

  v_rejected := false;
  begin
    insert into public.project_contributions (
      project_id, user_id, kind, description
    ) values (
      v_rate_project, v_sofia, 'skills', 'Aporte fuera de ventana.'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'aportes aplican 20 altas por hora');

  -- Datos de borde sin efectos secundarios: después se reactiva cada trigger
  -- y el request número límite+1 debe fallar por cupo, no por la UI.
  perform pg_temp.as_owner();
  delete from private.abuse_windows
  where actor_id = v_sofia and scope in (
    'project-comments-minute', 'claim-events-hour', 'content-sources-hour',
    'content-relations-hour', 'project-milestones-hour',
    'project-tasks-hour', 'project-contributions-hour'
  );
  insert into public.projects (
    community_id, author_id, title, summary, plan, currency
  ) values (
    v_mdp, v_sofia, 'Proyecto temporal de cupos',
    'Proyecto aislado para alcanzar los topes exactos.',
    'Plan temporal para la prueba de cupos.', 'ARS'
  ) returning id into v_cap_project;
  insert into public.claims (
    community_id, author_id, title, description, category
  ) values (
    v_mdp, v_sofia, 'Reclamo temporal de cupos',
    'Reclamo aislado para alcanzar los topes exactos.', 'otro'
  ) returning id into v_cap_claim;
  -- El alta normal del reclamo crea su evento inicial. El fixture de borde
  -- empieza en cero y deshabilita sólo triggers USER mientras carga volumen;
  -- constraints/FKs siguen activas y el intento 501 vuelve a usar todo.
  delete from public.claim_events where claim_id = v_cap_claim;
  foreach v_table in array array[
    'project_comments', 'claim_events', 'content_sources',
    'content_relations', 'project_milestones', 'project_tasks',
    'project_contributions'
  ] loop
    execute format('alter table public.%I disable trigger user', v_table);
  end loop;
  insert into public.project_comments (project_id, user_id, body)
  select v_cap_project, v_sofia, 'Comentario de borde ' || i
  from generate_series(1, 500) i;
  insert into public.claim_events (claim_id, actor_id, title)
  select v_cap_claim, v_sofia, 'Evento de borde ' || i
  from generate_series(1, 500) i;
  insert into public.content_sources (
    content_type, content_id, added_by, title, url
  )
  select 'project', v_cap_project, v_sofia, 'Fuente de borde ' || i,
    'https://example.test/cap-source/' || i
  from generate_series(1, 500) i;
  insert into public.content_relations (
    source_type, source_id, target_type, target_id, relation_type, created_by
  )
  select 'project', v_cap_project, 'claim', md5('relation-cap-' || i)::uuid,
    'related', v_sofia
  from generate_series(1, 500) i;
  insert into public.project_milestones (project_id, title, sort_order)
  select v_cap_project, 'Hito de borde ' || i, i
  from generate_series(1, 50) i;
  insert into public.project_tasks (project_id, title)
  select v_cap_project, 'Tarea de borde ' || i
  from generate_series(1, 200) i;
  insert into public.project_contributions (
    project_id, user_id, kind, description, quantity, unit
  )
  select v_cap_project, v_sofia, 'time', 'Aporte de borde ' || i, 1, 'hora'
  from generate_series(1, 100) i;
  foreach v_table in array array[
    'project_comments', 'claim_events', 'content_sources',
    'content_relations', 'project_milestones', 'project_tasks',
    'project_contributions'
  ] loop
    execute format('alter table public.%I enable trigger user', v_table);
  end loop;

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    insert into public.project_comments (project_id, user_id, body)
    values (v_cap_project, v_sofia, 'Comentario número 501.');
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'no hay más de 500 comentarios por cuenta/proyecto');

  v_rejected := false;
  begin
    perform public.add_claim_event_with_status(
      v_cap_claim, '', 'update', 'Evento número 501', '', '', '', ''
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un reclamo no acumula más de 500 eventos');

  v_rejected := false;
  begin
    insert into public.content_sources (
      content_type, content_id, added_by, title, url
    ) values (
      'project', v_cap_project, v_sofia, 'Fuente número 501',
      'https://example.test/cap-source/501'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un contenido no acumula más de 500 fuentes');

  v_rejected := false;
  begin
    insert into public.content_relations (
      source_type, source_id, target_type, target_id, relation_type, created_by
    ) values (
      'project', v_cap_project, 'claim', v_cap_claim, 'related', v_sofia
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un contenido no acumula más de 500 relaciones');

  v_rejected := false;
  begin
    insert into public.project_milestones (project_id, title, sort_order)
    values (v_cap_project, 'Hito número 51', 51);
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un proyecto no acumula más de 50 hitos');

  v_rejected := false;
  begin
    insert into public.project_tasks (project_id, title)
    values (v_cap_project, 'Tarea número 201');
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un proyecto no acumula más de 200 tareas');

  v_rejected := false;
  begin
    insert into public.project_contributions (
      project_id, user_id, kind, description
    ) values (
      v_cap_project, v_sofia, 'skills', 'Aporte número 101.'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'no hay más de 100 aportes por cuenta/proyecto');

  -- Avatar: sólo el handshake service_role registra bytes ya saneados. El
  -- perfil guarda la ruta mediada por Agorbis, nunca una URL pública de Storage.
  perform pg_temp.as_owner();
  v_avatar_path := v_sofia::text ||
    '/11111111-1111-4111-8111-111111111111.jpg';
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true
  );
  perform public.reserve_avatar_upload(v_sofia, v_avatar_path);
  perform pg_temp.as_owner();
  insert into storage.objects (bucket_id, name, owner_id)
  values ('avatars', v_avatar_path, v_sofia::text);
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.finalize_avatar_upload(v_sofia, v_avatar_path),
    'service_role sella el avatar saneado después de Storage'
  );
  perform pg_temp.as_user('sofia_mdq');
  update public.profiles
  set avatar_url = '/media/avatares/' || v_avatar_path
  where id = v_sofia;
  v_rejected := false;
  begin
    update public.profiles
    set avatar_url = 'https://evil.example/storage/v1/object/public/avatars/' ||
      v_avatar_path
    where id = v_sofia;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'avatar_url no acepta un origen de Storage copiado');

  v_rejected := false;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values (
      'avatars', v_sofia::text ||
        '/33333333-3333-4333-8333-333333333333.jpg', v_sofia::text
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'un JWT con perfil tampoco puede saltear el saneamiento de avatares'
  );

  -- Un JWT cuyo perfil ya no existe tampoco puede dejar bytes huérfanos.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_ghost::text, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);
  v_rejected := false;
  begin
    insert into storage.objects (bucket_id, name, owner_id) values (
      'avatars', v_ghost::text ||
        '/22222222-2222-4222-8222-222222222222.jpg', v_ghost::text
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un JWT sin profile no crea avatares huérfanos');

  perform pg_temp.as_owner();
  select count(*) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and (
      has_table_privilege('anon', c.oid, 'truncate')
      or has_table_privilege('anon', c.oid, 'references')
      or has_table_privilege('anon', c.oid, 'trigger')
      or has_table_privilege('authenticated', c.oid, 'truncate')
      or has_table_privilege('authenticated', c.oid, 'references')
      or has_table_privilege('authenticated', c.oid, 'trigger')
    );
  perform pg_temp.ok(v_bad = 0, 'roles web no tienen TRUNCATE, REFERENCES ni TRIGGER');
  perform pg_temp.ok(
    has_function_privilege(
      'service_role', 'public.sync_due_poll_notifications()', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.sync_due_poll_notifications()', 'execute'
    )
    and to_regclass('public.polls_active_due_idx') is not null,
    'el cierre global y su índice parcial pertenecen sólo al cron');

  -- service_role no puede iniciar IA para una cuenta sin consentimiento aunque
  -- el caller le pase un UUID válido y exista una cache.
  delete from public.user_legal_acceptances where user_id = v_sofia;
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true
  );
  v_rejected := false;
  begin
    perform * from public.begin_ai_summary_generation(
      v_sofia, 'project', v_rate_project, 'es', repeat('a', 64), 1, false
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'begin_ai exige participación al requester');

  -- Esta sección corre antes de pruebas históricas del archivo. Se limpia todo
  -- el volumen de borde para que sus conteos no alteren verificaciones ajenas.
  perform pg_temp.as_owner();
  delete from public.content_sources
  where content_type = 'project'
    and content_id in (v_rate_project, v_cap_project);
  delete from public.content_relations
  where (source_type = 'project'
      and source_id in (v_rate_project, v_cap_project))
     or (target_type = 'project'
      and target_id in (v_rate_project, v_cap_project))
     or (source_type = 'claim'
      and source_id in (v_rate_claim, v_cap_claim))
     or (target_type = 'claim'
      and target_id in (v_rate_claim, v_cap_claim));
  update public.profiles set avatar_url = null where id = v_sofia;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
  where bucket_id = 'avatars' and name = v_avatar_path;
  perform set_config('storage.allow_delete_query', 'false', true);
  delete from private.avatar_uploads where path = v_avatar_path;
  delete from public.projects where id in (v_rate_project, v_cap_project);
  delete from public.claims where id in (v_rate_claim, v_cap_claim);
  delete from private.abuse_windows
  where actor_id = v_sofia and scope in (
    'project-comments-minute', 'claim-events-hour', 'content-sources-hour',
    'content-relations-hour', 'project-milestones-hour',
    'project-tasks-hour', 'project-contributions-hour'
  );
  perform set_config('request.headers', '', true);
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.as_owner();
end $$;

do $$
begin
  raise notice '── 11.2 · resultados de encuestas ligados a la sesión ──';
  perform pg_temp.as_owner();

  perform pg_temp.ok(
    has_function_privilege(
      'anon', 'public.can_see_poll_results(uuid)', 'execute'
    )
    and has_function_privilege(
      'authenticated', 'public.can_see_poll_results(uuid)', 'execute'
    ),
    'la comprobación pública de resultados acepta sólo el ID de encuesta');
  perform pg_temp.ok(
    not has_function_privilege(
      'anon', 'public.can_see_poll_results(uuid,uuid)', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.can_see_poll_results(uuid,uuid)', 'execute'
    ),
    'el navegador no puede consultar la visibilidad usando el UUID de otra persona');
  perform pg_temp.ok(
    has_function_privilege(
      'service_role', 'public.can_see_poll_results(uuid,uuid)', 'execute'
    ),
    'la variante explícita queda reservada al backend confiable');
end $$;

-- =============================================================================
-- 12 · Presupuesto participativo: evaluación, voto atómico y rendición
-- =============================================================================
do $$
declare
  v_budget      uuid := 'ba000000-0000-4000-8000-000000000001';
  v_project     uuid := 'fa000000-0000-4000-8000-000000000003';
  v_proposal    uuid := 'bb000000-0000-4000-8000-000000000003';
  v_community   uuid;
  v_sofia       uuid;
  v_moderator   uuid;
  v_rows        integer;
begin
  raise notice '── 12.1 · evaluación de postulaciones ──';
  perform pg_temp.as_owner();
  select id into v_community from public.communities where slug = 'mar-del-plata';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_moderator from public.profiles where username = 'mod_nacional';

  insert into public.projects (
    id, community_id, author_id, title, summary, plan, currency
  ) values (
    v_project, v_community, v_sofia, 'Proyecto para evaluar',
    'Proyecto creado dentro de la prueba transaccional.',
    'Plan suficientemente detallado para probar la evaluación.', 'ARS'
  );

  insert into public.community_budgets (
    id, community_id, title, amount, currency,
    proposals_close_at, voting_opens_at, voting_closes_at, report_due_at
  ) values (
    v_budget, v_community, 'Ronda en evaluación', 1000, 'ARS',
    now() - interval '1 day', now() + interval '1 day',
    now() + interval '2 days', now() + interval '3 days'
  );

  insert into public.budget_proposals (
    id, budget_id, project_id, requested_amount
  ) values (v_proposal, v_budget, v_project, 500);

  perform pg_temp.as_user('sofia_mdq');
  update public.budget_proposals set admitted_at = now() where id = v_proposal;
  get diagnostics v_rows = row_count;
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rows = 0, 'el autor no puede admitir su propio proyecto');

  perform pg_temp.as_user_aal2('mod_nacional');
  update public.budget_proposals set admitted_at = now() where id = v_proposal;
  get diagnostics v_rows = row_count;
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rows = 1, 'moderación puede admitir durante la fase de evaluación');
  perform pg_temp.ok(
    (select admitted_by = v_moderator from public.budget_proposals where id = v_proposal),
    'la base sella quién tomó la decisión');
end $$;

do $$
declare
  v_budget      uuid := 'ba000000-0000-4000-8000-000000000002';
  v_project_1   uuid := 'fa000000-0000-4000-8000-000000000001';
  v_project_2   uuid := 'fa000000-0000-4000-8000-000000000002';
  v_proposal_1  uuid := 'bb000000-0000-4000-8000-000000000001';
  v_proposal_2  uuid := 'bb000000-0000-4000-8000-000000000002';
  v_community   uuid;
  v_sofia       uuid;
  v_rejected    boolean;
  v_rows        integer;
  v_total       integer;
  v_username    text;
begin
  raise notice '── 12.2 · reparto agregado, atómico e inmutable ──';
  perform pg_temp.as_owner();
  select id into v_community from public.communities where slug = 'argentina';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  update public.profiles
  set residence_changed_at = now() - interval '30 days'
  where username in (
    'sofia_mdq', 'bruno_lp', 'carla_cba', 'diego_mza', 'elena_caba'
  );

  insert into public.projects (
    id, community_id, author_id, title, summary, plan, currency
  ) values
    (v_project_1, v_community, v_sofia, 'Proyecto financiable uno',
     'Primera opción de la ronda de prueba.', 'Plan de la primera opción.', 'ARS'),
    (v_project_2, v_community, v_sofia, 'Proyecto financiable dos',
     'Segunda opción de la ronda de prueba.', 'Plan de la segunda opción.', 'ARS');

  insert into public.community_budgets (
    id, community_id, title, amount, currency,
    tokens_per_voter, max_tokens_per_proposal,
    proposals_close_at, voting_opens_at, voting_closes_at, report_due_at
  ) values (
    v_budget, v_community, 'Ronda en votación', 100, 'ARS', 10, 4,
    now() - interval '2 days', now() - interval '1 day',
    now() + interval '1 day', now() + interval '3 days'
  );

  insert into public.budget_proposals (
    id, budget_id, project_id, requested_amount, admitted_at
  ) values
    (v_proposal_1, v_budget, v_project_1, 100, now() - interval '1 day'),
    (v_proposal_2, v_budget, v_project_2, 200, now() - interval '1 day');

  perform pg_temp.as_anon();
  select count(*) into v_total from public.budget_results(v_budget);
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_total = 0, 'el agregado no se publica mientras la votación está abierta');
  perform pg_temp.ok(
    has_function_privilege('authenticated', 'public.cast_budget_ballot(uuid,jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.cast_budget_ballot(uuid,jsonb)', 'execute')
    and to_regprocedure('public.replace_budget_vote(uuid,jsonb)') is null
    and to_regclass('public.budget_votes') is null,
    'sólo una sesión autenticada puede emitir y no existe un reparto identificado');

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    perform public.cast_budget_ballot(
      v_budget,
      jsonb_build_object(v_proposal_1::text, 8)
    );
  exception when others then
    v_rejected := true;
  end;

  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rejected, 'la base rechaza un reparto que supera el tope por proyecto');
  perform pg_temp.ok(
    not exists (
      select 1 from public.budget_participation_receipts
      where budget_id = v_budget
    )
    and not exists (
      select 1 from private.budget_proposal_tallies where budget_id = v_budget
    ),
    'una emisión inválida no deja recibo ni incremento parcial');

  perform pg_temp.as_user('sofia_mdq');
  perform public.cast_budget_ballot(
    v_budget,
    jsonb_build_object(v_proposal_1::text, 3, v_proposal_2::text, 2)
  );

  v_rejected := false;
  begin
    perform public.cast_budget_ballot(
      v_budget,
      jsonb_build_object(v_proposal_1::text, 1)
    );
  exception when unique_violation then
    v_rejected := true;
  end;

  perform pg_temp.as_owner();
  select coalesce(sum(tokens), 0), count(*)
  into v_total, v_rows
  from private.budget_proposal_tallies
  where budget_id = v_budget;
  perform pg_temp.ok(v_rejected, 'una persona no puede emitir una segunda boleta');
  perform pg_temp.ok(
    v_total = 5 and v_rows = 2
    and (select min(participants) = 1 and max(participants) = 1
         from private.budget_proposal_tallies where budget_id = v_budget)
    and (select count(*) = 1 from public.budget_participation_receipts where budget_id = v_budget),
    'el recibo no contiene asignaciones y sólo quedan tallies por propuesta');

  v_rejected := false;
  begin
    update public.budget_proposals
    set requested_amount = requested_amount
    where id = v_proposal_1;
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'el conjunto de propuestas queda congelado desde la primera emisión');

  v_rejected := false;
  begin
    delete from public.budget_proposals where id = v_proposal_2;
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'ni un camino privilegiado puede borrar una propuesta después de emitir');

  -- Cerrar con una sola persona no publica ni siquiera cuántas participaron.
  update public.community_budgets
  set proposals_close_at = now() - interval '3 days',
      voting_opens_at = now() - interval '2 days',
      voting_closes_at = now() - interval '1 day',
      report_due_at = now() + interval '2 days'
  where id = v_budget;
  perform pg_temp.as_anon();
  select count(*) into v_rows from public.budget_results(v_budget);
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rows = 0, 'un presupuesto cerrado con menos de cinco personas sigue protegido');

  -- Se reabre sólo dentro de esta transacción de prueba para alcanzar el
  -- umbral; el producto no ofrece reapertura.
  update public.community_budgets
  set proposals_close_at = now() - interval '2 days',
      voting_opens_at = now() - interval '1 day',
      voting_closes_at = now() + interval '1 day',
      report_due_at = now() + interval '3 days'
  where id = v_budget;

  foreach v_username in array array[
    'bruno_lp', 'carla_cba', 'diego_mza', 'elena_caba'
  ]
  loop
    perform pg_temp.as_user(v_username);
    perform public.cast_budget_ballot(
      v_budget, jsonb_build_object(v_proposal_1::text, 1)
    );
  end loop;

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select count(*) = 5 from public.budget_participation_receipts where budget_id = v_budget)
    and (select count(*) = 2 and sum(tokens) = 9
              and min(participants) = 5 and max(participants) = 5
         from private.budget_proposal_tallies where budget_id = v_budget)
    and (select count(distinct xmin::text) = 1
         from private.budget_proposal_tallies where budget_id = v_budget),
    'cada emisión actualiza juntas todas las propuestas, incluidas las de +0');

  update public.community_budgets
  set proposals_close_at = now() - interval '3 days',
      voting_opens_at = now() - interval '2 days',
      voting_closes_at = now() - interval '1 day',
      report_due_at = now() + interval '2 days'
  where id = v_budget;

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    delete from public.budget_participation_receipts
    where budget_id = v_budget and user_id = v_sofia;
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rejected, 'nadie puede borrar su recibo ni recuperar la boleta');
  perform pg_temp.ok(
    (select count(*) = 2 from public.budget_results(v_budget)),
    'el agregado se vuelve público al cerrar');

  perform pg_temp.as_user('sofia_mdq');
  insert into public.budget_reports (
    budget_id, project_id, amount_spent, summary, author_id
  ) values (
    v_budget, v_project_1, 95,
    'Rendición válida del proyecto que efectivamente recibió la partida.', v_sofia
  );

  v_rejected := false;
  begin
    insert into public.budget_reports (
      budget_id, project_id, amount_spent, summary, author_id
    ) values (
      v_budget, v_project_2, 10,
      'Este proyecto no recibió fondos y no debería poder rendirlos.', v_sofia
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_rejected, 'un proyecto no financiado no puede publicar una rendición');

  delete from public.community_budgets where id = v_budget;
  perform pg_temp.ok(
    not exists (
      select 1 from public.budget_participation_receipts where budget_id = v_budget
    )
    and not exists (
      select 1 from private.budget_proposal_tallies where budget_id = v_budget
    ),
    'borrar la partida completa conserva las cascadas de recibos y tallies');
end $$;

-- =============================================================================
-- 13 · Escalamiento por silencio: sólo el backend y con historial completo
-- =============================================================================
do $$
declare
  v_claim_silent   uuid := 'ea000000-0000-4000-8000-000000000001';
  v_claim_answered uuid := 'ea000000-0000-4000-8000-000000000002';
  v_community      uuid;
  v_parent         uuid;
  v_sofia          uuid;
  v_organization   uuid := 'ca000000-0000-4000-8000-000000000001';
begin
  raise notice '── 13 · escalamiento automático por silencio ──';
  perform pg_temp.as_owner();
  select id, parent_id into v_community, v_parent
  from public.communities where slug = 'mar-del-plata';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';

  insert into public.organizations (
    id, community_id, name, slug, type, verified_at, verified_by
  ) values (
    v_organization, v_community, 'Institución de prueba',
    'institucion-escalamiento-prueba', 'government', now(), v_sofia
  );
  insert into public.organization_members (
    organization_id, user_id, role, added_by
  ) values (v_organization, v_sofia, 'representative', v_sofia);

  perform pg_temp.ok(
    not has_function_privilege('authenticated', 'public.escalate_silent_claims()', 'execute')
    and has_function_privilege('service_role', 'public.escalate_silent_claims()', 'execute'),
    'el cron de escalamiento no se puede disparar desde el navegador');

  insert into public.claims (
    id, community_id, author_id, title, description, category, created_at
  ) values
    (v_claim_silent, v_community, v_sofia, 'Reclamo sin respuesta de prueba',
     'Venció su plazo, tiene apoyo y debe escalar una sola vez.', 'otro',
     now() - interval '30 days'),
    (v_claim_answered, v_community, v_sofia, 'Reclamo respondido de prueba',
     'También venció, pero una institución ya acusó recibo.', 'otro',
     now() - interval '30 days');

  insert into public.claim_supports (claim_id, user_id)
  select v_claim_silent, id
  from public.profiles
  where username in ('sofia_mdq', 'admin_geo', 'bruno_lp');

  insert into public.claim_events (
    claim_id, actor_id, organization_id, event_type, title
  ) values (
    v_claim_answered, v_sofia, v_organization, 'official_response', 'Recibido'
  );

  perform public.escalate_silent_claims();

  perform pg_temp.ok(
    (select escalated_to_community_id = v_parent from public.claims where id = v_claim_silent),
    'el reclamo vencido y apoyado se muestra también en la comunidad padre');
  perform pg_temp.ok(
    (select escalated_at is null and first_response_at is not null
     from public.claims where id = v_claim_answered),
    'un acuse institucional detiene el reloj y evita el escalamiento');
  perform pg_temp.ok(
    (select count(*) = 1 from public.claim_events
     where claim_id = v_claim_silent and event_type = 'status_change'),
    'el escalamiento queda asentado una vez en la línea de tiempo');
  perform pg_temp.ok(
    (select count(*) = 3 from public.notifications
     where dedupe_key like 'claim:escalated:' || v_claim_silent::text || ':%'),
    'autor y apoyos reciben notificaciones deduplicadas');
end $$;

-- =============================================================================
-- 14 · Contraste: lectura pública sin reintroducir contenido removido
-- =============================================================================
do $$
declare
  v_parent    uuid;
  v_child     uuid;
  v_sofia     uuid;
  v_before    bigint;
  v_after     bigint;
begin
  raise notice '── 14 · contraste seguro entre comunidades hermanas ──';
  perform pg_temp.as_owner();
  select id into v_parent from public.communities where slug = 'buenos-aires';
  -- D127: Mar del Plata quedó un nivel más abajo y el contraste compara sólo
  -- hijas directas con reclamos. Se toma la primera que el contraste muestra.
  select child_id into v_child
  from public.sibling_claim_profile(v_parent)
  order by child_slug
  limit 1;
  perform pg_temp.ok(
    v_child is not null,
    'Buenos Aires tiene una hija directa con reclamos para contrastar');
  select id into v_sofia from public.profiles where username = 'sofia_mdq';

  perform pg_temp.ok(
    to_regprocedure('public.sibling_poll_contrast(uuid,integer)') is null
    and has_function_privilege('anon', 'public.sibling_claim_profile(uuid)', 'execute'),
    'el contraste de reclamos es público y el de votos fue eliminado para no reidentificar');

  perform pg_temp.as_anon();
  select claims_total into v_before
  from public.sibling_claim_profile(v_parent)
  where child_id = v_child;

  perform pg_temp.as_owner();
  insert into public.claims (
    community_id, author_id, title, description, category, status
  ) values (
    v_child, v_sofia, 'Reclamo removido de prueba',
    'No puede alterar ninguna métrica pública del contraste.', 'otro', 'removed'
  );

  perform pg_temp.as_anon();
  select claims_total into v_after
  from public.sibling_claim_profile(v_parent)
  where child_id = v_child;
  perform pg_temp.as_owner();
  perform pg_temp.ok(v_before = v_after, 'los reclamos removidos no alteran el contraste');
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15 · el tope de comentarios de un debate es POR COLUMNA (D66)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_parent uuid; v_debate uuid; v_sofia uuid;
  v_cols int; v_con_comentarios int; v_global int;
begin
  raise notice '── 15 · comentarios de debate por columna (D66) ──';

  select id into v_sofia from public.profiles where username = 'sofia_mdq';

  -- Una comunidad con al menos cuatro hijas, para que el reparto se note.
  select c.id into v_parent
  from public.communities c
  where (select count(*) from public.communities k where k.parent_id = c.id) >= 4
  limit 1;

  insert into public.debates (community_id, author_id, title, body)
  values (v_parent, v_sofia, 'Debate de prueba D66', 'cuerpo')
  returning id into v_debate;

  -- Tres comentarios por columna. Sólo la primera columna acumula puntaje: es
  -- el caso de la sub-comunidad chica que nunca entraba en un tope global.
  -- El cooldown entre comentarios es una regla de producto, no de esta prueba.
  set local session_replication_role = replica;
  insert into public.debate_comments
    (debate_id, column_community_id, user_id, body, score, status)
  select v_debate, k.id, v_sofia, 'comentario ' || n,
         case when k.rn = 1 then 100 - n else 0 end, 'visible'
  from (select id, row_number() over (order by id) rn
        from public.communities where parent_id = v_parent limit 4) k,
       generate_series(1, 3) n;
  set local session_replication_role = origin;

  select count(*) into v_cols
  from public.communities where parent_id = v_parent;

  -- Con un tope GLOBAL de 4 sólo aparecían las columnas mejor puntuadas.
  select count(distinct column_community_id) into v_global
  from (select column_community_id from public.debate_comments
        where debate_id = v_debate and status = 'visible'
        order by score desc, created_at desc limit 4) t;
  perform pg_temp.ok(v_global < 4,
    'un tope global deja columnas con actividad sin ningún comentario');

  -- Con el tope por columna, todas traen los suyos.
  select count(distinct column_community_id) into v_con_comentarios
  from public.debate_column_comments(v_debate, 2);
  perform pg_temp.ok(v_con_comentarios = 4,
    'cada sub-comunidad con actividad trae sus comentarios');

  perform pg_temp.ok(
    (select count(*) from public.debate_column_comments(v_debate, 2)) = 8,
    'el tope se aplica por columna y no al total');

  -- Los comentarios ocultos siguen ocultos: la función cambia cuántas filas
  -- se traen, no quién puede verlas.
  update public.debate_comments set status = 'removed'
  where debate_id = v_debate;
  perform pg_temp.ok(
    (select count(*) from public.debate_column_comments(v_debate, 20)) = 0,
    'un comentario removido no vuelve por la función nueva');

  delete from public.debate_comments where debate_id = v_debate;
  delete from public.debates where id = v_debate;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16 · apoyar un reclamo suscribe a sus novedades
-- ─────────────────────────────────────────────────────────────────────────────
-- No es una función nueva: `notify_claim_event` ya avisa a cada persona que
-- apoyó. Se fija acá porque la interfaz ahora lo promete por escrito, y una
-- promesa sin prueba se rompe en el primer refactor del trigger.
do $$
declare
  v_autor uuid; v_vecino uuid; v_com uuid; v_claim uuid;
  v_antes int; v_despues int;
begin
  raise notice '── 16 · apoyar un reclamo suscribe a sus novedades ──';

  select id into v_autor from public.profiles where username = 'sofia_mdq';
  select id into v_vecino from public.profiles where id <> v_autor limit 1;
  select home_community_id into v_com from public.profiles where id = v_autor;

  insert into public.claims (community_id, author_id, title, description, category)
  values (v_com, v_autor, 'Reclamo de prueba · suscripción',
          'Verifica que apoyar avise las novedades.', 'otro')
  returning id into v_claim;

  insert into public.claim_supports (claim_id, user_id) values (v_claim, v_vecino);
  select count(*) into v_antes
  from public.notifications where recipient_id = v_vecino;

  insert into public.claim_events
    (claim_id, actor_id, event_type, title, body, event_date)
  values (v_claim, v_autor, 'official_response', 'Respuesta oficial de prueba',
          'cuerpo', current_date);

  select count(*) into v_despues
  from public.notifications where recipient_id = v_vecino;

  perform pg_temp.ok(v_despues > v_antes,
    'quien apoyó un reclamo recibe sus actualizaciones');

  delete from public.notifications where recipient_id = v_vecino;
  delete from public.claim_events where claim_id = v_claim;
  delete from public.claim_supports where claim_id = v_claim;
  delete from public.claims where id = v_claim;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17 · las coordenadas de un reclamo van completas o no van
-- ─────────────────────────────────────────────────────────────────────────────
-- La acción del servidor descarta el par entero si le falta una mitad o si cae
-- fuera del planeta, pero esa validación es de la app: cualquier otra vía de
-- escritura —una carga masiva, un script de migración, la consola de Supabase—
-- la saltea. Lo que impide de verdad guardar media ubicación son los dos CHECK,
-- así que son ellos los que se verifican.
do $$
declare
  v_autor uuid; v_com uuid; v_claim uuid; v_falla boolean;
begin
  raise notice '── 17 · coordenadas completas y dentro del planeta ──';

  select id into v_autor from public.profiles where username = 'sofia_mdq';
  select home_community_id into v_com from public.profiles where id = v_autor;

  begin
    insert into public.claims (community_id, author_id, title, description, category, lat)
    values (v_com, v_autor, 'Media coordenada', 'Sólo latitud.', 'otro', -38.0);
    v_falla := false;
  exception when check_violation then v_falla := true;
  end;
  perform pg_temp.ok(v_falla, 'media coordenada no entra');

  begin
    insert into public.claims (community_id, author_id, title, description, category, lat, lng)
    values (v_com, v_autor, 'Fuera del planeta', 'Latitud imposible.', 'otro', 500, 0);
    v_falla := false;
  exception when check_violation then v_falla := true;
  end;
  perform pg_temp.ok(v_falla, 'una latitud de 500 no entra');

  insert into public.claims (community_id, author_id, title, description, category, lat, lng)
  values (v_com, v_autor, 'Par válido', 'Con ubicación.', 'otro', -38.0055, -57.5426)
  returning id into v_claim;
  perform pg_temp.ok(v_claim is not null, 'un par válido sí entra');
  delete from public.claims where id = v_claim;

  -- Sigue siendo opcional, que es la mitad del diseño: un reclamo sobre algo
  -- sin punto único —"no pasa el camión por el barrio"— tiene que poder
  -- publicarse igual.
  insert into public.claims (community_id, author_id, title, description, category)
  values (v_com, v_autor, 'Sin ubicación', 'No tiene un punto.', 'otro')
  returning id into v_claim;
  perform pg_temp.ok(v_claim is not null, 'un reclamo sin coordenadas sigue siendo válido');
  delete from public.claims where id = v_claim;
end $$;

-- =============================================================================
-- 18 · ACL de funciones privilegiadas y helpers ligados a la sesión
-- =============================================================================
do $$
declare v_bad integer; v_sofia uuid; v_bruno uuid; v_earth uuid; v_rejected boolean;
begin
  raise notice '── 18 · ACL cerrada de funciones ──';
  perform pg_temp.as_owner();

  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname in ('public', 'private')
    and p.prosecdef
    and a.grantee = 0
    and a.privilege_type = 'EXECUTE';
  perform pg_temp.ok(v_bad = 0, 'ninguna SECURITY DEFINER conserva EXECUTE de PUBLIC');

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('service_role', p.oid, 'execute')
    );
  perform pg_temp.ok(v_bad = 0, 'ningún rol de API ejecuta helpers de private');

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prorettype = 'trigger'::regtype
    and (
      has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute')
      or has_function_privilege('service_role', p.oid, 'execute')
    );
  perform pg_temp.ok(v_bad = 0, 'las funciones de trigger no son RPC invocables');

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    );
  perform pg_temp.ok(v_bad = 0, 'toda SECURITY DEFINER fija search_path');

  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prokind = 'f'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) setting
      where setting like 'search_path=%'
    );
  perform pg_temp.ok(
    v_bad = 0,
    'toda función de aplicación fija search_path aunque sea invoker');

  perform pg_temp.ok(
    not has_function_privilege(
      'anon', 'public.create_notification(uuid,uuid,text,text,text,text,text,uuid,text)', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.create_notification(uuid,uuid,text,text,text,text,text,uuid,text)', 'execute'
    )
    and not has_function_privilege(
      'service_role', 'public.create_notification(uuid,uuid,text,text,text,text,text,uuid,text)', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.content_exists(text,uuid)', 'execute'
    ),
    'create_notification y los oráculos internos no están expuestos');

  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_bruno from public.profiles where username = 'bruno_lp';
  select id into v_earth from public.communities where slug = 'earth';
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.ok(
    not public.is_member(v_bruno, v_earth)
    and not public.is_moderator(v_bruno),
    'los helpers p_user no permiten consultar la identidad de otra persona');
  v_rejected := false;
  begin
    perform 1 from public.quota_summary(v_bruno);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'quota_summary rechaza un UUID ajeno');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 18b · MFA obligatorio para toda capacidad de moderación
-- =============================================================================
do $$
declare
  v_mod uuid; v_admin uuid; v_target uuid; v_rejected boolean;
begin
  raise notice '── 18b · MFA AAL2 de moderación ──';
  perform pg_temp.as_owner();
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_admin from public.profiles where username = 'admin_geo';
  select id into v_target from public.profiles where username = 'sofia_mdq';

  perform pg_temp.as_user('mod_nacional');
  perform pg_temp.ok(
    public.can_participate() and not public.is_moderator(v_mod),
    'AAL1 conserva acciones ordinarias pero no eleva a moderación');
  v_rejected := false;
  begin
    perform public.suspend_user(
      v_target, 'Este intento AAL1 debe rechazarse antes de escribir.', null
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected
    and not exists (
      select 1 from public.user_suspensions s
      where s.user_id = v_target
        and s.reason = 'Este intento AAL1 debe rechazarse antes de escribir.'
    ),
    'una llamada directa privilegiada con AAL1 se rechaza sin efectos');

  perform pg_temp.as_user('admin_geo');
  perform pg_temp.ok(
    not public.is_admin(v_admin),
    'un rol admin tampoco obtiene privilegios con AAL1');

  perform pg_temp.as_user_aal2('mod_nacional');
  perform pg_temp.ok(
    public.is_moderator(v_mod),
    'el segundo factor habilita la sesión moderadora');
  perform pg_temp.as_user_aal2('admin_geo');
  perform pg_temp.ok(
    public.is_admin(v_admin),
    'el segundo factor habilita la sesión administradora');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 18c · El factor AAL2 debe haber pasado por el step-up de Agorbis
-- =============================================================================
do $$
declare
  v_mod uuid; v_sofia uuid; v_target uuid; v_factor uuid;
  v_session uuid := gen_random_uuid(); v_rejected boolean;
  v_authorized boolean; v_approved boolean; v_visible integer;
begin
  raise notice '── 18c · factores privilegiados aprobados y follows privados ──';
  perform pg_temp.as_owner();
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_target from public.profiles where username = 'bruno_lp';

  -- Un factor verificado directamente contra GoTrue sí puede producir AAL2,
  -- pero no debe convertirse por eso en credencial de moderación.
  v_factor := gen_random_uuid();
  insert into auth.mfa_factors (
    id, user_id, friendly_name, factor_type, status,
    created_at, updated_at, secret
  ) values (
    v_factor, v_mod, 'Factor directo no aprobado', 'totp', 'verified',
    statement_timestamp(), statement_timestamp(), 'MZXW6YTBOI======'
  );
  insert into auth.sessions (
    id, user_id, created_at, updated_at, factor_id, aal
  ) values (
    v_session, v_mod, statement_timestamp(), statement_timestamp(),
    v_factor, 'aal2'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_mod::text, 'role', 'authenticated', 'aal', 'aal2',
      'session_id', v_session::text
    )::text,
    true
  );
  perform pg_temp.ok(
    not public.current_session_uses_approved_factor()
    and not public.is_moderator(v_mod),
    'un TOTP directo y no aprobado no habilita moderación aunque el JWT diga AAL2'
  );
  v_rejected := false;
  begin
    perform public.suspend_user(
      v_target, 'Un factor directo no puede suspender cuentas.', null
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'los RPC privilegiados rechazan ese AAL2 no aprobado');

  perform pg_temp.as_owner();
  v_factor := gen_random_uuid();
  insert into auth.mfa_factors (
    id, user_id, friendly_name, factor_type, status,
    created_at, updated_at, secret
  ) values (
    v_factor, v_sofia, 'Factor que sigue el flujo Agorbis', 'totp', 'unverified',
    statement_timestamp(), statement_timestamp(), 'ONSWG4TFOQ======'
  );

  v_rejected := false;
  begin
    update public.profiles set role = 'moderator' where id = v_sofia;
  exception when object_not_in_prerequisite_state then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'no se puede promover una cuenta sin TOTP aprobado');

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    perform public.authorize_mfa_enrollment(v_sofia, v_factor);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'el navegador no puede autorizar sus propios factores'
  );

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  v_authorized := public.authorize_mfa_enrollment(v_sofia, v_factor);
  v_approved := public.approve_mfa_enrollment(v_sofia, v_factor);
  perform pg_temp.ok(
    v_authorized and not v_approved,
    'el ticket exacto no se consume antes de que GoTrue verifique el TOTP'
  );

  perform pg_temp.as_owner();
  update auth.mfa_factors set status = 'verified' where id = v_factor;
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  v_approved := public.approve_mfa_enrollment(v_sofia, v_factor);
  perform pg_temp.ok(
    v_approved
    and not public.approve_mfa_enrollment(v_sofia, v_factor),
    'el ticket aprueba sólo el factor nombrado y se consume una sola vez'
  );

  -- La relación de comunidades seguidas no es un directorio público de
  -- residencia/intereses: dueño y moderador aprobado conservan acceso.
  perform pg_temp.as_user('bruno_lp');
  select count(*) into v_visible
  from public.follows where user_id = v_sofia;
  perform pg_temp.ok(v_visible = 0, 'otro usuario no ve los follows ajenos');
  perform pg_temp.as_user('sofia_mdq');
  select count(*) into v_visible
  from public.follows where user_id = v_sofia;
  perform pg_temp.ok(v_visible > 0, 'la persona sí ve sus propios follows');
  perform pg_temp.as_user_aal2('mod_nacional');
  select count(*) into v_visible
  from public.follows where user_id = v_sofia;
  perform pg_temp.ok(
    v_visible > 0 and public.current_session_uses_approved_factor(),
    'un moderador con factor aprobado puede investigarlos'
  );
  perform pg_temp.as_anon();
  select count(*) into v_visible from public.follows;
  perform pg_temp.ok(v_visible = 0, 'anon no ve follows individuales');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 18d · Estado de cuenta también revoca autoridad privilegiada
-- =============================================================================
do $$
declare
  v_mod uuid; v_target uuid; v_suspension uuid; v_claims text;
  v_rejected boolean;
begin
  raise notice '── 18d · moderación fail-closed por estado de cuenta ──';
  perform pg_temp.as_owner();
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_target from public.profiles where username = 'bruno_lp';

  perform pg_temp.as_user_aal2('mod_nacional');
  perform pg_temp.ok(public.is_moderator(v_mod), 'precondición: rol y TOTP aprobado habilitan moderación');
  v_claims := current_setting('request.jwt.claims', true);
  perform pg_temp.as_owner();
  insert into public.user_suspensions(user_id, reason)
  values (v_mod, 'Suspensión temporal para probar el cierre fail-closed.')
  returning id into v_suspension;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_claims, true);
  perform pg_temp.ok(
    public.current_session_uses_approved_factor()
      and not public.is_moderator(v_mod),
    'una suspensión revoca moderación sin quitar el step-up para exportar o borrar'
  );
  v_rejected := false;
  begin
    perform public.suspend_user(
      v_target, 'Una cuenta suspendida no puede ejercer moderación.', null
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el RPC privilegiado también rechaza al moderador suspendido');

  perform pg_temp.as_owner();
  delete from public.user_suspensions where id = v_suspension;
  perform pg_temp.as_user_aal2('mod_nacional');
  v_claims := current_setting('request.jwt.claims', true);
  perform pg_temp.as_owner();
  delete from public.user_legal_acceptances where user_id = v_mod;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_claims, true);
  perform pg_temp.ok(
    public.current_session_uses_approved_factor()
      and not public.is_moderator(v_mod),
    'sin las versiones legales vigentes el AAL2 no conserva autoridad'
  );

  perform pg_temp.as_user_aal2('mod_nacional');
  v_claims := current_setting('request.jwt.claims', true);
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.prepare_account_deletion(v_mod),
    'precondición: service_role registra la baja antes de tocar Auth'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', v_claims, true);
  perform pg_temp.ok(
    public.current_session_uses_approved_factor()
      and not public.is_moderator(v_mod),
    'una baja pendiente congela inmediatamente todos los poderes moderadores'
  );
  v_rejected := false;
  begin
    perform public.suspend_user(
      v_target, 'Una cuenta en proceso de baja no puede moderar.', null
    );
  exception when others then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el RPC privilegiado falla cerrado durante la baja');

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.cancel_account_deletion(v_mod),
    'la simulación cancela la baja sin alterar Auth'
  );
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 19 · Consentimiento versionado, mayoría de edad y exportación self-only
-- =============================================================================
do $$
declare
  v_sofia uuid; v_diego uuid; v_flor uuid; v_target uuid;
  v_rejected boolean; v_count integer;
  v_notice_version text;
  v_old_bio text;
  v_first_acceptance timestamptz;
  v_second_acceptance timestamptz;
begin
  raise notice '── 19 · consentimiento legal y exportación ──';
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_diego from public.profiles where username = 'diego_mza';
  select id into v_flor from public.profiles where username = 'flor_tandil';
  select bio into v_old_bio from public.profiles where id = v_sofia;
  select c.id into v_target
  from public.communities c
  where not exists (
    select 1 from public.follows f
    where f.user_id = v_sofia and f.community_id = c.id
  ) limit 1;
  select n.version into strict v_notice_version
  from public.international_transfer_notice_versions n
  where n.is_current and n.effective_at <= now();

  perform pg_temp.ok(
    (select count(*) = 3 from public.legal_document_versions
      where is_current and effective_at <= now())
    and (select minimum_age = 18 from public.legal_document_versions
      where document_type = 'terms' and version = '2026-08-23')
    and (select content_hash = '6221c945577bdf3ea485dc254ed657e596a2e8e8cbd2b1e8a2ec8a0fee38cd2f'
      from public.legal_document_versions where document_type = 'terms' and version = '2026-08-23')
    and (select content_hash = 'efdb395f293b7b1af31d6d79a2c70457a007279fe1d23a7b655dad4a997d039e'
        and not is_current
      from public.legal_document_versions where document_type = 'privacy' and version = '2026-08-29.1')
    -- D109: 0073 retira 2026-08-29.1 y publica la versión que cita el anexo
    -- de Turnstile.
    and (select content_hash = '24849a7cfbe666f8f03f24be54c702c4b402fd10dcdad12a482983c8c6c56807'
        and is_current
      from public.legal_document_versions where document_type = 'privacy' and version = '2026-11-02.1')
    and (select content_hash = '225563ba3a5d2429448dd2a99e35a5f472fc00bcc5fe44ac6fd7172517285541'
      from public.legal_document_versions where document_type = 'community_rules' and version = '2026-08-23')
    and (select count(*) = 1
      from public.international_transfer_notice_versions
      where is_current and effective_at <= now())
    and (select content_hash = '052a72a73375da6930313cbc9f2736f8b63f0ad321342b9fdd66f727a34a1baa'
      and provider_register_version = '2026-08-29.1'
      and content_hash_algorithm = 'sha256-json-stringify-v1'
      and superseded_at is null
      and content_snapshot -> 'es' ->> 'title'
        = 'Aviso de transferencias internacionales'
      and content_snapshot -> 'en' ->> 'title'
        = 'International transfer notice'
      from public.international_transfer_notice_versions
      where version = '2026-08-29.1'),
    'documentos y aviso de transferencias tienen versiones y hashes canónicos');

  delete from public.user_legal_acceptances where user_id = v_sofia;
  delete from public.user_international_transfer_consents
  where user_id = v_sofia;
  perform pg_temp.as_user_without_legal('sofia_mdq');
  perform pg_temp.ok(
    not public.can_participate()
    and public.my_legal_status()
      -> 'international_transfer_consent' ->> 'status' = 'missing',
    'sin documentos ni consentimiento de transferencias no puede participar');

  v_rejected := false;
  begin
    perform public.accept_current_legal(false);
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'negar la mayoría de edad no crea aceptaciones');

  perform pg_temp.as_owner();
  insert into public.user_legal_acceptances (
    user_id, document_type, version, minimum_age_attested
  )
  select v_sofia, d.document_type, d.version, false
  from public.legal_document_versions d
  where d.is_current and d.effective_at <= now();
  perform pg_temp.as_user_without_legal('sofia_mdq');
  perform pg_temp.ok(
    not public.can_participate()
    and coalesce((
      select (document ->> 'accepted')::boolean
      from jsonb_array_elements(public.my_legal_status() -> 'documents') document
      where document ->> 'type' = 'terms'
    ), true) = false,
    'terms sin attestation de mayoría figura no aceptado y no habilita participación');
  perform pg_temp.as_owner();
  delete from public.user_legal_acceptances where user_id = v_sofia;
  perform pg_temp.as_user_without_legal('sofia_mdq');

  v_rejected := false;
  begin
    insert into public.follows (user_id, community_id) values (v_sofia, v_target);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el gate DB bloquea una escritura cívica sin consentimiento');

  perform public.accept_current_legal(true);
  select count(*) into v_count
  from public.user_legal_acceptances where user_id = v_sofia;
  perform pg_temp.ok(
    v_count = 3
    and not public.can_participate()
    and public.my_legal_status()
      -> 'international_transfer_consent' ->> 'status' = 'missing',
    'los tres documentos no sustituyen el consentimiento especial');

  v_rejected := false;
  begin
    update public.profiles
    set bio = 'Cambio que no debe persistir sin consentimiento internacional.'
    where id = v_sofia;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected
    and (select bio is not distinct from v_old_bio
      from public.profiles where id = v_sofia),
    'sin transferencias vigentes tampoco puede editar su perfil público');

  perform pg_temp.as_owner();
  delete from private.write_cooldowns
  where scope = 'data-export' and actor_id = v_sofia;
  perform pg_temp.as_user_without_legal('sofia_mdq');
  perform pg_temp.ok(
    public.export_my_linked_activity() is not null,
    'el derecho de exportación sigue disponible sin consentimiento');
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.prepare_account_deletion(v_sofia),
    'la baja puede prepararse sin consentimiento');
  perform pg_temp.ok(
    public.cancel_account_deletion(v_sofia),
    'una falla del proveedor puede cancelar esa baja de forma segura');
  perform pg_temp.as_user_without_legal('sofia_mdq');

  v_rejected := false;
  begin
    perform public.grant_current_international_transfer_consent(
      v_notice_version, false, 'es'
    );
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC exige aceptación afirmativa explícita');

  v_rejected := false;
  begin
    perform public.grant_current_international_transfer_consent(
      v_notice_version, true, null
    );
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza locale nulo');

  v_rejected := false;
  begin
    perform public.grant_current_international_transfer_consent(
      '2026-08-24.0', true, 'es'
    );
  exception when object_not_in_prerequisite_state then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'una versión no vigente falla cerrada');

  v_rejected := false;
  begin
    insert into public.user_international_transfer_consents (
      user_id, notice_version, notice_hash, locale, source
    )
    select v_sofia, n.version, n.content_hash, 'es', 'account_gate'
    from public.international_transfer_notice_versions n
    where n.version = v_notice_version;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el JWT no puede insertar evidencia directamente');

  v_first_acceptance := public.grant_current_international_transfer_consent(
    v_notice_version, true, 'es'
  );
  v_second_acceptance := public.grant_current_international_transfer_consent(
    v_notice_version, true, 'en'
  );
  select count(*) into v_count
  from public.user_international_transfer_consents
  where user_id = v_sofia and notice_version = v_notice_version;
  perform pg_temp.ok(
    v_count = 1
    and v_first_acceptance = v_second_acceptance
    and (select locale = 'es' and source = 'account_gate'
      from public.user_international_transfer_consents
      where user_id = v_sofia and notice_version = v_notice_version)
    and not exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_diego
    )
    and public.can_participate()
    and public.my_legal_status()
      -> 'international_transfer_consent' ->> 'status' = 'accepted'
    and public.my_legal_status()
      -> 'international_transfer_consent' ->> 'version' = v_notice_version
    and public.my_legal_status()
      -> 'international_transfer_consent' ->> 'content_hash_algorithm'
        = 'sha256-json-stringify-v1',
    'la aceptación vigente es inmutable, idempotente y habilita participación');
  insert into public.follows (user_id, community_id) values (v_sofia, v_target);
  delete from public.follows where user_id = v_sofia and community_id = v_target;

  -- La aceptación no puede plantarse antes de verificar un correo. Si una
  -- identidad OAuth verificada se enlaza después al mismo auth.users, sólo la
  -- ceremonia autenticada `accept_current_legal` puede crear estas filas.
  perform pg_temp.as_owner();
  delete from public.user_legal_acceptances where user_id = v_diego;
  perform pg_temp.ok(
    to_regprocedure(
      'public.record_signup_legal_acceptance(uuid,boolean)'
    ) is null
    and to_regprocedure(
      'public.grant_current_international_transfer_consent(text,boolean,text,text)'
    ) is null
    and has_function_privilege(
      'authenticated',
      'public.grant_current_international_transfer_consent(text,boolean,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.grant_current_international_transfer_consent(text,boolean,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.grant_current_international_transfer_consent(text,boolean,text)',
      'execute'
    ),
    'sólo una identidad autenticada puede completar ambas ceremonias');

  -- La exportación no depende de consentimiento y no acepta un UUID objetivo.
  delete from private.write_cooldowns
  where scope = 'data-export'
    and actor_id in (v_diego, v_flor);
  perform pg_temp.as_user_without_legal('diego_mza');
  perform pg_temp.ok(
    public.export_my_linked_activity() is not null,
    'una cuenta sin consentimiento puede materializar su exportación');
  v_rejected := false;
  begin
    perform public.export_my_linked_activity();
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'la RPC de datos aplica su propio cooldown ante llamadas directas');

  perform pg_temp.as_user('flor_tandil');
  perform pg_temp.ok(
    public.export_my_linked_activity() is not null,
    'el cooldown es por usuario y no bloquea a otra persona');
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    has_function_privilege('authenticated', 'public.export_my_linked_activity()', 'execute')
    and not has_function_privilege('anon', 'public.export_my_linked_activity()', 'execute')
    and not has_function_privilege('service_role', 'public.export_my_linked_activity()', 'execute'),
    'la actividad vinculada sólo se exporta para la propia sesión');
end $$;

-- =============================================================================
-- 20 · Suspensión, jerarquía, apelaciones y auditoría inmutable
-- =============================================================================
do $$
declare
  v_admin uuid; v_mod uuid; v_bruno uuid; v_existing uuid; v_new_target uuid;
  v_suspension uuid; v_temp_suspension uuid; v_appeal uuid;
  v_delete_target constant uuid := '99999999-9999-4999-8999-999999999991';
  v_delete_suspension uuid; v_delete_appeal uuid;
  v_rejected boolean; v_rows integer; v_audit bigint;
  v_audit_total integer; v_admin_audit integer;
  v_export jsonb;
begin
  raise notice '── 20 · suspensiones, apelaciones y auditoría ──';
  perform pg_temp.as_owner();
  select id into v_admin from public.profiles where username = 'admin_geo';
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_bruno from public.profiles where username = 'bruno_lp';
  select community_id into v_existing from public.follows
  where user_id = v_bruno limit 1;
  if v_existing is null then
    select id into v_existing from public.communities order by id limit 1;
    insert into public.follows (user_id, community_id) values (v_bruno, v_existing);
  end if;
  select c.id into v_new_target from public.communities c
  where c.id <> v_existing and not exists (
    select 1 from public.follows f
    where f.user_id = v_bruno and f.community_id = c.id
  ) limit 1;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, email_change_confirm_status,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_delete_target,
    'authenticated', 'authenticated', 'privacy-delete@agorbis.test',
    extensions.crypt('AgorbisLocal-2026!', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"username":"privacy_delete","display_name":"Cuenta para borrar"}'::jsonb,
    now(), now(), '', '', '', '', '', 0, '', '', '', false, false
  );

  perform pg_temp.as_user_aal2('admin_geo');
  v_suspension := public.suspend_user(
    v_bruno, 'Suspensión indefinida creada por la prueba de seguridad.', null
  );
  perform pg_temp.ok(
    (select ends_at is null from public.user_suspensions where id = v_suspension),
    'una suspensión indefinida queda representada por ends_at NULL');

  v_temp_suspension := public.suspend_user(
    v_mod, 'Suspensión temporal para verificar la duración y el levantamiento.',
    now() + interval '1 day'
  );
  perform pg_temp.ok(
    (select ends_at > now() from public.user_suspensions where id = v_temp_suspension)
    and public.lift_user_suspension(v_temp_suspension, 'Fin de la prueba temporal'),
    'admin puede crear y levantar una suspensión temporal de moderación');

  perform pg_temp.as_user_aal2('mod_nacional');
  v_rejected := false;
  begin
    perform public.suspend_user(
      v_admin, 'Un moderador no debe poder suspender a una cuenta administradora.', null
    );
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'moderator no puede suspender moderator/admin');

  perform pg_temp.as_user('bruno_lp');
  perform pg_temp.ok(
    public.is_user_suspended() and not public.can_participate(),
    'la cuenta suspendida conoce el estado y no puede participar');
  select count(*) into v_rows from public.profiles where id = v_bruno;
  perform pg_temp.ok(v_rows = 1, 'la suspensión no bloquea leer el perfil propio');
  perform pg_temp.ok(
    public.export_my_linked_activity() is not null,
    'la suspensión no bloquea materializar una exportación propia');

  v_rejected := false;
  begin
    insert into public.follows (user_id, community_id) values (v_bruno, v_new_target);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la suspensión bloquea participación desde DB');

  delete from public.follows where user_id = v_bruno and community_id = v_existing;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 1, 'la cuenta suspendida sí puede borrar datos propios');

  v_appeal := public.submit_suspension_appeal(
    v_suspension,
    'Solicito una revisión porque falta contexto relevante para la decisión.'
  );
  perform pg_temp.ok(
    public.withdraw_moderation_appeal(v_appeal),
    'la persona puede retirar una apelación pendiente');
  v_appeal := public.submit_suspension_appeal(
    v_suspension,
    'Presento una segunda apelación completa para que moderación la resuelva.'
  );

  perform pg_temp.as_user_aal2('admin_geo');
  perform pg_temp.ok(
    public.review_moderation_appeal(
      v_appeal, 'accepted', 'El contexto aportado justifica levantar la medida.'
    ),
    'admin puede aceptar la apelación y levantar la suspensión');

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select status = 'accepted' from public.moderation_appeals where id = v_appeal)
    and (select lifted_at is not null from public.user_suspensions where id = v_suspension),
    'apelación y suspensión se resuelven en la misma transacción');
  select max(id) into v_audit from public.moderation_audit_log
  where target_id in (v_suspension, v_appeal);
  perform pg_temp.ok(v_audit is not null, 'las acciones de moderación dejan audit log');
  v_rejected := false;
  begin
    update public.moderation_audit_log set metadata = '{}'::jsonb where id = v_audit;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'ni el owner puede mutar el audit log fuera del purge controlado');

  -- También se prueba la baja de la persona afectada, con suspensión y
  -- apelación pendientes. Ambas filas deben seguir la cascada de su profile.
  perform pg_temp.as_user_aal2('admin_geo');
  v_delete_suspension := public.suspend_user(
    v_delete_target,
    'Suspensión temporal para probar el borrado completo de la cuenta.',
    now() + interval '1 day'
  );
  perform pg_temp.as_user('privacy_delete');
  v_delete_appeal := public.submit_suspension_appeal(
    v_delete_suspension,
    'Apelación temporal con suficiente detalle para probar la cascada completa.'
  );
  perform pg_temp.as_owner();
  delete from auth.users where id = v_delete_target;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(
    v_rows = 1
    and not exists (select 1 from public.profiles where id = v_delete_target)
    and not exists (
      select 1 from public.user_suspensions where id = v_delete_suspension
    )
    and not exists (
      select 1 from public.moderation_appeals where id = v_delete_appeal
    ),
    'una cuenta suspendida y apelante se elimina con todos sus datos propios');
  perform pg_temp.ok(
    not exists (
      select 1
      from public.moderation_audit_log a
      where position(v_delete_target::text in a.metadata::text) > 0
        or position(v_admin::text in a.metadata::text) > 0
        or a.metadata @? '$.**.body'
        or a.metadata @? '$.**.reason'
        or a.metadata @? '$.**.message'
        or a.metadata @? '$.**.title'
        or a.metadata @? '$.**.description'
        or a.metadata @? '$.**.resolution_note'
        or a.metadata @? '$.**.rejection_note'
        or a.metadata @? '$.**.user_id'
        or a.metadata @? '$.**.author_id'
        or a.metadata @? '$.**.reporter_id'
        or a.metadata @? '$.**.appellant_id'
        or a.metadata @? '$.**.moderator_id'
        or a.metadata @? '$.**.created_by'
        or a.metadata @? '$.**.reviewed_by'
        or a.metadata @? '$.**.resolved_by'
        or a.metadata @? '$.**.removed_by'
        or a.metadata @? '$.**.added_by'
    ),
    'la auditoría no conserva UUID personales, texto libre ni claves sensibles');

  insert into private.abuse_windows (
    scope, actor_id, window_started_at, hits
  ) values ('account-delete-test', v_admin, date_trunc('hour', now()), 1);
  insert into private.write_cooldowns (
    scope, actor_id, next_allowed_at
  ) values ('account-delete-test', v_admin, now() + interval '1 minute');
  insert into public.moderation_audit_log (
    moderator_id, action, target_type, metadata
  )
  select v_admin, 'limit_probe', 'limit_probe', '{}'::jsonb
  from generate_series(1, 5001);
  perform pg_temp.as_user_aal2('admin_geo');
  v_export := public.export_my_linked_activity();
  perform pg_temp.ok(
    jsonb_array_length(v_export -> 'moderation_actions') = 5000
    and jsonb_array_length(v_export -> 'suspensions_created') > 0
    and jsonb_array_length(v_export -> 'operational_security' -> 'abuse_windows') = 1
    and exists (
      select 1
      from jsonb_array_elements(
        v_export -> 'operational_security' -> 'write_cooldowns'
      ) item
      where item ->> 'scope' = 'account-delete-test'
    )
    and exists (
      select 1
      from jsonb_array_elements(
        v_export -> 'operational_security' -> 'write_cooldowns'
      ) item
      where item ->> 'scope' = 'data-export'
    )
    and not (v_export ? 'metadata')
    and position('"body"' in v_export::text) = 0
    and not (v_export -> 'budget_reviews' @? '$[*].rejection_note'),
    'la exportación queda acotada y no incluye cuerpos, metadata ni notas de revisión');
  perform pg_temp.as_owner();

  -- Moderar no puede convertir la cuenta en imborrable. Se borra desde
  -- `auth.users`, igual que admin.deleteUser; el ROLLBACK global de la suite
  -- restaura el fixture al terminar.
  select count(*), count(*) filter (where moderator_id = v_admin)
    into v_audit_total, v_admin_audit
  from public.moderation_audit_log;
  delete from auth.users where id = v_admin;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(
    v_rows = 1
    and not exists (select 1 from public.profiles where id = v_admin)
    and exists (
      select 1 from public.user_suspensions
      where id = v_suspension and created_by is null and lifted_by is null
        and lifted_at is not null
    )
    and exists (
      select 1 from public.moderation_appeals
      where id = v_appeal and reviewed_by is null and reviewed_at is not null
    )
    and (select count(*) from public.moderation_audit_log) = v_audit_total
    and v_admin_audit > 0
    and not exists (
      select 1 from public.moderation_audit_log where moderator_id = v_admin
    )
    and not exists (
      select 1 from private.abuse_windows where actor_id = v_admin
    )
    and not exists (
      select 1 from private.write_cooldowns where actor_id = v_admin
    ),
    'una cuenta moderadora se borra, anonimiza actores y conserva la auditoría histórica');

  perform pg_temp.as_user('bruno_lp');
  insert into public.follows (user_id, community_id) values (v_bruno, v_new_target);
  select count(id) into v_rows from public.moderation_audit_log;
  perform pg_temp.ok(
    v_rows = 0 and public.can_participate(),
    'levantada la medida vuelve la participación sin exponer el audit log');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 21 · Antiabuso de reportes, solicitudes, uploads y búsqueda
-- =============================================================================
do $$
declare
  v_flor uuid; v_mod uuid; v_sofia uuid; v_mdp uuid; v_parent uuid;
  v_column uuid;
  v_id uuid; v_debate uuid;
  v_targets uuid[] := '{}'::uuid[]; v_rejected boolean; v_rows integer; i integer;
begin
  raise notice '── 21 · gates antiabuso ──';
  perform pg_temp.as_owner();
  select id into v_flor from public.profiles where username = 'flor_tandil';
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_mdp from public.communities where slug = 'mar-del-plata';
  select id into v_parent from public.communities where slug = 'buenos-aires';
  -- D127: la columna provincial de Sofía es su partido, que contiene a Mar del Plata.
  select parent_id into v_column from public.communities where id = v_mdp;
  delete from private.write_cooldowns
  where scope = 'debate-comments' and actor_id = v_sofia;
  insert into public.debates (community_id, author_id, title, body)
  values (
    v_parent, v_mod, 'Debate temporal de rate limit',
    'Prueba del cooldown transaccional entre comentarios.'
  ) returning id into v_debate;
  for i in 1..11 loop
    insert into public.claims (community_id, author_id, title, description, category)
    values (
      v_mdp, v_mod, 'Target antiabuso ' || i,
      'Contenido temporal creado para probar reportes con targets reales.', 'otro'
    ) returning id into v_id;
    v_targets := array_append(v_targets, v_id);
  end loop;

  perform pg_temp.as_user('flor_tandil');
  v_rejected := false;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (v_flor, 'claim', gen_random_uuid(), 'Target inexistente');
  exception when foreign_key_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un reporte no admite un target inexistente');

  for i in 1..10 loop
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (v_flor, 'claim', v_targets[i], 'Reporte de prueba número ' || i);
  end loop;
  v_rejected := false;
  begin
    insert into public.reports (reporter_id, target_type, target_id, reason)
    values (v_flor, 'claim', v_targets[11], 'Este reporte supera la ventana horaria');
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el reporte número once de la hora se rechaza en DB');

  v_rejected := false;
  begin
    insert into public.claim_uploads (owner_id, path) values (
      v_flor, v_flor::text || '/' || gen_random_uuid()::text || '.jpg'
    );
  exception when foreign_key_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'tracking de upload exige que el objeto exista en Storage');

  perform pg_temp.as_user('sofia_mdq');
  insert into public.debate_comments (
    debate_id, column_community_id, user_id, body
  ) values (
    v_debate, v_column, v_sofia, 'Primer comentario permitido por la ventana.'
  );
  v_rejected := false;
  begin
    insert into public.debate_comments (
      debate_id, column_community_id, user_id, body
    ) values (
      v_debate, v_column, v_sofia, 'Segundo comentario demasiado inmediato.'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el cooldown DB rechaza comentarios con menos de quince segundos');

  perform pg_temp.as_user('diego_mza');
  for i in 1..3 loop
    insert into public.community_requests (
      user_id, requested_name, country, parent_community_id, requested_level, reason
    ) values (
      (select id from public.profiles where username = 'diego_mza'),
      'Ciudad antiabuso ' || i, 'Argentina', v_parent, 'city',
      'Motivo suficientemente detallado para la solicitud de prueba número ' || i || '.'
    );
  end loop;
  v_rejected := false;
  begin
    insert into public.community_requests (
      user_id, requested_name, country, parent_community_id, requested_level, reason
    ) values (
      (select id from public.profiles where username = 'diego_mza'),
      'Ciudad antiabuso 4', 'Argentina', v_parent, 'city',
      'Esta cuarta solicitud pendiente debe ser rechazada por el motor.'
    );
  exception when sqlstate '54000' then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'no se pueden acumular más de tres solicitudes pendientes');

  perform pg_temp.as_anon();
  select count(*) into v_rows from public.global_search('%%%', null, null, null, 999, -50);
  perform pg_temp.ok(v_rows = 0, 'los comodines de LIKE se tratan como texto literal');
  select count(*) into v_rows from public.global_search('co', null, null, null, 999, 0);
  perform pg_temp.ok(v_rows = 0, 'la búsqueda rechaza queries menores a tres caracteres');
  select count(*) into v_rows from public.global_search('cordoba', null, null, null, 999, -50);
  perform pg_temp.ok(v_rows between 1 and 50, 'limit y offset quedan acotados por la RPC');
  select count(*) into v_rows from public.global_search('cordoba', 'secreto', null, null, 20, 0);
  perform pg_temp.ok(v_rows = 0, 'un kind fuera de allowlist no ejecuta la búsqueda');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 22 · Emisión atómica de encuestas múltiples
-- =============================================================================
do $$
declare
  v_poll uuid;
  v_arg uuid;
  v_mod uuid;
  v_sofia uuid;
  v_options uuid[];
  v_rows integer;
  v_votes bigint;
  v_rejected boolean;
  i integer;
begin
  raise notice '── 22 · emisión múltiple agregada y atómica ──';
  perform pg_temp.as_owner();
  select id into v_arg from public.communities where slug = 'argentina';
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  insert into public.polls (
    community_id, author_id, question, description, type,
    max_choices, results_visibility, closes_at
  ) values (
    v_arg, v_mod, 'Encuesta secreta temporal', 'Prueba de selecciones múltiples.',
    'multiple', 3, 'after_close', now() + interval '1 day'
  ) returning id into v_poll;
  for i in 1..5 loop
    insert into public.poll_options (poll_id, label, sort_order)
    values (v_poll, 'Opción ' || i, i);
  end loop;
  select array_agg(o.id order by o.sort_order) into v_options
  from public.poll_options o where o.poll_id = v_poll;

  perform pg_temp.as_user('sofia_mdq');
  v_rejected := false;
  begin
    perform public.cast_poll_ballot(v_poll, v_options);
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza más opciones que max_choices');

  v_rejected := false;
  begin
    perform public.cast_poll_ballot(
      v_poll, array[v_options[1], v_options[1]]
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza opciones repetidas');

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    not exists (
      select 1 from public.poll_participation_receipts where poll_id = v_poll
    )
    and not exists (
      select 1 from private.poll_option_tallies where poll_id = v_poll
    ),
    'los intentos inválidos no dejan recibo ni incremento parcial');

  perform pg_temp.as_user('sofia_mdq');
  perform public.cast_poll_ballot(
    v_poll, array[v_options[1], v_options[2], v_options[3]]
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select count(*) = 1 from public.poll_participation_receipts where poll_id = v_poll)
    and (select count(*) = 5 and sum(votes) = 3
              and min(participants) = 1 and max(participants) = 1
         from private.poll_option_tallies where poll_id = v_poll)
    and (select count(distinct xmin::text) = 1
         from private.poll_option_tallies where poll_id = v_poll),
    'una emisión crea un recibo y actualiza juntas todas las opciones, incluidas las de +0');

  v_rejected := false;
  begin
    insert into public.poll_options (poll_id, label, sort_order)
    values (v_poll, 'Opción tardía', 6);
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'el conjunto de opciones queda congelado desde la primera emisión');

  v_rejected := false;
  begin
    delete from public.poll_options where id = v_options[5];
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'ni un camino privilegiado puede borrar una opción después de emitir');

  update public.polls set status = 'closed' where id = v_poll;
  perform pg_temp.as_anon();
  select count(*), coalesce(sum(votes), 0)
  into v_rows, v_votes
  from public.poll_results(v_poll);
  perform pg_temp.ok(
    v_rows = 0 and v_votes = 0,
    'una sola participación sigue oculta aun después del cierre');
  perform pg_temp.as_owner();

  v_rejected := false;
  begin
    update public.polls set status = 'active' where id = v_poll;
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'una encuesta cerrada no se puede reabrir para comparar agregados');

  delete from public.polls where id = v_poll;
  perform pg_temp.ok(
    not exists (
      select 1 from public.poll_participation_receipts where poll_id = v_poll
    )
    and not exists (
      select 1 from private.poll_option_tallies where poll_id = v_poll
    ),
    'borrar la encuesta completa conserva las cascadas de recibos y tallies');
end $$;

-- =============================================================================
-- 23 · Integridad relacional y transiciones de tareas/aportes
-- =============================================================================
do $$
declare
  v_mod uuid; v_sofia uuid; v_mdp uuid; v_p1 uuid; v_p2 uuid;
  v_comment uuid; v_milestone uuid; v_task uuid; v_contribution uuid;
  v_rejected boolean; v_rows integer;
begin
  raise notice '── 23 · FKs compuestas y transiciones ──';
  perform pg_temp.as_owner();
  select id into v_mod from public.profiles where username = 'mod_nacional';
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_mdp from public.communities where slug = 'mar-del-plata';
  insert into public.projects (community_id, author_id, title, summary, plan, currency)
  values (v_mdp, v_mod, 'Proyecto FK uno', 'Resumen temporal.', 'Plan temporal.', 'ARS')
  returning id into v_p1;
  insert into public.projects (community_id, author_id, title, summary, plan, currency)
  values (v_mdp, v_mod, 'Proyecto FK dos', 'Resumen temporal.', 'Plan temporal.', 'ARS')
  returning id into v_p2;
  insert into public.project_comments (project_id, user_id, body)
  values (v_p1, v_sofia, 'Comentario padre temporal.') returning id into v_comment;
  v_rejected := false;
  begin
    insert into public.project_comments (project_id, user_id, body, parent_id)
    values (v_p2, v_sofia, 'No puede cruzar proyectos.', v_comment);
  exception when foreign_key_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un comentario hijo no puede apuntar a otro proyecto');

  insert into public.project_milestones (project_id, title, description, sort_order)
  values (v_p1, 'Hito del primer proyecto', 'Hito temporal.', 0)
  returning id into v_milestone;
  v_rejected := false;
  begin
    insert into public.project_tasks (project_id, milestone_id, title, description)
    values (v_p2, v_milestone, 'Tarea cruzada', 'No debe entrar.');
  exception when foreign_key_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'una tarea no puede usar el hito de otro proyecto');

  insert into public.project_tasks (project_id, title, description)
  values (v_p1, 'Tarea con transición', 'Prueba de estados.') returning id into v_task;
  perform pg_temp.as_user_aal2('mod_nacional');
  v_rejected := false;
  begin
    update public.project_tasks set status = 'completed' where id = v_task;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'una tarea no salta directamente de open a completed');
  update public.project_tasks set status = 'in_progress' where id = v_task;
  update public.project_tasks set status = 'completed' where id = v_task;

  perform pg_temp.as_user('sofia_mdq');
  insert into public.project_contributions (
    project_id, user_id, kind, description, quantity, unit
  ) values (
    v_p1, v_sofia, 'time', 'Aporte temporal para probar revisión.', 2, 'horas'
  ) returning id into v_contribution;
  update public.project_contributions set status = 'accepted' where id = v_contribution;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 0, 'quien ofrece un aporte no puede autoaceptarlo');

  perform pg_temp.as_user_aal2('mod_nacional');
  update public.project_contributions set status = 'accepted' where id = v_contribution;
  v_rejected := false;
  begin
    update public.project_contributions set status = 'offered' where id = v_contribution;
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un aporte aceptado no vuelve a offered');
  perform pg_temp.as_owner();
end $$;

-- =============================================================================
-- 24 · Privilegios por columna, Storage y RLS de configuración
-- =============================================================================
do $$
declare v_bad integer;
begin
  raise notice '── 24 · columnas, Storage y claim_response_windows ──';
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    and not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'update')
    and not has_column_privilege('authenticated', 'public.claims', 'support_count', 'update')
    and not has_column_privilege('authenticated', 'public.claims', 'created_at', 'insert')
    and not has_column_privilege('authenticated', 'public.follows', 'created_at', 'insert')
    and not has_table_privilege(
      'authenticated', 'public.poll_participation_receipts', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.budget_participation_receipts', 'insert'
    )
    and not has_column_privilege('authenticated', 'public.content_sources', 'verified_at', 'insert'),
    'roles de navegador no escriben identidad, recibos, contadores ni timestamps del sistema');
  perform pg_temp.ok(
    not has_table_privilege('authenticated', 'public.polls', 'insert')
    and not has_table_privilege('authenticated', 'public.projects', 'insert')
    and not has_table_privilege('authenticated', 'public.poll_options', 'insert')
    and not has_table_privilege('authenticated', 'public.institutional_responses', 'update'),
    'creaciones compuestas y respuestas inmutables no tienen DML directo');

  select count(*) into v_bad from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'geounity_claim%'
    and cmd in ('INSERT', 'UPDATE', 'DELETE');
  perform pg_temp.ok(
    v_bad = 0,
    'ningún JWT escribe, reemplaza ni borra evidencia en Storage');
  perform pg_temp.ok(
    has_function_privilege('authenticated', 'public.can_upload_claim_object()', 'execute')
    and not has_function_privilege('anon', 'public.can_upload_claim_object()', 'execute')
    and not has_function_privilege('service_role', 'public.can_upload_claim_object()', 'execute'),
    'la cuota de Storage sólo se evalúa para la sesión autenticada');

  perform pg_temp.ok(
    (select relrowsecurity from pg_class
      where oid = 'public.claim_response_windows'::regclass)
    and has_table_privilege('anon', 'public.claim_response_windows', 'select')
    and has_table_privilege('authenticated', 'public.claim_response_windows', 'select')
    and not has_table_privilege('authenticated', 'public.claim_response_windows', 'insert')
    and not has_table_privilege('authenticated', 'public.claim_response_windows', 'update')
    and not has_table_privilege('authenticated', 'public.claim_response_windows', 'delete'),
    'claim_response_windows tiene RLS y es configuración sólo lectura');
end $$;

-- =============================================================================
-- 25 · Retención operativa e índices prioritarios
-- =============================================================================
do $$
declare
  v_indexes integer;
  v_purge jsonb;
  v_subject uuid;
  v_community uuid;
  v_old_suspension uuid;
  v_old_appeal uuid;
  v_lifted_suspension uuid;
  v_pending_suspension uuid;
  v_pending_appeal uuid;
  v_stale_unconfirmed constant uuid := '99999999-9999-4999-8999-999999999992';
  v_active_unconfirmed constant uuid := '99999999-9999-4999-8999-999999999993';
  v_social_unconfirmed constant uuid := '99999999-9999-4999-8999-999999999994';
  v_fresh_unconfirmed constant uuid := '99999999-9999-4999-8999-999999999995';
begin
  raise notice '── 25 · retención e índices ──';
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select retention_days = 90 from public.data_retention_policies
      where dataset = 'activation_events')
    and (select retention_days = 7 and purge_on_account_deletion
      from public.data_retention_policies where dataset = 'abuse_windows')
    and (select retention_days = 1 and purge_on_account_deletion
      from public.data_retention_policies where dataset = 'write_cooldowns')
    and (select retention_days = 2555 from public.data_retention_policies
      where dataset = 'moderation_audit_log')
    and (select retention_days = 2555 and purge_on_account_deletion
      from public.data_retention_policies where dataset = 'moderation_appeals')
    and (select retention_days = 2555 and purge_on_account_deletion
      from public.data_retention_policies where dataset = 'user_suspensions')
    and (select retention_days = 30 and purge_on_account_deletion
      from public.data_retention_policies where dataset = 'unconfirmed_accounts')
    and (select retention_days = 1825 from public.data_retention_policies
      where dataset = 'user_legal_acceptances')
    and (select retention_days = 1825 and purge_on_account_deletion
      from public.data_retention_policies
      where dataset = 'user_international_transfer_consents'),
    'telemetría, moderación, altas incompletas y consentimientos tienen plazos declarados');
  perform pg_temp.ok(
    has_table_privilege('anon', 'public.data_retention_policies', 'select')
    and has_table_privilege(
      'authenticated', 'public.data_retention_policies', 'select'
    )
    and not has_table_privilege(
      'anon', 'public.data_retention_policies', 'insert'
    )
    and not has_table_privilege(
      'anon', 'public.data_retention_policies', 'update'
    )
    and not has_table_privilege(
      'anon', 'public.data_retention_policies', 'delete'
    )
    and not has_table_privilege(
      'authenticated', 'public.data_retention_policies', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.data_retention_policies', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.data_retention_policies', 'delete'
    )
    and has_table_privilege(
      'service_role', 'public.data_retention_policies', 'select'
    )
    and has_table_privilege(
      'service_role', 'public.data_retention_policies', 'insert'
    )
    and has_table_privilege(
      'service_role', 'public.data_retention_policies', 'update'
    )
    and has_table_privilege(
      'service_role', 'public.data_retention_policies', 'delete'
    ),
    'el catálogo de retención es sólo lectura para clientes y escribible por backend');
  perform pg_temp.ok(
    not exists (
      select 1
      from pg_constraint c
      where c.contype = 'f'
        and c.confrelid = 'public.profiles'::regclass
        and c.confdeltype in ('a', 'r')
    ),
    'ninguna referencia a perfiles vuelve imborrable una cuenta');
  perform pg_temp.ok(
    has_function_privilege('service_role', 'public.purge_expired_operational_data()', 'execute')
    and not has_function_privilege('anon', 'public.purge_expired_operational_data()', 'execute')
    and not has_function_privilege('authenticated', 'public.purge_expired_operational_data()', 'execute')
    and not has_function_privilege(
      'authenticated', 'private.account_has_real_activity(uuid)', 'execute'
    ),
    'el purge de retención está reservado al job service_role');

  perform pg_temp.ok(
    has_function_privilege(
      'service_role', 'public.purge_expired_transfer_consents()', 'execute'
    )
    and not has_function_privilege(
      'anon', 'public.purge_expired_transfer_consents()', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.purge_expired_transfer_consents()', 'execute'
    )
    and has_table_privilege(
      'service_role', 'public.user_international_transfer_consents', 'select'
    )
    and not has_table_privilege(
      'service_role', 'public.user_international_transfer_consents', 'insert'
    )
    and not has_table_privilege(
      'service_role', 'public.user_international_transfer_consents', 'update'
    )
    and not has_table_privilege(
      'service_role', 'public.user_international_transfer_consents', 'delete'
    ),
    'la evidencia sólo se purga por la RPC service_role de alcance mínimo');

  select count(*) into v_indexes
  from pg_indexes
  where schemaname = 'public' and indexname in (
    'organization_members_user_idx', 'project_comments_parent_idx',
    'claims_responsible_org_idx', 'claim_uploads_owner_idx',
    'project_tasks_assigned_user_idx'
  );
  perform pg_temp.ok(v_indexes = 5, 'los índices prioritarios de FK/autorización existen');

  select count(*) into v_indexes
  from pg_indexes
  where schemaname = 'public' and indexname in (
    'moderation_appeals_retention_idx',
    'user_suspensions_lifted_retention_idx',
    'user_suspensions_expired_retention_idx'
  );
  perform pg_temp.ok(v_indexes = 3, 'las purgas terminales tienen índices parciales');

  select id into v_subject from public.profiles where username = 'sofia_mdq';
  select id into v_community from public.communities where slug = 'earth';

  insert into public.user_suspensions (
    user_id, starts_at, ends_at, reason, created_at
  ) values (
    v_subject, now() - interval '3000 days', now() - interval '2990 days',
    'Suspensión vencida preparada para comprobar la retención.',
    now() - interval '3000 days'
  ) returning id into v_old_suspension;
  insert into public.moderation_appeals (
    suspension_id, appellant_id, body, status, reviewed_at,
    resolution_note, created_at, updated_at
  ) values (
    v_old_suspension, v_subject,
    'Apelación histórica completa preparada para la prueba de retención.',
    'rejected', now() - interval '2600 days',
    'Resolución histórica de la prueba.', now() - interval '2700 days',
    now() - interval '2600 days'
  ) returning id into v_old_appeal;

  insert into public.user_suspensions (
    user_id, starts_at, reason, lifted_at, lift_reason, created_at
  ) values (
    v_subject, now() - interval '3000 days',
    'Suspensión levantada preparada para comprobar la retención.',
    now() - interval '2600 days', 'Levantamiento histórico de la prueba.',
    now() - interval '3000 days'
  ) returning id into v_lifted_suspension;

  insert into public.user_suspensions (
    user_id, starts_at, ends_at, reason, created_at
  ) values (
    v_subject, now() - interval '3000 days', now() - interval '2990 days',
    'Suspensión histórica con una apelación que todavía sigue pendiente.',
    now() - interval '3000 days'
  ) returning id into v_pending_suspension;
  insert into public.moderation_appeals (
    suspension_id, appellant_id, body, status, created_at, updated_at
  ) values (
    v_pending_suspension, v_subject,
    'Esta apelación pendiente conserva el expediente aunque sea antiguo.',
    'pending', now() - interval '2700 days', now() - interval '2700 days'
  ) returning id into v_pending_appeal;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, email_change_confirm_status,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  )
  select
    '00000000-0000-0000-0000-000000000000', d.id, 'authenticated',
    'authenticated', d.email,
    extensions.crypt('AgorbisLocal-2026!', extensions.gen_salt('bf')),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', d.username, 'display_name', d.username),
    d.created_at, d.created_at, '', '', '', '', '', 0, '', '', '', false, false
  from (values
    (v_stale_unconfirmed, 'stale-unconfirmed@agorbis.test',
      'stale_unconfirmed', now() - interval '40 days'),
    (v_active_unconfirmed, 'active-unconfirmed@agorbis.test',
      'active_unconfirmed', now() - interval '40 days'),
    (v_social_unconfirmed, 'social-unconfirmed@agorbis.test',
      'social_unconfirmed', now() - interval '40 days'),
    (v_fresh_unconfirmed, 'fresh-unconfirmed@agorbis.test',
      'fresh_unconfirmed', now() - interval '10 days')
  ) d(id, email, username, created_at);

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  select gen_random_uuid(), d.id,
    jsonb_build_object('sub', d.id::text, 'email', d.email),
    'email', d.id::text, null, d.created_at, d.created_at
  from (values
    (v_stale_unconfirmed, 'stale-unconfirmed@agorbis.test', now() - interval '40 days'),
    (v_active_unconfirmed, 'active-unconfirmed@agorbis.test', now() - interval '40 days'),
    (v_social_unconfirmed, 'social-unconfirmed@agorbis.test', now() - interval '40 days'),
    (v_fresh_unconfirmed, 'fresh-unconfirmed@agorbis.test', now() - interval '10 days')
  ) d(id, email, created_at);
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_social_unconfirmed,
    jsonb_build_object('sub', 'google-retention-probe'),
    'google', 'google-retention-probe', null,
    now() - interval '40 days', now() - interval '40 days'
  );

  insert into public.user_legal_acceptances (
    user_id, document_type, version, minimum_age_attested, accepted_at
  )
  select v_stale_unconfirmed, d.document_type, d.version, true,
    now() - interval '40 days'
  from public.legal_document_versions d where d.is_current;
  insert into public.follows (user_id, community_id)
  values (v_active_unconfirmed, v_community);

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  v_purge := public.purge_expired_operational_data();
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok(
    (v_purge ->> 'moderation_appeals')::integer >= 1
    and (v_purge ->> 'user_suspensions')::integer >= 2
    and not exists (
      select 1 from public.moderation_appeals where id = v_old_appeal
    )
    and not exists (
      select 1 from public.user_suspensions
      where id in (v_old_suspension, v_lifted_suspension)
    )
    and exists (
      select 1 from public.moderation_appeals where id = v_pending_appeal
    )
    and exists (
      select 1 from public.user_suspensions where id = v_pending_suspension
    ),
    'el purge elimina expedientes terminales y conserva apelaciones pendientes');

  perform pg_temp.ok(
    (v_purge ->> 'unconfirmed_accounts')::integer >= 1
    and not exists (
      select 1 from auth.users where id = v_stale_unconfirmed
    )
    and not exists (
      select 1 from public.profiles where id = v_stale_unconfirmed
    )
    and not exists (
      select 1 from public.user_legal_acceptances
      where user_id = v_stale_unconfirmed
    ),
    'el alta vieja sin actividad se borra desde auth.users con sus cascadas');
  perform pg_temp.ok(
    exists (select 1 from auth.users where id = v_active_unconfirmed),
    'una cuenta no confirmada con actividad real se conserva');
  perform pg_temp.ok(
    exists (select 1 from auth.users where id = v_social_unconfirmed),
    'una cuenta con identidad social se conserva');
  perform pg_temp.ok(
    exists (select 1 from auth.users where id = v_fresh_unconfirmed),
    'una cuenta no confirmada de menos de treinta días se conserva');
end $$;

-- =============================================================================
-- 25b · Retención de consentimiento internacional sustituido
-- =============================================================================
do $$
declare
  v_user uuid;
  v_user_without_reacceptance uuid;
  v_current public.international_transfer_notice_versions%rowtype;
  v_deleted integer;
begin
  raise notice '── 25b · retención de consentimiento internacional ──';
  perform pg_temp.as_owner();
  select id into strict v_user
  from public.profiles where username = 'sofia_mdq';
  select id into strict v_user_without_reacceptance
  from public.profiles where username = 'diego_mza';
  select n.* into strict v_current
  from public.international_transfer_notice_versions n
  where n.is_current and n.effective_at <= now();

  perform pg_temp.ok(
    (select relrowsecurity from pg_class
      where oid = 'public.international_transfer_notice_versions'::regclass)
    and (select relrowsecurity from pg_class
      where oid = 'public.user_international_transfer_consents'::regclass)
    and has_table_privilege(
      'anon', 'public.international_transfer_notice_versions', 'select'
    )
    and has_table_privilege(
      'authenticated', 'public.user_international_transfer_consents', 'select'
    )
    and not has_table_privilege(
      'authenticated', 'public.international_transfer_notice_versions', 'update'
    )
    and not has_table_privilege(
      'service_role', 'public.international_transfer_notice_versions', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_international_transfer_consents', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_international_transfer_consents', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_international_transfer_consents', 'delete'
    ),
    'snapshot público y evidencia propia tienen RLS y ACL de sólo lectura');

  insert into public.international_transfer_notice_versions (
    version, content_hash, content_snapshot, content_hash_algorithm,
    provider_register_version, effective_at, superseded_at, is_current
  ) values
    (
      'retention-probe-1', v_current.content_hash,
      v_current.content_snapshot, v_current.content_hash_algorithm,
      'retention-probe', now() - interval '8 years',
      now() - interval '6 years', false
    ),
    (
      'retention-probe-2', v_current.content_hash,
      v_current.content_snapshot, v_current.content_hash_algorithm,
      'retention-probe', now() - interval '1 year',
      now() - interval '6 months', false
    );
  insert into public.user_international_transfer_consents (
    user_id, notice_version, notice_hash, locale, source, accepted_at
  ) values
    (
      v_user, 'retention-probe-1', v_current.content_hash,
      'es', 'account_gate', now() - interval '7 years'
    ),
    (
      v_user, 'retention-probe-2', v_current.content_hash,
      'es', 'account_gate', now() - interval '1 year'
    ),
    (
      v_user_without_reacceptance, 'retention-probe-1',
      v_current.content_hash, 'es', 'account_gate', now() - interval '7 years'
    );
  delete from public.user_international_transfer_consents
  where user_id = v_user_without_reacceptance
    and notice_version = v_current.version;
  -- Vuelve antigua la evidencia vigente para demostrar que nunca se purga
  -- sólo por edad, incluso cuando existe otra aceptación más reciente.
  update public.user_international_transfer_consents
  set accepted_at = now() - interval '6 years'
  where user_id = v_user and notice_version = v_current.version;

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  v_deleted := public.purge_expired_transfer_consents();
  perform pg_temp.as_owner();

  perform pg_temp.ok(
    v_deleted = 2
    and not exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_user and notice_version = 'retention-probe-1'
    )
    and exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_user and notice_version = 'retention-probe-2'
    )
    and exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_user and notice_version = v_current.version
    )
    and not exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_user_without_reacceptance
        and notice_version = 'retention-probe-1'
    ),
    'purga a cinco años de la sustitución aun sin reaceptación y preserva la vigente');
end $$;

do $$
begin
  raise notice '';
  raise notice '════════════════════════════════════════════════';
  raise notice ' TODAS LAS VERIFICACIONES DE RLS PASARON';
  raise notice '════════════════════════════════════════════════';
end $$;

-- Nada de esto queda escrito.
rollback;
