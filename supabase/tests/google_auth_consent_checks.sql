-- 0066/0067: aviso Google aprobado y decisiones opcionales sin autoaceptación.
-- Fixtures sólo locales: el aviso de 0067 se conserva y todos los cambios
-- temporales de vigencia, cuentas y decisiones se revierten con rollback.
begin;

create function pg_temp.google_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
create function pg_temp.google_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
create function pg_temp.google_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end;
$$;
create function pg_temp.google_ok(p_result boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_result, false) then raise exception 'FALLÓ · %', p_message; end if;
  raise notice '  ok · %', p_message;
end;
$$;
grant execute on function pg_temp.google_owner(), pg_temp.google_user(uuid),
  pg_temp.google_anon(), pg_temp.google_ok(boolean,text) to anon, authenticated;

do $$
declare
  v_user uuid := '44444444-4444-4444-8444-444444444444';
  v_other uuid := '33333333-3333-4333-8333-333333333333';
  v_deleted_user uuid := gen_random_uuid();
  v_snapshot jsonb := '{"es":{"title":"Aviso de prueba","summary":"Sólo fixture local","sections":[{"title":"Prueba","paragraphs":["Nunca es un aviso aprobado productivo."]}]},"en":{"title":"Test notice","summary":"Local fixture only","sections":[{"title":"Test","paragraphs":["Never an approved production notice."]}]}}';
  v_hash text;
  v_notice jsonb;
  v_state jsonb;
  v_first jsonb;
  v_started_at timestamptz;
  v_between_withdrawals timestamptz;
  v_last_withdrawn_at timestamptz;
  v_rejected boolean;
  v_sql text;
  v_legal_before jsonb;
  v_transfer_count bigint;
  v_function regprocedure;
