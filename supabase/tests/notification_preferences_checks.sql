-- 0064: generación real, preferencias privadas y bandeja filtrada. Sólo local.
begin;

create function pg_temp.notification_owner() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;
create function pg_temp.notification_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
end;
$$;
create function pg_temp.notification_ok(p_result boolean, p_message text) returns void language plpgsql as $$
begin
  if not coalesce(p_result, false) then raise exception 'FALLÓ · %', p_message; end if;
  raise notice '  ok · %', p_message;
end;
$$;
grant execute on function pg_temp.notification_owner(), pg_temp.notification_user(uuid), pg_temp.notification_ok(boolean,text)
  to authenticated;

do $$
declare
  v_user uuid := '44444444-4444-4444-8444-444444444444';
  v_other uuid := '33333333-3333-4333-8333-333333333333';
  v_poll_a uuid := 'a0000000-0000-4000-8000-000000000001';
  v_poll_b uuid := 'a0000000-0000-4000-8000-000000000002';
  v_poll_c uuid := 'a0000000-0000-4000-8000-000000000003';
  v_community_a uuid;
  v_community_b uuid;
  v_community_c uuid;
  v_type text;
  v_page jsonb;
  v_second jsonb;
  v_last jsonb;
  v_rejected boolean;
  v_count integer;
