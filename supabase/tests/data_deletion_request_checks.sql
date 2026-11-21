-- Sólo fixtures locales: todos los cambios se revierten al terminar.
begin;
create function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$ begin
  if not coalesce(p_condition, false) then raise exception 'FALLÓ · %', p_what; end if;
  raise notice 'ok · %', p_what;
end $$;
grant execute on function pg_temp.ok(boolean,text) to anon, authenticated, service_role;

create function pg_temp.as_actor(p_user uuid, p_session uuid, p_aal text default 'aal2')
returns void language plpgsql as $$ begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', p_session
  )::text, true);
end $$;
grant execute on function pg_temp.as_actor(uuid,uuid,text) to authenticated, service_role;

do $$
declare
  v_admin uuid := gen_random_uuid(); v_mod uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid(); v_actor uuid; v_factor uuid;
  v_admin_session uuid := gen_random_uuid(); v_mod_session uuid := gen_random_uuid();
  v_created jsonb; v_ref uuid; v_rejected_ref uuid; v_rows jsonb; v_receipt jsonb;
  v_denied boolean; v_index integer;
begin
  foreach v_actor in array array[v_admin,v_mod,v_user] loop
    insert into auth.users (
      instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      confirmation_token,recovery_token,email_change,email_change_token_new,
      email_change_token_current,email_change_confirm_status,phone_change,
      phone_change_token,reauthentication_token,is_sso_user,is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000',v_actor,'authenticated','authenticated',
      v_actor::text || '@agorbis.test',
      extensions.crypt('LocalDeletionRequest-2026!',extensions.gen_salt('bf')),now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username','dr_' || replace(v_actor::text,'-','')),
      now(),now(),'','','','','',0,'','','',false,false
    );
    if v_actor in (v_admin,v_mod) then
      v_factor := gen_random_uuid();
      insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
      values(v_factor,v_actor,'Local deletion request test','totp','verified',now(),now(),'MZXW6YTBOI======');
      insert into private.privileged_mfa_factors(factor_id,user_id) values(v_factor,v_actor);
      insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal)
      values(case when v_actor=v_admin then v_admin_session else v_mod_session end,v_actor,now(),now(),v_factor,'aal2');
      update public.profiles set role=case when v_actor=v_admin then 'admin' else 'moderator' end where id=v_actor;
    end if;
    perform pg_temp.as_actor(v_actor,case when v_actor=v_admin then v_admin_session else v_mod_session end);
    perform public.accept_current_legal(true);
    perform public.grant_current_international_transfer_consent(
      (select version from public.international_transfer_notice_versions where is_current and effective_at<=now()),true,'es');
    perform set_config('role','postgres',true);
    perform set_config('request.jwt.claims','',true);
  end loop;

  perform set_config('role','anon',true);
  v_denied:=false;
  begin perform public.list_data_deletion_requests(); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'anon no puede consultar la cola privada');
  perform set_config('role','postgres',true);
  perform pg_temp.as_actor(v_user,null,'aal1');
  v_denied:=false;
  begin perform public.create_data_deletion_request('fixture@agorbis.test','account','fixture-thread',repeat('a',64)); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'un miembro no puede registrar casos');
  perform pg_temp.as_actor(v_mod,v_mod_session);
  perform pg_temp.ok(public.is_moderator(v_mod) and not public.is_admin(v_mod),'el moderador tiene MFA aprobado, pero no es admin');
  v_denied:=false;
  begin perform public.list_data_deletion_requests(); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el moderador con MFA no puede consultar casos');
  v_denied:=false;
  begin perform public.create_data_deletion_request('fixture@agorbis.test','account','fixture-thread',repeat('a',64)); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el moderador con MFA no puede registrar casos');
  perform pg_temp.as_actor(v_admin,v_admin_session,'aal1');
  v_denied:=false;
  begin perform public.list_data_deletion_requests(); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el admin AAL1 no puede consultar casos');
  perform pg_temp.as_actor(v_admin,gen_random_uuid());
  v_denied:=false;
  begin perform public.list_data_deletion_requests(); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'un claim AAL2 sin sesión y factor aprobados no alcanza');
  perform pg_temp.as_actor(v_admin,v_admin_session);
  perform pg_temp.ok(public.is_admin(v_admin),'el admin con sesión y MFA aprobados tiene acceso');
  v_denied:=false;
  begin perform 1 from private.data_deletion_requests; exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'ni el admin puede leer directamente la tabla privada');
  v_created:=public.create_data_deletion_request('fixture@agorbis.test','account','fixture-thread',repeat('a',64));
  v_ref:=(v_created->>'reference')::uuid;
  perform pg_temp.ok(v_ref is not null and not v_created ? 'access_hash','crear devuelve referencia y vencimiento sin el hash');
  v_rows:=public.list_data_deletion_requests();
  perform pg_temp.ok(v_rows->0->>'reference'=v_ref::text and not (v_rows->0) ? 'access_hash','la cola admin excluye el hash de acceso');
  v_denied:=false;
  begin perform public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('c',64)); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el navegador admin tampoco puede saltarse el servidor para consultar recibos');

  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,1,'resolved',null,null,'handled',true); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'no se puede resolver una solicitud sin revisión y verificación');
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,1,'in_review'); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'revisar requiere método y constancia mínima de identidad');
  perform pg_temp.ok(public.update_data_deletion_request(v_ref,1,'verifying'),'se inicia la verificación');
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,1,'in_review','account_email','Control comprobado en hilo existente'); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'la revisión evita sobreescribir un cambio concurrente');
  perform pg_temp.ok(public.update_data_deletion_request(v_ref,2,'in_review','account_email','Control comprobado en hilo existente'),'la verificación habilita la revisión');
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,3,'resolved',null,null,'handled',false); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'no se cierra sin confirmar la respuesta enviada');
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,3,'resolved',null,null,null,true); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'no se cierra sin motivo');
  perform pg_temp.ok(public.update_data_deletion_request(v_ref,3,'resolved',null,null,'partially_handled',true),'cierre con alcance limitado explícito');
  v_rows:=public.list_data_deletion_requests('resolved');
  perform pg_temp.ok(v_rows->0->>'contact_email' is null and v_rows->0->>'inbox_reference' is null and v_rows->0->>'verification_note' is null and v_rows->0->>'verified_at' is not null,'cerrar minimiza contacto y notas y conserva la verificación');
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,4,'in_review','account_email','Nueva comprobación no permitida'); exception when check_violation then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'un caso cerrado no se reabre por una edición tardía');
  v_created:=public.create_data_deletion_request('other-fixture@agorbis.test','specific_data','other-fixture-thread',repeat('d',64));
  v_rejected_ref:=(v_created->>'reference')::uuid;
  perform pg_temp.ok(public.update_data_deletion_request(v_rejected_ref,1,'rejected',null,null,'unable_to_verify',true),'se puede rechazar sin identidad verificada, sin divulgar datos');
  perform pg_temp.as_actor(v_mod,v_mod_session);
  v_denied:=false;
  begin perform public.update_data_deletion_request(v_ref,4,'rejected',null,null,'withdrawn',true); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el moderador no puede modificar casos');
  v_denied:=false;
  begin perform public.reissue_data_deletion_receipt(v_ref,4,repeat('b',64)); exception when insufficient_privilege then v_denied:=true; end;
  perform pg_temp.ok(v_denied,'el moderador no puede reemitir códigos');

  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  v_receipt:=public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('c',64));
  perform pg_temp.ok(v_receipt->>'status'='resolved' and (select count(*) from jsonb_object_keys(v_receipt))=6 and not v_receipt ?| array['contact_email','verification_note','access_hash','scope','verified_by'],'el recibo público sólo muestra seis campos sin datos de cuenta');
  perform pg_temp.ok(public.read_data_deletion_receipt(gen_random_uuid(),repeat('a',64),repeat('c',64)) is null and public.read_data_deletion_receipt(v_ref,repeat('b',64),repeat('c',64)) is null,'referencia o código incorrectos tienen la misma respuesta vacía');
  for v_index in 1..20 loop
    perform pg_temp.ok(public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('e',64)) is not null,'consulta permitida dentro del límite');
  end loop;
  perform pg_temp.ok(public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('e',64)) is null,'la consulta 21 queda limitada sin filtrar existencia');
  for v_index in 1..20 loop perform public.read_data_deletion_receipt(v_ref,repeat('b',64),repeat('f',64)); end loop;
  perform pg_temp.ok(public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('f',64)) is null,'los intentos incorrectos también consumen el límite');

  perform pg_temp.as_actor(v_admin,v_admin_session);
  perform public.reissue_data_deletion_receipt(v_ref,4,repeat('b',64));
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform pg_temp.ok(public.read_data_deletion_receipt(v_ref,repeat('a',64),repeat('c',64)) is null and public.read_data_deletion_receipt(v_ref,repeat('b',64),repeat('c',64)) is not null,'reemitir invalida inmediatamente el código anterior');
  perform set_config('role','postgres',true);
  perform set_config('request.jwt.claims','',true);
  update private.data_deletion_requests set access_expires_at=now()-interval '1 minute' where reference=v_ref;
  perform pg_temp.ok((select count(*) from auth.users where id in (v_admin,v_mod,v_user))=3 and not exists(select 1 from private.account_deletion_jobs where user_id in(v_admin,v_mod,v_user)),'registrar y cerrar casos no borra cuentas ni modifica la saga de eliminación');
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform pg_temp.ok(public.read_data_deletion_receipt(v_ref,repeat('b',64),repeat('c',64)) is null,'el código vencido produce la misma respuesta vacía');
end $$;
rollback;
