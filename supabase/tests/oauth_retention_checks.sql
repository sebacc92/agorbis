-- Agorbis · cuentas OAuth abandonadas sin consentimiento.
begin;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALLÓ · %', p_what;
  end if;
  raise notice '  ok   · %', p_what;
end;
$$;

do $$
declare
  v_abandoned uuid := gen_random_uuid();
  v_recent uuid := gen_random_uuid();
  v_accepted uuid := gen_random_uuid();
  v_mixed uuid := gen_random_uuid();
  v_active uuid := gen_random_uuid();
  v_recent_visit uuid := gen_random_uuid();
  v_deleted integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    email_change_confirm_status, phone_change, phone_change_token,
    reauthentication_token, is_sso_user, is_anonymous
  ) values
    (
      '00000000-0000-0000-0000-000000000000', v_abandoned,
      'authenticated', 'authenticated',
      'oauth-abandoned@agorbis.test', '', now() - interval '40 days',
      now() - interval '40 days',
      '{"provider":"google","providers":["google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_abandoned'),
      now() - interval '40 days', now() - interval '40 days',
      '', '', '', '', '', 0, '', '', '', true, false
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_recent,
      'authenticated', 'authenticated',
      'oauth-recent@agorbis.test', '', now() - interval '40 days', now(),
      '{"provider":"google","providers":["google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_recent'),
      now() - interval '40 days', now(),
      '', '', '', '', '', 0, '', '', '', true, false
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_accepted,
      'authenticated', 'authenticated',
      'oauth-accepted@agorbis.test', '', now() - interval '40 days',
      now() - interval '40 days',
      '{"provider":"google","providers":["google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_accepted'),
      now() - interval '40 days', now() - interval '40 days',
      '', '', '', '', '', 0, '', '', '', true, false
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_mixed,
      'authenticated', 'authenticated',
      'oauth-mixed@agorbis.test', crypt('AgorbisMixed-2026!', gen_salt('bf')),
      now() - interval '40 days', now() - interval '40 days',
      '{"provider":"email","providers":["email","google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_mixed'),
      now() - interval '40 days', now() - interval '40 days',
      '', '', '', '', '', 0, '', '', '', false, false
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_active,
      'authenticated', 'authenticated',
      'oauth-active@agorbis.test', '', now() - interval '40 days',
      now() - interval '40 days',
      '{"provider":"google","providers":["google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_active'),
      now() - interval '40 days', now() - interval '40 days',
      '', '', '', '', '', 0, '', '', '', true, false
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_recent_visit,
      'authenticated', 'authenticated',
      'oauth-recent-visit@agorbis.test', '', now() - interval '40 days',
      now() - interval '40 days',
      '{"provider":"google","providers":["google"]}'::jsonb,
      jsonb_build_object('username', 'oauth_recent_visit'),
      now() - interval '40 days', now() - interval '40 days',
      '', '', '', '', '', 0, '', '', '', true, false
    );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values
    (
      gen_random_uuid(), v_abandoned,
      jsonb_build_object('sub', 'oauth-abandoned', 'email', 'oauth-abandoned@agorbis.test'),
      'google', 'oauth-abandoned', now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    ),
    (
      gen_random_uuid(), v_recent,
      jsonb_build_object('sub', 'oauth-recent', 'email', 'oauth-recent@agorbis.test'),
      'google', 'oauth-recent', now(), now() - interval '40 days', now()
    ),
    (
      gen_random_uuid(), v_accepted,
      jsonb_build_object('sub', 'oauth-accepted', 'email', 'oauth-accepted@agorbis.test'),
      'google', 'oauth-accepted', now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    ),
    (
      gen_random_uuid(), v_mixed,
      jsonb_build_object('sub', v_mixed::text, 'email', 'oauth-mixed@agorbis.test'),
      'email', v_mixed::text, now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    ),
    (
      gen_random_uuid(), v_mixed,
      jsonb_build_object('sub', 'oauth-mixed-google', 'email', 'oauth-mixed@agorbis.test'),
      'google', 'oauth-mixed-google', now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    ),
    (
      gen_random_uuid(), v_active,
      jsonb_build_object('sub', 'oauth-active', 'email', 'oauth-active@agorbis.test'),
      'google', 'oauth-active', now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    ),
    (
      gen_random_uuid(), v_recent_visit,
      jsonb_build_object('sub', 'oauth-recent-visit', 'email', 'oauth-recent-visit@agorbis.test'),
      'google', 'oauth-recent-visit', now() - interval '40 days',
      now() - interval '40 days', now() - interval '40 days'
    );

  -- La pantalla de consentimiento carga el viewer y registra estas métricas
  -- antes de que exista aceptación. No deben impedir la purga del abandono.
  insert into public.activation_events (user_id, event, event_date, created_at)
  values
    (v_abandoned, 'visit', current_date - 35, now() - interval '35 days'),
    (v_abandoned, 'return_week', current_date - 34, now() - interval '34 days'),
    -- En cambio, una señal cívica explícita protege la cuenta aunque todavía no
    -- haya una aceptación legal registrada en este fixture adversarial.
    (v_active, 'first_participation', current_date - 35, now() - interval '35 days'),
    -- Y una sesión que volvió recientemente no se considera abandonada aunque
    -- su `last_sign_in_at` no se haya movido durante los refresh silenciosos.
    (v_recent_visit, 'visit', current_date, now());

  insert into public.user_legal_acceptances (
    user_id, document_type, version, minimum_age_attested
  )
  select v_accepted, d.document_type, d.version, true
  from public.legal_document_versions d
  where d.is_current;

  perform pg_temp.ok(
    has_function_privilege(
      'service_role', 'public.purge_abandoned_oauth_accounts()', 'execute'
    )
    and not has_function_privilege(
      'authenticated', 'public.purge_abandoned_oauth_accounts()', 'execute'
    )
    and not has_function_privilege(
      'anon', 'public.purge_abandoned_oauth_accounts()', 'execute'
    ),
    'la purga OAuth sólo es ejecutable por service_role'
  );

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', '{"role":"service_role"}', true
  );
  v_deleted := public.purge_abandoned_oauth_accounts();
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  perform pg_temp.ok(
    v_deleted >= 1
    and not exists (select 1 from auth.users where id = v_abandoned)
    and exists (select 1 from auth.users where id = v_recent)
    and exists (select 1 from auth.users where id = v_accepted)
    and exists (select 1 from auth.users where id = v_mixed)
    and exists (select 1 from auth.users where id = v_active)
    and exists (select 1 from auth.users where id = v_recent_visit),
    'elimina OAuth puro con telemetría vencida; conserva cuentas mixtas, actividad cívica y sesiones recientemente visitadas'
  );
end;
$$;

rollback;
