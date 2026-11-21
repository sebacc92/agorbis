-- =============================================================================
-- Agorbis · revisión del draft aislado 0059 (no forma parte de *_checks.sql)
-- -----------------------------------------------------------------------------
-- Ejecutar sólo mediante `pnpm db.test.draft-0059:ephemeral` con confirmación.
-- El runner aplica `supabase/migration-drafts/0059_...sql` en una copia efímera
-- del baseline 0058, sin agregarlo al ledger ni tocar la base local principal.
-- La transaccion revierte el aviso ficticio y todas las aceptaciones de prueba.
-- El snapshot que sigue dice explicitamente TEST y no es contenido legal.
-- =============================================================================

begin;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALLO · %', p_what;
  end if;
  raise notice '  ok   · %', p_what;
end;
$$;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', p_user::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
end;
$$;

grant execute on function pg_temp.ok(boolean, text),
  pg_temp.as_owner(), pg_temp.as_user(uuid)
to anon, authenticated, service_role;

do $test$
declare
  v_user uuid;
  v_other uuid;
  v_target uuid;
  v_first timestamptz;
  v_second timestamptz;
  v_withdrawal timestamptz;
  v_withdrawal_again timestamptz;
  v_count integer;
  v_rejected boolean;
  v_version constant text := '0059-local-review-v1';
  v_hash constant text :=
    'c8494d86a6e21d5e1eb891316de16c54ee98b544c08567f34a190d0a10fd892d';
  v_scopes constant text[] := array[
    'civic_content_publication',
    'civic_opinion_and_debate',
    'civic_support_and_commitments',
    'claims_and_evidence',
    'poll_and_budget_ballots',
    'participation_membership_visibility',
    'safety_reports_and_civic_requests'
  ]::text[];
