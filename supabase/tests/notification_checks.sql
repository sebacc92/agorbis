-- =============================================================================
-- Agorbis · Notificaciones críticas de moderación
-- -----------------------------------------------------------------------------
-- Verifica 0046 sobre una base local migrada y con `supabase/seed.sql` aplicado.
-- Todo queda dentro de una transacción y termina en ROLLBACK.
-- =============================================================================

begin;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_user(p_username text)
returns void language plpgsql as $$
declare v_user uuid;
begin
  perform pg_temp.as_owner();
  select p.id into v_user from public.profiles p where p.username = p_username;
  if v_user is null then
    raise exception 'Falta el perfil demo %', p_username;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_user::text, 'role', 'authenticated', 'aal', 'aal1'
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

create or replace function pg_temp.as_user_aal2(p_username text)
returns void language plpgsql as $$
declare
  v_user uuid;
  v_factor uuid;
  v_session uuid := gen_random_uuid();
begin
  perform pg_temp.as_owner();
  select p.id into v_user from public.profiles p where p.username = p_username;
  select approved.factor_id into v_factor
  from private.privileged_mfa_factors approved
  where approved.user_id = v_user
  order by approved.approved_at desc
  limit 1;
  if v_user is null or v_factor is null then
    raise exception 'Falta la identidad AAL2 demo %', p_username;
  end if;
  insert into auth.sessions (
    id, user_id, created_at, updated_at, factor_id, aal
  ) values (
    v_session, v_user, statement_timestamp(), statement_timestamp(),
    v_factor, 'aal2'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_user::text, 'role', 'authenticated', 'aal', 'aal2',
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
  if coalesce(p_condition, false) then
    raise notice '  ok   · %', p_what;
  else
    raise exception 'FALLÓ · %', p_what;
  end if;
end;
$$;

grant execute on function pg_temp.as_owner(), pg_temp.as_user(text),
  pg_temp.as_user_aal2(text), pg_temp.ok(boolean, text)
to anon, authenticated, service_role;

do $$
declare
  v_user uuid;
  v_admin uuid;
  v_home uuid;
  v_claim uuid;
  v_report uuid;
  v_community_request uuid;
  v_organization_request uuid;
  v_suspension uuid;
  v_appeal uuid;
  v_active_operators integer;
  v_secret constant text := 'NOTIFICATION_SECRET_SENTINEL_0046';
begin
  raise notice '── notificaciones críticas de moderación ──';
  perform pg_temp.as_owner();
  select p.id, p.home_community_id into v_user, v_home
  from public.profiles p where p.username = 'bruno_lp';
  select p.id into v_admin
  from public.profiles p where p.username = 'admin_geo';
  -- 0064: los flujos reales críticos deben seguir entregando aunque todas las
  -- novedades opcionales estén silenciadas para usuarios y operadores.
  insert into public.notification_preferences (
    user_id, replies, poll_results, claim_updates, project_updates, institutional_responses
  ) select p.id, false, false, false, false, false from public.profiles p
  where p.id = v_user or p.role in ('moderator', 'admin')
  on conflict (user_id) do update set replies = false, poll_results = false,
    claim_updates = false, project_updates = false, institutional_responses = false;
  select c.id into v_claim
  from public.claims c
  where c.status <> 'removed'
    and not exists (
      select 1 from public.reports r
      where r.reporter_id = v_user
        and r.target_type = 'claim'
        and r.target_id = c.id
    )
  order by c.id
  limit 1;
  select count(*) into v_active_operators
  from public.profiles p
  where p.role in ('moderator', 'admin')
    and not private.active_suspension(p.id)
    and not private.account_deletion_is_pending(p.id)
    and p.id <> v_user;

  perform pg_temp.ok(
    v_user is not null and v_admin is not null and v_home is not null
      and v_claim is not null and v_active_operators > 0,
    'el seed ofrece usuario, contenido y operadores para la prueba'
  );

  -- Reporte y solicitudes: la cola recibe sólo metadata operacional genérica.
  perform pg_temp.as_user('bruno_lp');
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (
    v_user, 'claim', v_claim,
    v_secret || ' · motivo privado que no debe salir del reporte'
  ) returning id into v_report;

  insert into public.community_requests (
    user_id, requested_name, country, parent_community_id,
    requested_level, reason
  ) values (
    v_user, 'Comunidad temporal de notificaciones', 'AR', v_home,
    'neighborhood', v_secret || ' · fundamento privado de comunidad'
  ) returning id into v_community_request;

  insert into public.organization_requests (
    user_id, community_id, name, type, message
  ) values (
    v_user, v_home, 'Institución temporal de notificaciones', 'other',
    v_secret || ' · evidencia privada de la institución solicitante'
  ) returning id into v_organization_request;

  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key like 'queue:%') = 0,
    'RLS no muestra al solicitante las alertas privadas de la cola'
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key like 'queue:report:' || v_report::text || ':%')
        = v_active_operators,
    'cada operador activo recibe el nuevo reporte una sola vez'
  );
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key like
        'queue:community-request:' || v_community_request::text || ':%')
        = v_active_operators
    and
    (select count(*) from public.notifications n
      where n.dedupe_key like
        'queue:organization-request:' || v_organization_request::text || ':%')
        = v_active_operators,
    'las dos clases de solicitud llegan a la cola operativa'
  );

  -- La resolución del reporte avisa a quien lo envió sin copiar su motivo.
  perform pg_temp.as_user_aal2('admin_geo');
  update public.reports set status = 'resolved' where id = v_report;

  perform pg_temp.as_user('bruno_lp');
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.recipient_id = v_user
        and n.dedupe_key =
          'report:' || v_report::text || ':resolved:resolved') = 1,
    'quien reportó recibe el cierre del reporte'
  );

  -- Suspensión y apelación: se verifican confirmación, cola, resolución y
  -- levantamiento. El cuerpo privado de la apelación no sale de su tabla.
  perform pg_temp.as_user_aal2('admin_geo');
  v_suspension := public.suspend_user(
    v_user,
    'Suspensión temporal para verificar el ciclo completo de notificaciones.',
    now() + interval '1 day'
  );

  perform pg_temp.as_user('bruno_lp');
  v_appeal := public.submit_suspension_appeal(
    v_suspension,
    v_secret || ' · argumentos privados de la persona apelante'
  );
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key =
        'suspension:' || v_suspension::text || ':created') = 1
    and
    (select count(*) from public.notifications n
      where n.dedupe_key = 'appeal:' || v_appeal::text || ':submitted') = 1,
    'la persona recibe la suspensión y la confirmación de su apelación'
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key like 'queue:appeal:' || v_appeal::text || ':%')
        = v_active_operators,
    'cada operador activo recibe la nueva apelación una sola vez'
  );

  perform pg_temp.as_user_aal2('admin_geo');
  perform pg_temp.ok(
    public.review_moderation_appeal(
      v_appeal, 'accepted',
      'La revisión concluyó que corresponde levantar la medida.'
    ),
    'la apelación se resuelve por el RPC autoritativo'
  );

  perform pg_temp.as_user('bruno_lp');
  perform pg_temp.ok(
    (select count(*) from public.notifications n
      where n.dedupe_key =
        'appeal:' || v_appeal::text || ':resolved:accepted') = 1
    and
    (select count(*) from public.notifications n
      where n.dedupe_key =
        'suspension:' || v_suspension::text || ':lifted') = 1,
    'la persona recibe la resolución y el levantamiento de la suspensión'
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    not exists (
      select 1
      from public.notifications n
      where coalesce(n.title, '') ilike '%' || v_secret || '%'
         or coalesce(n.body, '') ilike '%' || v_secret || '%'
    ),
    'ningún aviso copia motivos, evidencia ni cuerpos sensibles'
  );
  perform pg_temp.ok(
    not exists (
      select n.dedupe_key
      from public.notifications n
      where n.entity_id in (
        v_report, v_community_request, v_organization_request,
        v_suspension, v_appeal
      )
      group by n.dedupe_key
      having count(*) > 1
    ),
    'las claves de evento y destinatario mantienen la idempotencia'
  );
  perform pg_temp.ok(
    not has_function_privilege(
      'anon',
      'private.notify_active_moderators(uuid,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'private.notify_active_moderators(uuid,text,text,text,text,text,uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'service_role',
      'private.notify_active_moderators(uuid,text,text,text,text,text,uuid,text)',
      'execute'
    ),
    'el fan-out interno no queda expuesto como RPC'
  );
end;
$$;

rollback;