begin
  perform pg_temp.google_owner();
  perform pg_temp.google_ok((select count(*) = 1 from public.google_auth_notice_versions), '0067 activa únicamente el aviso revisado, sin borradores adicionales');
  perform pg_temp.google_ok(exists(select 1 from public.google_auth_notice_versions
    where version = '2026-09-09.1' and provider = 'google' and is_current
      and approved_at is not null and approval_reference is not null
      and approved_at <= effective_at and effective_at <= clock_timestamp()
      and superseded_at is null
      and content_hash_algorithm = 'sha256-postgres-jsonb-v1'
      and content_hash = 'b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3'
      and content_hash = encode(extensions.digest(content_snapshot::text, 'sha256'), 'hex')),
    'el aviso aprobado tiene versión, vigencia y hash verificado por PostgreSQL');
  perform pg_temp.google_ok(not exists(select 1 from public.user_google_auth_consent_events), '0067 no inventa consentimientos de personas usuarias');
  perform pg_temp.google_ok(not exists(select 1 from private.google_auth_consent_barriers), '0067 no inventa retiros');
  perform pg_temp.google_anon();
  v_notice := public.current_google_auth_notice();
  perform pg_temp.google_ok(v_notice->>'version' = '2026-09-09.1'
    and v_notice->'content_snapshot'->'es'->>'title' = 'Acceso opcional con Google'
    and v_notice->'content_snapshot'->'en'->>'title' = 'Optional Google sign-in',
    'RPC pública ofrece el aviso aprobado en ambos idiomas sin requerir sesión');
  perform pg_temp.google_ok(not (v_notice ? 'approval_reference') and not (v_notice ? 'approved_at'),
    'la activación no expone la evidencia interna de aprobación');
  perform pg_temp.google_user(v_user);
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'missing',
    'una cuenta existente sigue sin decisión Google después de publicar el aviso');
  perform pg_temp.google_owner();
  -- Se simula la falta de aviso dentro de esta transacción para mantener las
  -- pruebas del protocolo. No se borra ni se altera el contenido aprobado.
  update public.google_auth_notice_versions set is_current = false
  where version = '2026-09-09.1';
  v_hash := encode(extensions.digest(v_snapshot::text, 'sha256'), 'hex');
  select count(*) into v_transfer_count from public.user_international_transfer_consents;
  perform pg_temp.google_user(v_user);
  v_legal_before := public.my_legal_status();
  perform pg_temp.google_ok(public.current_google_auth_notice() is null, 'sin aviso vigente Google queda indisponible');
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'unavailable', 'estado propio distingue la falta de aviso');

  perform pg_temp.google_owner();
  insert into public.google_auth_notice_versions(version, content_hash, content_snapshot)
  values ('test-google-draft', v_hash, v_snapshot);
  perform pg_temp.google_anon();
  perform pg_temp.google_ok(public.current_google_auth_notice() is null and not has_table_privilege('anon', 'public.google_auth_notice_versions', 'select'), 'el público no descubre avisos sin aprobar ni referencias internas');
  v_rejected := false;
  begin perform public.my_google_auth_consent(); exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'anon no lee decisiones propias ni ajenas');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, clock_timestamp()); exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'anon no registra aceptación');
  v_rejected := false;
  begin perform public.withdraw_google_auth_consent(); exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'anon no registra retiro');
  perform pg_temp.google_user(v_user);
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, clock_timestamp()); exception when object_not_in_prerequisite_state then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'un borrador no puede ser aceptado aun con hash correcto');

  perform pg_temp.google_owner();
  v_rejected := false;
  begin update public.google_auth_notice_versions set is_current = true where version = 'test-google-draft'; exception when check_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'marcar current no sustituye aprobación explícita');
  v_rejected := false;
  begin
    insert into public.google_auth_notice_versions(version, content_hash, content_snapshot, approved_at, approval_reference, effective_at, is_current)
    values ('test-google-future', v_hash, v_snapshot, clock_timestamp(), 'fixture local, sin valor legal', clock_timestamp() + interval '1 day', true);
  exception when check_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'no se publica un aviso con fecha efectiva futura');
  v_rejected := false;
  begin
    insert into public.google_auth_notice_versions(version, content_hash, content_snapshot)
    values ('test-google-bad-hash', repeat('a', 64), v_snapshot);
  exception when check_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'DB verifica hash contra el snapshot, no sólo su forma');
  v_rejected := false;
  begin
    insert into public.google_auth_notice_versions(version, content_hash, content_snapshot)
    values ('test-google-empty', encode(extensions.digest('{}', 'sha256'), 'hex'), '{}'::jsonb);
  exception when check_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'snapshot incompleto ES/EN se rechaza sin aceptar NULL SQL');
  update public.google_auth_notice_versions set approved_at = clock_timestamp() - interval '2 minutes',
    approval_reference = 'fixture local revisada, sin valor legal',
    effective_at = clock_timestamp() - interval '1 minute', is_current = true
  where version = 'test-google-draft';
  v_rejected := false;
  begin
    insert into public.google_auth_notice_versions(version, content_hash, content_snapshot, approved_at, approval_reference, effective_at, is_current)
    values ('test-google-duplicate-current', v_hash, v_snapshot, clock_timestamp() - interval '1 minute', 'fixture local, sin valor legal', clock_timestamp(), true);
  exception when unique_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'índice impide dos avisos vigentes del proveedor');
  foreach v_sql in array array[
    'update public.google_auth_notice_versions set content_snapshot = jsonb_set(content_snapshot, ''{es,title}'', ''"Alterado"'') where version = ''test-google-draft''',
    'update public.google_auth_notice_versions set content_hash = repeat(''a'',64) where version = ''test-google-draft''',
    'update public.google_auth_notice_versions set version = ''changed'' where version = ''test-google-draft''',
    'update public.google_auth_notice_versions set approved_at = approved_at - interval ''1 day'' where version = ''test-google-draft''',
    'update public.google_auth_notice_versions set approval_reference = ''otra aprobación supuesta'' where version = ''test-google-draft''',
    'update public.google_auth_notice_versions set effective_at = effective_at - interval ''1 day'' where version = ''test-google-draft''',
    'delete from public.google_auth_notice_versions where version = ''test-google-draft'''
  ] loop
    v_rejected := false;
    begin execute v_sql; exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_NOTICE_IMMUTABLE'; end;
    perform pg_temp.google_ok(v_rejected, 'snapshot, hash, versión y aprobación permanecen inmutables: ' || split_part(v_sql, ' set ', 2));
  end loop;

  perform pg_temp.google_anon();
  v_notice := public.current_google_auth_notice();
  perform pg_temp.google_ok(v_notice->>'version' = 'test-google-draft' and v_notice->>'content_hash' = v_hash and v_notice->>'content_hash_algorithm' = 'sha256-postgres-jsonb-v1' and v_notice->'content_snapshot' = v_snapshot, 'RPC pública devuelve exactamente snapshot bilingüe y hash del único aviso vigente');
  perform pg_temp.google_ok((v_notice->>'issued_at')::timestamptz <= clock_timestamp() and (v_notice->>'issued_at')::timestamptz > clock_timestamp() - interval '10 seconds', 'inicio de ceremonia emitido por reloj DB');
  perform pg_temp.google_ok(not (v_notice ? 'approval_reference') and not (v_notice ? 'user_id'), 'aviso público no expone metadatos internos ni personales');

  perform pg_temp.google_user(v_user);
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'missing', 'la aprobación del aviso no autoacepta por usuarios existentes');
  v_rejected := false;
  begin update public.google_auth_notice_versions set is_current = false; exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'un usuario no administra ni publica avisos');
  foreach v_sql in array array[
    format('select public.grant_google_auth_consent(%L,%L,''es'',false,clock_timestamp())', 'test-google-draft', v_hash),
    format('select public.grant_google_auth_consent(%L,%L,''es'',null,clock_timestamp())', 'test-google-draft', v_hash),
    format('select public.grant_google_auth_consent(%L,%L,null,true,clock_timestamp())', 'test-google-draft', v_hash),
    format('select public.grant_google_auth_consent(%L,%L,''fr'',true,clock_timestamp())', 'test-google-draft', v_hash),
    format('select public.grant_google_auth_consent(null,%L,''es'',true,clock_timestamp())', v_hash),
    'select public.grant_google_auth_consent(''test-google-draft'',null,''es'',true,clock_timestamp())'
  ] loop
    v_rejected := false;
    begin execute v_sql; exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_REQUIRED'; end;
    perform pg_temp.google_ok(v_rejected, 'se rechaza confirmación, locale, versión o hash faltante/inválido: ' || v_sql);
  end loop;
  foreach v_sql in array array[
    format('select public.grant_google_auth_consent(''unpublished'',%L,''es'',true,clock_timestamp())', v_hash),
    'select public.grant_google_auth_consent(''test-google-draft'',repeat(''b'',64),''es'',true,clock_timestamp())'
  ] loop
    v_rejected := false;
    begin execute v_sql; exception when object_not_in_prerequisite_state then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_NOTICE_NOT_CURRENT'; end;
    perform pg_temp.google_ok(v_rejected, 'versión y hash deben corresponder exactamente al aviso actual');
  end loop;
  foreach v_sql in array array[
    'null', '''infinity''::timestamptz', '''-infinity''::timestamptz',
    'clock_timestamp() + interval ''1 minute''', 'clock_timestamp() - interval ''11 minutes'''
  ] loop
    v_rejected := false;
    begin execute format('select public.grant_google_auth_consent(%L,%L,''es'',true,%s)', 'test-google-draft', v_hash, v_sql);
    exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_EXPIRED'; end;
    perform pg_temp.google_ok(v_rejected, 'inicio NULL, no finito, futuro o vencido se rechaza: ' || v_sql);
  end loop;

  v_started_at := (public.current_google_auth_notice()->>'issued_at')::timestamptz;
  v_first := public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, v_started_at);
  perform pg_temp.google_ok(v_first->>'status' = 'accepted' and v_first->>'notice_version' = 'test-google-draft' and v_first->>'locale' = 'es', 'aceptación expresa queda atribuida sólo a auth.uid');
  perform pg_temp.google_ok((v_first->>'accepted_at')::timestamptz >= v_started_at and (v_first->>'accepted_at')::timestamptz <= clock_timestamp(), 'fecha durable de aceptación procede de DB');
  v_state := public.grant_google_auth_consent('test-google-draft', v_hash, 'en', true, v_started_at);
  perform pg_temp.google_ok(v_state = v_first and (select count(*) from public.user_google_auth_consent_events) = 1, 'grant repetido es idempotente sin reemplazar locale, tiempo ni prueba');
  v_rejected := false;
  begin insert into public.user_google_auth_consent_events(user_id,notice_version,notice_hash,decision,locale) values(v_other,'test-google-draft',v_hash,'accepted','es');
  exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'no se inserta aceptación directa ni en nombre de otra persona');
  v_rejected := false;
  begin update public.user_google_auth_consent_events set locale = 'en'; exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'no se edita la prueba durable por API');
  v_rejected := false;
  begin delete from public.user_google_auth_consent_events; exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'no se borra la prueba durable por API');
  perform pg_temp.google_user(v_other);
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'missing' and (select count(*) from public.user_google_auth_consent_events) = 0, 'RLS y RPC propia no filtran aceptación ajena');
  v_state := public.withdraw_google_auth_consent();
  perform pg_temp.google_ok(v_state->>'status' = 'withdrawn' and v_state->>'notice_version' is null and v_state->>'accepted_at' is null, 'se permite retirar antes de aceptar sin fabricar versión ni aceptación');

  perform pg_temp.google_user(v_user);
  v_state := public.withdraw_google_auth_consent();
  v_last_withdrawn_at := (v_state->>'last_withdrawn_at')::timestamptz;
  perform pg_temp.google_ok(v_state->>'status' = 'withdrawn' and v_state->>'accepted_at' = v_first->>'accepted_at' and (select count(*) from public.user_google_auth_consent_events) = 2, 'retiro conserva aceptación previa y agrega prueba propia');
  perform pg_temp.google_ok(public.my_legal_status() = v_legal_before, 'aceptar/retirar Google no cambia decisiones generales ni can_participate');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, v_started_at);
  exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_WITHDRAWN'; end;
  perform pg_temp.google_ok(v_rejected, 'callback comenzado antes del retiro no puede reaceptar');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, v_last_withdrawn_at);
  exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_WITHDRAWN'; end;
  perform pg_temp.google_ok(v_rejected, 'timestamp idéntico a la barrera también se rechaza');
  v_between_withdrawals := (public.current_google_auth_notice()->>'issued_at')::timestamptz;
  v_state := public.withdraw_google_auth_consent();
  perform pg_temp.google_ok((select count(*) from public.user_google_auth_consent_events) = 2 and (v_state->>'last_withdrawn_at')::timestamptz > v_last_withdrawn_at, 'retiro repetido conserva idempotencia de evento pero avanza barrera');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, v_between_withdrawals);
  exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_WITHDRAWN'; end;
  perform pg_temp.google_ok(v_rejected, 'segundo retiro invalida ceremonia abierta entre ambos retiros');
  v_state := public.grant_google_auth_consent('test-google-draft', v_hash, 'en', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
  perform pg_temp.google_ok(v_state->>'status' = 'accepted' and v_state->>'locale' = 'en' and (select count(*) from public.user_google_auth_consent_events) = 3 and v_state->>'last_withdrawn_at' is not null, 'nueva decisión explícita posterior permite reaceptar y conserva barrera');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, v_started_at);
  exception when check_violation then v_rejected := sqlerrm = 'AGORBIS_GOOGLE_CONSENT_WITHDRAWN'; end;
  perform pg_temp.google_ok(v_rejected, 'reaceptar no revive ceremonias anteriores al retiro');
  perform pg_temp.google_user(v_other);
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'withdrawn' and (select count(*) from public.user_google_auth_consent_events) = 1, 'aceptación/retiro de una cuenta no modifica otra');

  perform pg_temp.google_owner();
  update public.google_auth_notice_versions set is_current = false, superseded_at = clock_timestamp()
  where version = 'test-google-draft';
  insert into public.google_auth_notice_versions(version, content_hash, content_snapshot, approved_at, approval_reference, effective_at, is_current)
  values ('test-google-v2', v_hash, v_snapshot, clock_timestamp() - interval '2 minutes', 'fixture local v2, sin valor legal', clock_timestamp() - interval '1 minute', true);
  v_rejected := false;
  begin update public.google_auth_notice_versions set is_current = true, superseded_at = null where version = 'test-google-draft'; exception when check_violation then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'un aviso sustituido no se reactiva alterando su historial');
  perform pg_temp.google_user(v_user);
  perform pg_temp.google_ok(public.my_google_auth_consent()->>'status' = 'outdated' and public.my_google_auth_consent()->>'current_version' = 'test-google-v2', 'nueva versión exige decisión nueva, sin trasladar aceptación');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-draft', v_hash, 'es', true, clock_timestamp());
  exception when object_not_in_prerequisite_state then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'un retorno para aviso sustituido falla cerrado');
  v_state := public.grant_google_auth_consent('test-google-v2', v_hash, 'es', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
  perform pg_temp.google_ok(v_state->>'status' = 'accepted' and (select count(*) from public.user_google_auth_consent_events) = 4, 'nueva versión agrega evidencia propia sin cambiar versiones previas');

  perform pg_temp.google_owner();
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_deleted_user, 'authenticated', 'authenticated',
    v_deleted_user::text || '@agorbis.test', '', '{"provider":"email","providers":["email"]}', '{}', now(), now());
  perform pg_temp.google_user(v_deleted_user);
  perform public.grant_google_auth_consent('test-google-v2', v_hash, 'es', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
  perform public.withdraw_google_auth_consent();
  for i in 1..29 loop
    perform public.grant_google_auth_consent('test-google-v2', v_hash, 'es', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
    if i < 29 then perform public.withdraw_google_auth_consent(); end if;
  end loop;
  v_state := public.grant_google_auth_consent('test-google-v2', v_hash, 'es', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
  perform pg_temp.google_ok(v_state->>'status' = 'accepted', 'grant idempotente sigue disponible con el cupo de nuevas decisiones agotado');
  v_state := public.withdraw_google_auth_consent();
  perform pg_temp.google_ok(v_state->>'status' = 'withdrawn', 'agotar cupo de aceptación nunca impide retirar');
  v_rejected := false;
  begin perform public.grant_google_auth_consent('test-google-v2', v_hash, 'es', true, (public.current_google_auth_notice()->>'issued_at')::timestamptz);
  exception when program_limit_exceeded then v_rejected := sqlerrm = 'GEOUNITY_RATE_LIMIT:google-auth-consent-grant'; end;
  perform pg_temp.google_ok(v_rejected, 'alternar decisiones no permite crecimiento ilimitado de prueba durable');
  perform pg_temp.google_owner();
  delete from auth.users where id = v_deleted_user;
  perform pg_temp.google_ok(not exists(select 1 from public.user_google_auth_consent_events where user_id = v_deleted_user)
    and not exists(select 1 from private.google_auth_consent_barriers where user_id = v_deleted_user), 'borrado real de cuenta elimina eventos y barrera en cascada');
  update public.google_auth_notice_versions set is_current = false where version = 'test-google-v2';
  perform pg_temp.google_user(v_user);
  v_state := public.withdraw_google_auth_consent();
  perform pg_temp.google_ok(v_state->>'status' = 'withdrawn' and v_state->>'current_version' is null
    and v_state->>'notice_version' = 'test-google-v2', 'retiro sigue disponible aunque no exista un aviso actual');
  perform pg_temp.google_user(null);
  v_rejected := false;
  begin perform public.my_google_auth_consent(); exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'el rol authenticated sin auth.uid válido no obtiene un estado');
  perform pg_temp.google_user(v_deleted_user);
  v_rejected := false;
  begin perform public.withdraw_google_auth_consent(); exception when insufficient_privilege then v_rejected := true; end;
  perform pg_temp.google_ok(v_rejected, 'una sesión de cuenta borrada no recrea prueba ni barrera');
  perform pg_temp.google_owner();
  perform pg_temp.google_ok((select count(*) from public.user_international_transfer_consents) = v_transfer_count, 'flujo Google no crea ni borra consentimientos generales de transferencias');
  perform pg_temp.google_ok(not has_table_privilege('anon', 'public.user_google_auth_consent_events', 'select') and not has_table_privilege('authenticated', 'private.google_auth_consent_barriers', 'select') and not has_table_privilege('service_role', 'public.user_google_auth_consent_events', 'insert'), 'ACL protege evidencia y barrera incluso frente a escritura elevada accidental');
  perform pg_temp.google_ok(not has_function_privilege('service_role', 'public.grant_google_auth_consent(text,text,text,boolean,timestamptz)', 'execute') and not has_function_privilege('anon', 'public.withdraw_google_auth_consent()', 'execute') and not has_function_privilege('authenticated', 'private.guard_google_auth_notice()', 'execute'), 'ACL excluye grants administrativos y helpers internos');
  foreach v_function in array array[
    'public.current_google_auth_notice()'::regprocedure,
    'public.my_google_auth_consent()'::regprocedure,
    'public.grant_google_auth_consent(text,text,text,boolean,timestamptz)'::regprocedure,
    'public.withdraw_google_auth_consent()'::regprocedure,
    'private.guard_google_auth_notice()'::regprocedure
  ] loop
    perform pg_temp.google_ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = v_function), 'security definer tiene search_path vacío: ' || v_function::text);
  end loop;
  perform pg_temp.google_ok((select count(*) = 2 from pg_constraint where contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'c' and conrelid in ('public.user_google_auth_consent_events'::regclass, 'private.google_auth_consent_barriers'::regclass)), 'eventos y barrera se borran en cascada con el perfil');
  perform pg_temp.google_ok(not exists(select 1 from information_schema.columns where table_schema in ('public','private') and table_name in ('user_google_auth_consent_events','google_auth_consent_barriers') and (column_name ~ '(token|email|address|(^|_)ip($|_))')), 'prueba durable no tiene columnas para tokens, IP ni email');
end;
$$;

rollback;

do $$
begin
  if not coalesce((select count(*) from public.google_auth_notice_versions) = 1
    and public.current_google_auth_notice()->>'version' = '2026-09-09.1'
    and public.current_google_auth_notice()->>'content_hash' = 'b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3'
    and not exists(select 1 from public.user_google_auth_consent_events)
    and not exists(select 1 from private.google_auth_consent_barriers), false) then
    raise exception 'FALLÓ · rollback no conservó el aviso aprobado y las decisiones vacías';
  end if;
  raise notice '  ok · rollback conserva el aviso 0067 y no deja consentimientos ni retiros de prueba';
end;
$$;