begin
  perform pg_temp.as_owner();

  if to_regclass('public.sensitive_participation_notice_versions') is null
     or to_regclass('public.user_sensitive_participation_consents') is null then
    raise exception 'FALLO · 0059 no esta aplicada en este target local';
  end if;

  select p.id into strict v_user
  from public.profiles p where p.username = 'sofia_mdq';
  select p.id into strict v_other
  from public.profiles p where p.username = 'bruno_lp';
  select c.id into strict v_target
  from public.communities c
  where not exists (
    select 1 from public.follows f
    where f.user_id = v_user and f.community_id = c.id
  )
  order by c.id
  limit 1;

  -- El test es compatible con una version aprobada futura: la retira solo
  -- dentro de esta transaccion y todo vuelve al estado original con ROLLBACK.
  update public.sensitive_participation_notice_versions
  set is_current = false,
      superseded_at = greatest(effective_at, statement_timestamp())
  where is_current;
  delete from public.user_sensitive_participation_consents
  where user_id in (v_user, v_other);

  perform pg_temp.ok(
    (select count(*) = 0
     from public.user_sensitive_participation_consents
     where user_id = v_user)
    and not private.has_current_sensitive_participation_consent(v_user),
    '0059 no fabrica aceptaciones y sin aviso current falla cerrado'
  );

  perform pg_temp.as_user(v_user);
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true,
    'es'
  );
  perform pg_temp.ok(
    not public.can_participate()
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'status' = 'not_configured',
    'aceptaciones generales y transferencias no sustituyen el consentimiento especifico'
  );

  v_rejected := false;
  begin
    insert into public.follows (user_id, community_id)
    values (v_user, v_target);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'el trigger autoritativo rechaza una escritura civica sin consentimiento'
  );

  perform pg_temp.as_owner();
  insert into public.sensitive_participation_notice_versions (
    version,
    content_hash,
    content_snapshot,
    scope_catalog_version,
    scope_codes,
    effective_at,
    is_current
  ) values (
    v_version,
    v_hash,
    '{"es":{"title":"FIXTURE LOCAL NO PRODUCTIVO","sections":[]},"en":{"title":"NON-PRODUCTION LOCAL FIXTURE","sections":[]}}'::jsonb,
    'agorbis-sensitive-participation-v1',
    v_scopes,
    timestamptz '2000-01-01 00:00:00+00',
    true
  );

  perform pg_temp.as_user(v_user);

  v_rejected := false;
  begin
    insert into public.user_sensitive_participation_consents (
      user_id, notice_version, notice_hash, scope_catalog_version,
      decision, locale, source
    ) values (
      v_user, v_version, v_hash,
      'agorbis-sensitive-participation-v1',
      'accepted', 'es', 'participation_gate'
    );
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'un JWT no puede insertar evidencia de consentimiento directamente'
  );

  v_rejected := false;
  begin
    perform public.grant_current_sensitive_participation_consent(
      v_version, v_hash, false, 'es'
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC exige una accion afirmativa');

  v_rejected := false;
  begin
    perform public.grant_current_sensitive_participation_consent(
      v_version, repeat('0', 64), true, 'es'
    );
  exception when object_not_in_prerequisite_state then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza un hash distinto del mostrado');

  v_rejected := false;
  begin
    perform public.grant_current_sensitive_participation_consent(
      v_version, v_hash, true, null
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'la RPC rechaza locale nulo');

  v_first := public.grant_current_sensitive_participation_consent(
    v_version, v_hash, true, 'es'
  );
  v_second := public.grant_current_sensitive_participation_consent(
    v_version, v_hash, true, 'en'
  );
  select count(*) into v_count
  from public.user_sensitive_participation_consents c
  where c.user_id = v_user and c.notice_version = v_version;
  perform pg_temp.ok(
    v_count = 1
    and v_first = v_second
    and public.can_participate()
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'status' = 'accepted'
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'version' = v_version
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'content_hash' = v_hash
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'scope_catalog_version'
        = 'agorbis-sensitive-participation-v1',
    'la aceptacion exacta es propia, inmutable, idempotente y habilita el gate'
  );

  v_withdrawal := public.withdraw_current_sensitive_participation_consent(
    v_version, v_hash
  );
  v_withdrawal_again := public.withdraw_current_sensitive_participation_consent(
    v_version, v_hash
  );
  perform pg_temp.ok(
    v_withdrawal is not null
    and v_withdrawal = v_withdrawal_again
    and not public.can_participate()
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'status' = 'withdrawn',
    'el retiro es propio, idempotente y deja la cuenta en lectura'
  );
  perform pg_temp.ok(
    (select count(*) = 2
     from public.user_sensitive_participation_consents
     where user_id = v_user and notice_version = v_version),
    'el retiro agrega un evento inmutable sin reescribir la aceptacion'
  );

  perform public.grant_current_sensitive_participation_consent(
    v_version, v_hash, true, 'es'
  );
  perform pg_temp.ok(
    public.can_participate()
    and public.my_legal_status()
      -> 'sensitive_participation_consent' ->> 'status' = 'accepted'
    and (select count(*) = 3
      from public.user_sensitive_participation_consents
      where user_id = v_user and notice_version = v_version),
    'una nueva accion afirmativa revierte el retiro sin backfill'
  );

  insert into public.follows (user_id, community_id)
  values (v_user, v_target);
  delete from public.follows
  where user_id = v_user and community_id = v_target;

  perform pg_temp.as_owner();
  insert into public.user_sensitive_participation_consents (
    user_id, notice_version, notice_hash, scope_catalog_version,
    decision, locale, source
  ) values (
    v_other, v_version, v_hash,
    'agorbis-sensitive-participation-v1',
    'accepted', 'es', 'participation_gate'
  );
  perform pg_temp.as_user(v_user);
  perform pg_temp.ok(
    (select count(*) = 3 from public.user_sensitive_participation_consents)
    and not exists (
      select 1 from public.user_sensitive_participation_consents
      where user_id = v_other
    ),
    'RLS permite leer solo la aceptacion propia'
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    has_table_privilege(
      'anon', 'public.sensitive_participation_notice_versions', 'select'
    )
    and has_table_privilege(
      'authenticated', 'public.sensitive_participation_notice_versions', 'select'
    )
    and not has_table_privilege(
      'anon', 'public.user_sensitive_participation_consents', 'select'
    )
    and has_table_privilege(
      'authenticated', 'public.user_sensitive_participation_consents', 'select'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_sensitive_participation_consents', 'insert'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_sensitive_participation_consents', 'update'
    )
    and not has_table_privilege(
      'authenticated', 'public.user_sensitive_participation_consents', 'delete'
    )
    and not has_sequence_privilege(
      'authenticated',
      'public.user_sensitive_participation_consents_event_id_seq',
      'usage'
    )
    and has_function_privilege(
      'authenticated',
      'public.grant_current_sensitive_participation_consent(text,text,boolean,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.grant_current_sensitive_participation_consent(text,text,boolean,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.grant_current_sensitive_participation_consent(text,text,boolean,text)',
      'execute'
    )
    and has_function_privilege(
      'authenticated',
      'public.withdraw_current_sensitive_participation_consent(text,text)',
      'execute'
    )
    and not has_function_privilege(
      'anon',
      'public.withdraw_current_sensitive_participation_consent(text,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'public.withdraw_current_sensitive_participation_consent(text,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.has_current_sensitive_participation_consent(uuid)',
      'execute'
    ),
    'ACL: notice publico, evidencia propia y unica escritura por RPC autenticada'
  );

  perform pg_temp.ok(
    not exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.proname in (
          'grant_current_sensitive_participation_consent',
          'withdraw_current_sensitive_participation_consent',
          'has_current_sensitive_participation_consent',
          'has_current_legal_acceptance',
          'my_legal_status'
        )
        and not exists (
          select 1
          from unnest(coalesce(p.proconfig, '{}'::text[])) setting
          where setting like 'search_path=%'
        )
    ),
    'todas las funciones tocadas fijan search_path'
  );

  -- Sustituir el aviso invalida automaticamente la aceptacion anterior. No se
  -- tolera una version obsoleta aunque su fila historica siga existiendo.
  update public.sensitive_participation_notice_versions
  set is_current = false,
      superseded_at = statement_timestamp()
  where version = v_version;
  perform pg_temp.as_user(v_user);
  perform pg_temp.ok(
    not public.can_participate(),
    'un aviso sustituido invalida inmediatamente la habilitacion anterior'
  );
end;
$test$;

rollback;
