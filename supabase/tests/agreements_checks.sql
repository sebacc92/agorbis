-- =============================================================================
-- Agorbis · Verificación de acuerdos entre comunidades (0074, D118)
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS del seed, con psql o por `pnpm db.test`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/agreements_checks.sql
--
-- Todo corre en una transacción que termina en ROLLBACK. Cada aserción falla
-- ruidosamente. Cubre los criterios de la spec: propuesta sin votación (#1),
-- adhesión que abre con cierre calculado (#2, #8), voto secreto sin conteos
-- (#3), resultados por comunidad (#4, #5, #6), sin adhesión a los 30 días (#7,
-- #11), elegibilidad y duración rechazadas por la base (#9, #10), retiro (#12),
-- y que las rondas no aparezcan como encuestas comunes.
-- =============================================================================

begin;

create or replace function pg_temp.as_user(p_username text)
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
    json_build_object('sub', v_id::text, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es');
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

-- Moderación con MFA (aal2), igual que en child_visibility_checks.
create or replace function pg_temp.as_moderator()
returns void language plpgsql as $$
declare
  v_id uuid;
  v_factor uuid;
  v_session uuid := gen_random_uuid();
begin
  perform pg_temp.as_owner();
  select id into v_id
  from public.profiles
  where username = 'mod_nacional';
  select approved.factor_id into v_factor
  from private.privileged_mfa_factors approved
  where approved.user_id = v_id
  order by approved.approved_at desc
  limit 1;
  if v_id is null or v_factor is null then
    raise exception 'El moderador demo no tiene TOTP aprobado';
  end if;
  insert into auth.sessions (
    id, user_id, created_at, updated_at, factor_id, aal
  ) values (
    v_session, v_id, statement_timestamp(), statement_timestamp(),
    v_factor, 'aal2'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_id::text,
      'role', 'authenticated',
      'aal', 'aal2',
      'session_id', v_session::text
    )::text,
    true
  );
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
end;
$$;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice '  ok   · %', p_what;
  else
    raise exception 'FALLÓ · %', p_what;
  end if;
end $$;

-- Ejecuta una sentencia esperando que falle con un mensaje dado.
create or replace function pg_temp.expect_error(p_sql text, p_message text, p_what text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_message || '%' then
      raise notice '  ok   · % (%)', p_what, p_message;
      return;
    end if;
    raise exception 'FALLÓ · %: falló con "%" y se esperaba "%"', p_what, sqlerrm, p_message;
  end;
  raise exception 'FALLÓ · %: no falló y se esperaba "%"', p_what, p_message;
end $$;

grant execute on function pg_temp.as_user(text) to anon, authenticated, service_role;
grant execute on function pg_temp.as_anon() to anon, authenticated, service_role;
grant execute on function pg_temp.as_owner() to anon, authenticated, service_role;
grant execute on function pg_temp.as_moderator() to anon, authenticated, service_role;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated, service_role;
grant execute on function pg_temp.expect_error(text, text, text) to anon, authenticated, service_role;

do $$
declare
  v_mdq uuid := (select id from public.communities where slug = 'mar-del-plata');
  v_tandil uuid := (select id from public.communities where slug = 'tandil');
  v_necochea uuid := (select id from public.communities where slug = 'necochea');
  v_ba uuid := (select id from public.communities where slug = 'buenos-aires');
  v_argentina uuid := (select id from public.communities where slug = 'argentina');
  v_foreign uuid := (select id from public.communities where slug = 'afganistan-badakhshan');
  v_sofia uuid := (select id from public.profiles where username = 'sofia_mdq');
  v_flor uuid := (select id from public.profiles where username = 'flor_tandil');
  v_quota_before integer;
  v_body constant text := 'Las dos ciudades se comprometen a coordinar el mantenimiento de la ruta costera y a publicar cada trimestre el avance de las obras.';
  v_agreement uuid;
  v_second uuid;
  v_state jsonb;
  v_poll_mdq uuid;
  v_poll_tandil uuid;
  v_yes uuid;
  v_no uuid;
  v_opened timestamptz;
  v_closes timestamptz;
  v_before text;
  v_mod uuid := (select id from public.profiles where username = 'mod_nacional');
begin
  raise notice '--- Propuesta (#1, #9, #10) ---';
  perform pg_temp.as_user('sofia_mdq');

  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 14)', 'Acuerdo con la provincia', v_body, array[v_ba]),
    'AGORBIS_AGREEMENT_NESTED_COMMUNITIES', 'una comunidad que contiene a la propia se rechaza');
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 14)', 'Acuerdo con el país', v_body, array[v_argentina]),
    'AGORBIS_AGREEMENT_INELIGIBLE_LEVEL', 'el país no participa');
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 14)', 'Acuerdo internacional', v_body, array[v_foreign]),
    'AGORBIS_AGREEMENT_MIXED_COUNTRIES', 'otro país se rechaza');
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 5)', 'Acuerdo demasiado corto', v_body, array[v_tandil]),
    'AGORBIS_AGREEMENT_DURATION', 'duración menor a 7 días se rechaza');
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 31)', 'Acuerdo demasiado largo', v_body, array[v_tandil]),
    'AGORBIS_AGREEMENT_DURATION', 'duración mayor a 30 días se rechaza');
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 14)', 'Acuerdo con texto corto', 'Muy corto.', array[v_tandil]),
    'agreements_body_len_chk', 'un cuerpo menor a 50 caracteres se rechaza');

  v_agreement := public.propose_agreement('Ruta costera compartida', v_body, array[v_tandil], 14);
  perform pg_temp.ok(v_agreement is not null, 'Sofía propone un acuerdo Mar del Plata + Tandil');
  perform pg_temp.ok(
    (select count(*) from public.agreement_parties where agreement_id = v_agreement) = 2,
    'la comunidad de la proponente participa siempre: dos partes');
  perform pg_temp.ok(
    (select status from public.agreements where id = v_agreement) = 'proposed'
    and not exists (select 1 from public.polls where agreement_id = v_agreement),
    'queda propuesto y no hay ninguna votación abierta (#1)');
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(v_state ->> 'status_derived' = 'proposed', 'estado derivado: propuesto');
  perform pg_temp.ok((v_state -> 'viewer' ->> 'can_withdraw')::boolean, 'la proponente puede retirar');
  perform pg_temp.ok(not (v_state -> 'viewer' ->> 'can_adhere')::boolean, 'la proponente no puede adherir su propia parte');

  raise notice '--- Adhesión (#2, #8) ---';
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT_PROPOSER_CANNOT_ADHERE', 'la proponente no adhiere');

  perform pg_temp.as_user('carla_cba');
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT_NOT_A_MEMBER', 'alguien de otra comunidad no adhiere');

  perform pg_temp.as_user('admin_geo');
  perform public.adhere_agreement(v_agreement);
  perform pg_temp.ok(
    (select adhered_at is not null from public.agreement_parties where agreement_id = v_agreement and community_id = v_mdq),
    'otra residente de Mar del Plata adhiere su comunidad');
  perform pg_temp.ok(
    (select status from public.agreements where id = v_agreement) = 'proposed'
    and not exists (select 1 from public.polls where agreement_id = v_agreement),
    'con una adhesión pendiente sigue propuesto y sin votación');
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT_ALREADY_ADHERED', 'la misma comunidad no adhiere dos veces');

  -- quota_remaining no está concedida a authenticated: se mide como dueña.
  perform pg_temp.as_owner();
  v_quota_before := public.quota_remaining(v_flor, 4::smallint, 'poll');
  perform pg_temp.as_user('flor_tandil');
  perform public.adhere_agreement(v_agreement);
  select opened_at, closes_at into v_opened, v_closes from public.agreements where id = v_agreement;
  perform pg_temp.ok(
    (select status from public.agreements where id = v_agreement) = 'voting'
    and v_opened is not null and v_closes = v_opened + interval '14 days',
    'la última adhesión abre la votación con cierre = apertura + duración (#2)');
  select poll_id into v_poll_mdq from public.agreement_parties where agreement_id = v_agreement and community_id = v_mdq;
  select poll_id into v_poll_tandil from public.agreement_parties where agreement_id = v_agreement and community_id = v_tandil;
  perform pg_temp.ok(
    v_poll_mdq is not null and v_poll_tandil is not null
    and (select count(distinct closes_at) from public.polls where agreement_id = v_agreement) = 1
    and (select closes_at from public.polls where id = v_poll_mdq) = v_closes,
    'las dos rondas comparten la misma fecha de cierre (#8)');
  perform pg_temp.ok(
    (select count(*) from public.poll_options where poll_id = v_poll_mdq) = 2
    and (select type from public.polls where id = v_poll_mdq) = 'binary',
    'cada ronda es una encuesta binaria Sí/No');
  perform pg_temp.ok(
    (select community_id from public.polls where id = v_poll_tandil) = v_tandil,
    'la ronda de Tandil vive en Tandil');
  perform pg_temp.expect_error(
    format('select public.withdraw_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT_NOT_PROPOSER', 'sólo la proponente retira');
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.expect_error(
    format('select public.withdraw_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT_NOT_PROPOSED', 'abierta la votación ya no se retira (#12)');

  raise notice '--- Nadie cierra una ronda ajena ---';
  perform pg_temp.as_user('flor_tandil');
  perform pg_temp.expect_error(
    format('update public.polls set status = %L where id = %L', 'closed', v_poll_mdq),
    'AGORBIS_AGREEMENT_ROUND_LOCKED', 'la autora técnica de las rondas no puede cerrar la de otra comunidad');
  perform pg_temp.expect_error(
    format('update public.polls set status = %L where id = %L', 'removed', v_poll_tandil),
    'AGORBIS_AGREEMENT_ROUND_LOCKED', 'ni remover la de la propia');
  perform pg_temp.ok(
    (select count(*) from public.polls where agreement_id = v_agreement and status = 'active') = 2,
    'las dos rondas siguen activas');
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    public.quota_remaining(v_flor, 4::smallint, 'poll') is not distinct from v_quota_before,
    'abrir las rondas no consumió la cuota mensual de encuestas de quien adhirió último');
  perform pg_temp.as_user('sofia_mdq');

  raise notice '--- Las rondas no son encuestas comunes ---';
  perform pg_temp.ok(
    not exists (select 1 from public.poll_feed(v_mdq, 100) f where f.id = v_poll_mdq),
    'poll_feed no lista la ronda de Mar del Plata');
  perform pg_temp.ok(
    not exists (select 1 from public.personalized_feed(v_sofia, 100, null, null, null, null) f where f.kind = 'poll' and f.id = v_poll_mdq),
    'el inicio no lista la ronda como encuesta');
  perform pg_temp.ok(
    exists (select 1 from public.personalized_feed(v_sofia, 100, null, null, null, null) f
            where f.kind = 'agreement' and f.id = v_agreement and f.status = 'voting' and f.engagement = 2),
    'el inicio lista el acuerdo una vez, en votación, con dos comunidades adheridas');
  perform pg_temp.ok(
    (select count(*) from public.personalized_feed(v_sofia, 100, null, null, null, null) f where f.id = v_agreement) = 1,
    'el acuerdo aparece una sola vez aunque haya varias partes');
  perform pg_temp.ok(
    exists (select 1 from public.community_agreements(v_tandil, 10) g where g.id = v_agreement and g.status_derived = 'voting'),
    'la sección de la comunidad lo lista con su estado');

  raise notice '--- Voto secreto (#3) ---';
  select id into v_yes from public.poll_options where poll_id = v_poll_mdq and sort_order = 0;
  select id into v_no from public.poll_options where poll_id = v_poll_mdq and sort_order = 1;
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok((v_state -> 'viewer' ->> 'can_vote')::boolean, 'Sofía puede votar en su ronda');
  perform public.cast_poll_ballot(v_poll_mdq, array[v_yes]);
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(
    (v_state -> 'viewer' ->> 'has_receipt')::boolean and not (v_state -> 'viewer' ->> 'can_vote')::boolean,
    'tras votar queda la constancia y no puede votar de nuevo');
  perform pg_temp.ok(
    v_state ->> 'status_derived' = 'voting'
    and (select count(*) from jsonb_array_elements(v_state -> 'parties') p where p ->> 'outcome' = 'pending') = 2
    and (select count(*) from jsonb_array_elements(v_state -> 'parties') p where p ->> 'participants' is not null) = 0,
    'durante la ronda: pendiente, sin participantes ni conteos (#3)');
  perform pg_temp.ok(
    not exists (select 1 from public.poll_results(v_poll_mdq)),
    'poll_results no devuelve nada durante la ronda');
  perform pg_temp.expect_error(
    format('select public.cast_poll_ballot(%L, %L::uuid[])', v_poll_tandil, array[(select id from public.poll_options where poll_id = v_poll_tandil and sort_order = 0)]),
    'AGORBIS_COMMUNITY_MEMBERSHIP_REQUIRED', 'Sofía no vota en la ronda de Tandil');

  raise notice '--- Visitante (#13) ---';
  perform pg_temp.as_anon();
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(
    v_state ->> 'title' = 'Ruta costera compartida'
    and not (v_state -> 'viewer' ->> 'can_vote')::boolean
    and not (v_state -> 'viewer' ->> 'can_adhere')::boolean
    and not (v_state -> 'viewer' ->> 'can_withdraw')::boolean,
    'sin sesión se lee todo y no se puede actuar');
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_agreement),
    'permission denied', 'sin sesión no se adhiere: anon no tiene ejecución');

  raise notice '--- Resultados por comunidad (#4, #5, #6) ---';
  perform pg_temp.as_owner();
  -- Se simula el cierre y los tallies como lo haría el paso del tiempo y los
  -- votos reales: la función de estado sólo lee.
  update public.polls set closes_at = now() - interval '1 hour' where agreement_id = v_agreement;
  update public.agreements set closes_at = now() - interval '1 hour' where id = v_agreement;
  delete from private.poll_option_tallies where poll_id in (v_poll_mdq, v_poll_tandil);
  insert into private.poll_option_tallies (poll_id, option_id, votes, participants)
  select v_poll_mdq, o.id, case when o.sort_order = 0 then 4 else 2 end, 6
  from public.poll_options o where o.poll_id = v_poll_mdq;
  insert into private.poll_option_tallies (poll_id, option_id, votes, participants)
  select v_poll_tandil, o.id, case when o.sort_order = 0 then 1 else 1 end, 2
  from public.poll_options o where o.poll_id = v_poll_tandil;

  perform pg_temp.as_anon();
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(
    v_state ->> 'status_derived' = 'no_quorum',
    'una comunidad con menos de cinco participantes deja el acuerdo sin quórum (#6)');
  perform pg_temp.ok(
    (select p ->> 'outcome' from jsonb_array_elements(v_state -> 'parties') p where p ->> 'slug' = 'mar-del-plata') = 'approved'
    and (select (p ->> 'participants')::int from jsonb_array_elements(v_state -> 'parties') p where p ->> 'slug' = 'mar-del-plata') = 6,
    'Mar del Plata aprobó con 6 participantes y lo muestra');
  perform pg_temp.ok(
    (select p ->> 'outcome' from jsonb_array_elements(v_state -> 'parties') p where p ->> 'slug' = 'tandil') = 'no_quorum'
    and (select p ->> 'participants' from jsonb_array_elements(v_state -> 'parties') p where p ->> 'slug' = 'tandil') is null,
    'Tandil quedó sin quórum y no muestra conteo (#6)');

  perform pg_temp.as_owner();
  update private.poll_option_tallies t set votes = case when o.sort_order = 0 then 2 else 5 end, participants = 7
  from public.poll_options o where o.id = t.option_id and t.poll_id = v_poll_tandil;
  perform pg_temp.as_anon();
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(
    v_state ->> 'status_derived' = 'rejected'
    and (select p ->> 'outcome' from jsonb_array_elements(v_state -> 'parties') p where p ->> 'slug' = 'tandil') = 'rejected',
    'una comunidad que rechaza vuelve rechazado al acuerdo y se ve cuál (#5)');

  perform pg_temp.as_owner();
  update private.poll_option_tallies t set votes = case when o.sort_order = 0 then 5 else 2 end, participants = 7
  from public.poll_options o where o.id = t.option_id and t.poll_id = v_poll_tandil;
  perform pg_temp.as_anon();
  v_state := public.agreement_state(v_agreement);
  perform pg_temp.ok(
    v_state ->> 'status_derived' = 'approved',
    'con todas aprobando y con quórum, el acuerdo queda aprobado (#4)');
  perform pg_temp.ok(
    exists (select 1 from public.community_agreements(v_mdq, 10) g where g.id = v_agreement and g.status_derived = 'approved'),
    'la sección de la comunidad refleja el estado final');

  perform pg_temp.as_owner();
  update private.poll_option_tallies t set votes = 3, participants = 6
  from public.poll_options o where o.id = t.option_id and t.poll_id = v_poll_tandil;
  perform pg_temp.as_anon();
  perform pg_temp.ok(
    public.agreement_state(v_agreement) ->> 'status_derived' = 'rejected',
    'el empate no aprueba');

  raise notice '--- Retiro y ventana de adhesión (#7, #11, #12) ---';
  perform pg_temp.as_user('sofia_mdq');
  v_second := public.propose_agreement('Feria regional de productores', v_body, array[v_necochea], 7);
  perform public.withdraw_agreement(v_second);
  perform pg_temp.ok(
    (select status from public.agreements where id = v_second) = 'withdrawn'
    and public.agreement_state(v_second) ->> 'status_derived' = 'withdrawn',
    'la proponente retira una propuesta sin abrir (#12)');
  perform pg_temp.ok(
    not exists (select 1 from public.personalized_feed(v_sofia, 100, null, null, null, 'agreement') f where f.id = v_second),
    'una propuesta retirada no aparece en el inicio');
  perform pg_temp.ok(
    not exists (select 1 from public.personalized_feed(v_sofia, 100, null, null) f where f.kind = 'poll' and f.id in (v_poll_mdq, v_poll_tandil)),
    'la sobrecarga de cuatro argumentos tampoco lista las rondas como encuestas');

  v_second := public.propose_agreement('Transporte escolar compartido', v_body, array[v_necochea], 7);
  perform pg_temp.as_owner();
  update public.agreements set created_at = now() - interval '31 days' where id = v_second;
  perform pg_temp.as_user('admin_geo');
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_second),
    'AGORBIS_AGREEMENT_LAPSED', 'pasados 30 días sin la última adhesión ya no se adhiere (#11)');
  perform pg_temp.ok(
    public.agreement_state(v_second) ->> 'status_derived' = 'lapsed'
    and not exists (select 1 from public.polls where agreement_id = v_second),
    'la propuesta vencida queda sin adhesión y sin votación (#7)');
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.ok(
    public.agreement_state(v_second) -> 'viewer' ->> 'can_withdraw' = 'false',
    'una propuesta vencida ya no ofrece retirarla');
  perform pg_temp.expect_error(
    format('select public.withdraw_agreement(%L)', v_second),
    'AGORBIS_AGREEMENT_LAPSED', 'ni la base deja retirar una propuesta vencida');

  -- Quien propuso borró su cuenta: proposer_id queda en null (on delete set
  -- null) y las banderas tienen que seguir siendo booleanos, nunca null.
  perform pg_temp.as_user('admin_geo');
  v_second := public.propose_agreement('Acuerdo sin proponente', v_body, array[v_necochea], 7);
  perform pg_temp.as_owner();
  update public.agreements set proposer_id = null where id = v_second;
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.ok(
    jsonb_typeof(public.agreement_state(v_second) -> 'viewer' -> 'can_withdraw') = 'boolean'
    and public.agreement_state(v_second) -> 'viewer' ->> 'can_withdraw' = 'false'
    and jsonb_typeof(public.agreement_state(v_second) -> 'viewer' -> 'can_adhere') = 'boolean',
    'con la cuenta de quien propuso borrada, las banderas siguen siendo booleanos');
  perform pg_temp.ok(
    public.agreement_state(v_second) ->> 'status_derived' = 'proposed',
    'y el acuerdo sigue propuesto, a la espera de adhesión');

  raise notice '--- Cuota propia ---';
  perform pg_temp.as_user('sofia_mdq');
  perform public.propose_agreement('Acuerdo pendiente número uno', v_body, array[v_necochea], 7);
  perform public.propose_agreement('Acuerdo pendiente número dos', v_body, array[v_necochea], 7);
  perform public.propose_agreement('Acuerdo pendiente número tres', v_body, array[v_necochea], 7);
  perform pg_temp.expect_error(
    format('select public.propose_agreement(%L, %L, %L::uuid[], 7)', 'Acuerdo pendiente número cuatro', v_body, array[v_necochea]),
    'AGORBIS_AGREEMENT_TOO_MANY_PENDING', 'tres propuestas esperando adhesión es el tope');

  raise notice '--- Nadie escribe directo ---';
  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.expect_error(
    format('insert into public.agreements (title, body, proposer_id, proposer_community_id, duration_days) values (%L, %L, %L, %L, 7)',
      'Inserción directa prohibida', v_body, v_sofia, v_mdq),
    'permission denied', 'authenticated no inserta en agreements');
  perform pg_temp.expect_error(
    format('update public.agreements set status = %L where id = %L', 'withdrawn', v_agreement),
    'permission denied', 'authenticated no actualiza agreements');
  perform pg_temp.expect_error(
    format('insert into public.agreement_parties (agreement_id, community_id) values (%L, %L)', v_agreement, v_necochea),
    'permission denied', 'authenticated no inserta en agreement_parties');
  perform pg_temp.expect_error(
    format('update public.agreement_parties set adhered_at = now() where agreement_id = %L', v_agreement),
    'permission denied', 'authenticated no actualiza agreement_parties');
  perform pg_temp.expect_error(
    format('delete from public.agreement_parties where agreement_id = %L', v_agreement),
    'permission denied', 'authenticated no borra agreement_parties');

  raise notice '--- Una parte sin ronda nunca aprueba sola ---';
  perform pg_temp.as_owner();
  update public.agreement_parties set poll_id = null where agreement_id = v_agreement and community_id = v_tandil;
  perform pg_temp.ok(
    public.agreement_state(v_agreement) ->> 'status_derived' = 'voting',
    'con una parte sin ronda el acuerdo queda en votación, no aprobado');

  raise notice '--- Moderación (D120) ---';
  perform pg_temp.as_owner();
  update public.agreement_parties set poll_id = v_poll_tandil where agreement_id = v_agreement and community_id = v_tandil;
  v_before := public.agreement_state(v_agreement) ->> 'status_derived';

  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.expect_error(
    format('select public.moderate_agreement(%L, %L)', v_agreement, 'hide'),
    'AGORBIS_AGREEMENT_MODERATOR_REQUIRED', 'una residente sin rol no oculta un acuerdo');
  perform pg_temp.ok(
    public.can_manage_content(v_sofia, 'agreement', v_agreement),
    'quien propuso gestiona su acuerdo (raw_content_author)');
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (v_sofia, 'agreement', v_agreement, 'Prueba: el título no describe el compromiso');
  perform pg_temp.ok(
    exists (select 1 from public.reports where target_type = 'agreement' and target_id = v_agreement),
    'un acuerdo se puede reportar');

  perform pg_temp.as_user('flor_tandil');
  perform pg_temp.ok(
    not public.can_manage_content(v_flor, 'agreement', v_agreement),
    'otra residente no gestiona el acuerdo ajeno');

  perform pg_temp.as_moderator();
  perform pg_temp.expect_error(
    format('select public.moderate_agreement(%L, %L)', v_agreement, 'borrar'),
    'AGORBIS_AGREEMENT_UNKNOWN_ACTION', 'una acción desconocida se rechaza');
  perform public.moderate_agreement(v_agreement, 'hide');
  perform pg_temp.ok(
    (select status from public.agreements where id = v_agreement) = 'removed'
    and (select status_before_removal from public.agreements where id = v_agreement) = 'voting'
    and (select removed_by from public.agreements where id = v_agreement) = v_mod,
    'moderación oculta el acuerdo y queda el estado previo y quién lo hizo');
  perform pg_temp.ok(
    public.agreement_state(v_agreement) ->> 'status_derived' = 'removed',
    'moderación sigue viendo la ficha, con estado removido');
  perform pg_temp.ok(
    (select count(*) from public.polls where agreement_id = v_agreement and status <> 'removed') = 0,
    'las rondas se ocultan con el acuerdo');
  perform pg_temp.ok(
    (select count(*) from public.moderation_audit_log
     where action = 'hide' and target_type = 'agreements' and target_id = v_agreement and moderator_id = v_mod) = 1,
    'queda rastro en la auditoría de moderación');
  perform public.moderate_agreement(v_agreement, 'hide');
  perform pg_temp.ok(
    (select count(*) from public.moderation_audit_log where action = 'hide' and target_id = v_agreement) = 1,
    'ocultar dos veces no duplica nada');

  perform pg_temp.as_anon();
  perform pg_temp.ok(
    (select count(*) from public.agreements where id = v_agreement) = 0
    and (select count(*) from public.agreement_parties where agreement_id = v_agreement) = 0,
    'una visitante no ve el acuerdo removido ni sus partes');
  perform pg_temp.ok(public.agreement_state(v_agreement) is null, 'la ficha responde como inexistente');
  perform pg_temp.ok(
    not exists (select 1 from public.community_agreements(v_mdq, 50) c where c.id = v_agreement),
    'no aparece en la sección Acuerdos de la comunidad');
  perform pg_temp.ok(
    (select count(*) from public.polls where agreement_id = v_agreement) = 0,
    'sus rondas tampoco se ven');

  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.ok(
    not exists (select 1 from public.personalized_feed(v_sofia, 100, null, null, null, 'agreement') f where f.id = v_agreement),
    'no aparece en el inicio');
  perform pg_temp.expect_error(
    format('select public.adhere_agreement(%L)', v_agreement),
    'AGORBIS_AGREEMENT', 'nadie adhiere a un acuerdo removido');

  perform pg_temp.as_moderator();
  perform public.moderate_agreement(v_agreement, 'restore');
  perform pg_temp.ok(
    (select status from public.agreements where id = v_agreement) = 'voting'
    and (select removed_at is null and status_before_removal is null from public.agreements where id = v_agreement),
    'restaurar vuelve exactamente al estado previo y limpia la baja');
  perform pg_temp.ok(
    public.agreement_state(v_agreement) ->> 'status_derived' = v_before,
    'el estado derivado es el mismo de antes de ocultar');
  perform pg_temp.ok(
    (select count(*) from public.polls where agreement_id = v_agreement and status = 'active') = 2,
    'las rondas vuelven con el acuerdo');
  perform pg_temp.ok(
    (select count(*) from public.moderation_audit_log
     where action = 'restore' and target_type = 'agreements' and target_id = v_agreement) = 1,
    'restaurar también deja rastro');

  perform pg_temp.as_anon();
  perform pg_temp.ok(
    (select count(*) from public.agreements where id = v_agreement) = 1,
    'restaurado, vuelve a verse');

  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.expect_error(
    format('update public.agreements set status = %L where id = %L', 'removed', v_agreement),
    'permission denied', 'authenticated tampoco oculta por UPDATE directo');

  raise notice 'Acuerdos: todas las verificaciones pasaron.';
end $$;

rollback;