begin
  perform pg_temp.notification_owner();
  select community_id into v_community_a from public.polls where id = v_poll_a;
  select community_id into v_community_b from public.polls where id = v_poll_b;
  select community_id into v_community_c from public.polls where id = v_poll_c;
  perform pg_temp.notification_ok(v_community_a is not null and v_community_b is not null and v_community_c is not null, 'el seed ofrece contenido de tres comunidades');
  delete from public.notifications where recipient_id in (v_user, v_other);
  delete from public.notification_preferences where user_id in (v_user, v_other);

  perform public.create_notification(v_user, null, 'reply', 'Respuesta', 'Contenido', '/encuestas/' || v_poll_a, 'poll', v_poll_a, 'prefs-default');
  perform pg_temp.notification_ok(exists(select 1 from public.notifications where dedupe_key = 'prefs-default' and community_id = v_community_a), 'sin preferencias se conserva entrega y se deriva comunidad del contenido');

  perform pg_temp.notification_user(v_user);
  insert into public.notification_preferences values (v_user, false, false, false, false, false);
  perform pg_temp.notification_ok((select count(*) from public.notification_preferences) = 1, 'la persona puede guardar sus preferencias');
  perform pg_temp.notification_owner();
  foreach v_type in array array['reply', 'poll_closed', 'claim_update', 'project_update', 'institutional_response'] loop
    perform public.create_notification(v_user, null, v_type, 'Novedad opcional', 'Contenido', '/encuestas/' || v_poll_a, 'poll', v_poll_a, 'prefs-muted:' || v_type);
  end loop;
  perform pg_temp.notification_ok(not exists(select 1 from public.notifications where dedupe_key like 'prefs-muted:%'), 'create_notification aplica las cinco preferencias antes de insertar');
  perform pg_temp.notification_ok(exists(select 1 from public.notifications where dedupe_key = 'prefs-default'), 'cambiar preferencias no borra el historial');

  -- Este cambio ejecuta el trigger productivo de cierre, no un mock de entrega.
  update public.polls set status = 'closed' where id = v_poll_b;
  perform pg_temp.notification_ok(not exists(select 1 from public.notifications where recipient_id = v_user and type = 'poll_closed'), 'el cierre real respeta la preferencia del participante');
  perform pg_temp.notification_ok(exists(select 1 from public.notifications where recipient_id = v_other and type = 'poll_closed' and entity_id = v_poll_b), 'el mismo cierre sigue llegando a quienes no lo silenciaron');

  foreach v_type in array array['account_suspended', 'account_suspension_lifted', 'moderation_appeal', 'report_queue', 'report_resolved', 'request_update', 'status_change', 'future_security_event'] loop
    perform public.create_notification(v_user, null, v_type, 'Aviso esencial', 'Texto genérico', '/perfil', null, null, 'prefs-essential:' || v_type);
  end loop;
  perform pg_temp.notification_ok((select count(*) from public.notifications where dedupe_key like 'prefs-essential:%') = 8, 'seguridad, moderación, solicitudes y tipos futuros siempre se entregan');

  perform pg_temp.notification_user(v_other);
  perform pg_temp.notification_ok((select count(*) from public.notification_preferences) = 0, 'RLS oculta las preferencias de otra persona');
  update public.notification_preferences set replies = true where user_id = v_user;
  get diagnostics v_count = row_count;
  perform pg_temp.notification_ok(v_count = 0, 'RLS impide cambiar preferencias ajenas');
  v_rejected := false;
  begin
    insert into public.notification_preferences (user_id) values (v_user)
    on conflict (user_id) do update set replies = true;
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.notification_ok(v_rejected, 'un upsert no permite tomar preferencias de otra cuenta');

  perform pg_temp.notification_user(v_user);
  update public.notification_preferences set replies = true;
  perform pg_temp.notification_owner();
  perform public.create_notification(v_user, null, 'reply', 'Respuesta', 'Contenido', '/perfil', null, null, 'prefs-restored');
  perform pg_temp.notification_ok(exists(select 1 from public.notifications where dedupe_key = 'prefs-restored'), 'volver a activar restaura la generación');

  -- Filas con el mismo timestamp: los bordes deben desempatar por UUID.
  update public.notification_preferences set replies = true, poll_results = true, claim_updates = true, project_updates = true, institutional_responses = true where user_id = v_user;
  delete from public.notifications where recipient_id in (v_user, v_other);
  insert into public.notifications(id, recipient_id, type, title, href, entity_type, entity_id, read_at, created_at)
  select ('64000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, v_user,
    case when i <= 6 then 'reply' when i = 7 then 'project_update' else 'account_suspended' end,
    'Aviso ' || i, '/perfil', case when i = 8 then null else 'poll' end,
    case when i = 8 then null when i = 6 then v_poll_b else v_poll_a end,
    case when i = 1 then timestamptz '2030-01-02 00:00:00+00' else null end,
    timestamptz '2030-01-01 00:00:00+00'
  from generate_series(1, 8) i;
  insert into public.notifications(id, recipient_id, type, title, href, entity_type, entity_id)
  values ('64000000-0000-4000-8000-000000000099', v_other, 'reply', 'Sólo otra cuenta', '/perfil', 'poll', v_poll_c);

  perform pg_temp.notification_user(v_user);
  v_page := public.notification_inbox(false, 'reply', v_community_a, null, null, 2);
  perform pg_temp.notification_ok((v_page->>'total')::integer = 5 and (v_page->>'unread')::integer = 4 and jsonb_array_length(v_page->'items') = 2 and (v_page->>'has_more')::boolean, 'filas y ambos conteos usan tipo y comunidad antes de paginar');
  v_second := public.notification_inbox(false, 'reply', v_community_a, (v_page->'items'->1->>'created_at')::timestamptz, (v_page->'items'->1->>'id')::uuid, 2);
  v_last := public.notification_inbox(false, 'reply', v_community_a, (v_second->'items'->1->>'created_at')::timestamptz, (v_second->'items'->1->>'id')::uuid, 2);
  perform pg_temp.notification_ok((v_second->>'total')::integer = 5 and (v_second->>'unread')::integer = 4 and jsonb_array_length(v_second->'items') = 2 and jsonb_array_length(v_last->'items') = 1 and not (v_last->>'has_more')::boolean, 'las tres páginas mantienen conteos completos y detectan el final exacto');
  perform pg_temp.notification_ok((select count(distinct entry->>'id') from jsonb_array_elements((v_page->'items') || (v_second->'items') || (v_last->'items')) entry) = 5, 'el cursor no repite ni omite notificaciones con timestamp idéntico');
  v_page := public.notification_inbox(true, 'reply', v_community_a);
  perform pg_temp.notification_ok((v_page->>'total')::integer = 4 and (v_page->>'unread')::integer = 4 and jsonb_array_length(v_page->'items') = 4, 'el filtro sin leer también restringe el total');
  v_page := public.notification_inbox(true, 'reply', v_community_a, null, null, 2);
  v_second := public.notification_inbox(true, 'reply', v_community_a, (v_page->'items'->1->>'created_at')::timestamptz, (v_page->'items'->1->>'id')::uuid, 2);
  perform pg_temp.notification_ok(jsonb_array_length(v_second->'items') = 2 and not (v_second->>'has_more')::boolean, 'una última página llena no ofrece una página vacía adicional');
  v_page := public.notification_inbox(false, 'essential');
  perform pg_temp.notification_ok((v_page->>'total')::integer = 1 and v_page->'items'->0->>'type' = 'account_suspended', 'el filtro esencial separa seguridad de novedades opcionales');
  v_page := public.notification_inbox(false, null, v_community_c);
  perform pg_temp.notification_ok((v_page->>'total')::integer = 0 and (v_page->>'unread')::integer = 0 and jsonb_array_length(v_page->'items') = 0, 'no se filtran filas ni conteos de la comunidad exclusiva de otra bandeja');
  perform pg_temp.notification_ok((select count(*) from public.notification_communities()) = 2 and not exists(select 1 from public.notification_communities() where community_id = v_community_c), 'el selector de comunidades también respeta destinatario y RLS');
  perform pg_temp.notification_ok(public.mark_notifications_read('64000000-0000-4000-8000-000000000099') = 0, 'la RPC no marca una notificación ajena por UUID');
  perform pg_temp.notification_ok(public.mark_notifications_read(null, true, 'reply', v_community_a) = 4, 'marcar coincidencias sólo modifica no leídas del filtro completo');
  v_page := public.notification_inbox();
  perform pg_temp.notification_ok((v_page->>'total')::integer = 8 and (v_page->>'unread')::integer = 3, 'el marcado filtrado conserva otros tipos, comunidades y avisos esenciales');
  perform pg_temp.notification_user(v_other);
  v_page := public.notification_inbox();
  perform pg_temp.notification_ok((v_page->>'total')::integer = 1 and (v_page->>'unread')::integer = 1, 'la otra bandeja permanece intacta');

  v_rejected := false;
  begin perform public.notification_inbox(false, 'unrecognized'); exception when invalid_parameter_value then v_rejected := true; end;
  perform pg_temp.notification_ok(v_rejected, 'un filtro inválido no se amplía silenciosamente');
  v_rejected := false;
  begin perform public.notification_inbox(false, null, null, now(), null, 2); exception when invalid_parameter_value then v_rejected := true; end;
  perform pg_temp.notification_ok(v_rejected, 'un cursor incompleto se rechaza');
  perform pg_temp.notification_owner();
  perform pg_temp.notification_ok(not has_table_privilege('anon', 'public.notification_preferences', 'select') and not has_function_privilege('anon', 'public.notification_inbox(boolean,text,uuid,timestamptz,uuid,integer)', 'execute') and not has_function_privilege('authenticated', 'private.apply_notification_preferences()', 'execute'), 'las preferencias y helpers no amplían permisos anónimos o internos');
end;
$$;

rollback;
