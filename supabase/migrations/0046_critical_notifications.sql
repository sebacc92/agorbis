-- =============================================================================
-- Agorbis · 0046 · Notificaciones críticas de moderación y operación
-- -----------------------------------------------------------------------------
-- Cierra los avisos que no pueden depender de que una persona tenga abierta la
-- pantalla correcta: medidas sobre su cuenta, ciclo de apelaciones/reportes y
-- nuevas entradas en las colas operativas. Los textos son deliberadamente
-- genéricos: el motivo del reporte, la apelación, la evidencia y las notas de
-- moderación nunca se copian a `notifications`.
-- =============================================================================

begin;

-- La cola se distribuye sólo entre identidades privilegiadas activas. El índice
-- parcial evita recorrer perfiles normales por cada reporte o solicitud.
create index if not exists profiles_privileged_notifications_idx
  on public.profiles (id)
  where role in ('moderator', 'admin');

create or replace function private.notify_active_moderators(
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_prefix text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_recipient uuid;
begin
  for v_recipient in
    select p.id
    from public.profiles p
    where p.role in ('moderator', 'admin')
      and not private.active_suspension(p.id)
      and not private.account_deletion_is_pending(p.id)
    order by p.id
  loop
    perform public.create_notification(
      v_recipient,
      p_actor,
      p_type,
      p_title,
      p_body,
      p_href,
      p_entity_type,
      p_entity_id,
      p_dedupe_prefix || ':' || v_recipient::text
    );
  end loop;
end;
$$;

create or replace function private.notify_suspension_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.create_notification(
      new.user_id,
      case when new.created_by is distinct from new.user_id
        then new.created_by else null end,
      'account_suspended',
      'Tu cuenta fue suspendida',
      'Consultá el estado de la medida y las opciones de apelación en tu perfil.',
      '/perfil/apelacion',
      'user_suspension',
      new.id,
      'suspension:' || new.id::text || ':created'
    );
  elsif old.lifted_at is null and new.lifted_at is not null then
    perform public.create_notification(
      new.user_id,
      case when new.lifted_by is distinct from new.user_id
        then new.lifted_by else null end,
      'account_suspension_lifted',
      'Se levantó la suspensión de tu cuenta',
      'La medida ya no está activa. Podés revisar su estado en tu perfil.',
      '/perfil/apelacion',
      'user_suspension',
      new.id,
      'suspension:' || new.id::text || ':lifted'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists user_suspensions_notify_critical
  on public.user_suspensions;
create trigger user_suspensions_notify_critical
  after insert or update of lifted_at on public.user_suspensions
  for each row execute function private.notify_suspension_event();

create or replace function private.notify_appeal_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Actor nulo: una confirmación propia no debe ser descartada por la regla
    -- anti-autonotificación de `create_notification`.
    perform public.create_notification(
      new.appellant_id,
      null,
      'appeal_submitted',
      'Recibimos tu apelación',
      'La apelación quedó registrada y está pendiente de revisión.',
      '/perfil/apelacion',
      'moderation_appeal',
      new.id,
      'appeal:' || new.id::text || ':submitted'
    );
    perform private.notify_active_moderators(
      new.appellant_id,
      'appeal_queue',
      'Hay una nueva apelación pendiente',
      'Revisá la nueva entrada en la cola de apelaciones.',
      '/moderacion/apelaciones',
      'moderation_appeal',
      new.id,
      'queue:appeal:' || new.id::text
    );
  elsif new.status is distinct from old.status
        and new.status in ('accepted', 'rejected') then
    perform public.create_notification(
      new.appellant_id,
      case when new.reviewed_by is distinct from new.appellant_id
        then new.reviewed_by else null end,
      'appeal_resolved',
      case new.status
        when 'accepted' then 'Tu apelación fue aceptada'
        else 'Tu apelación fue rechazada'
      end,
      'La revisión terminó. Consultá el estado y la resolución en tu perfil.',
      '/perfil/apelacion',
      'moderation_appeal',
      new.id,
      'appeal:' || new.id::text || ':resolved:' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists moderation_appeals_notify_critical
  on public.moderation_appeals;
create trigger moderation_appeals_notify_critical
  after insert or update of status on public.moderation_appeals
  for each row execute function private.notify_appeal_event();

create or replace function private.notify_report_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.notify_active_moderators(
      new.reporter_id,
      'report_queue',
      'Hay un nuevo reporte pendiente',
      'Revisá la nueva entrada en la cola de moderación.',
      '/moderacion',
      'report',
      new.id,
      'queue:report:' || new.id::text
    );
  elsif new.status is distinct from old.status
        and new.status in ('resolved', 'dismissed') then
    perform public.create_notification(
      new.reporter_id,
      case when new.resolved_by is distinct from new.reporter_id
        then new.resolved_by else null end,
      'report_resolved',
      'Moderación revisó tu reporte',
      case new.status
        when 'resolved' then 'El reporte fue revisado y se tomó una decisión.'
        else 'El reporte fue revisado y se cerró sin tomar una medida.'
      end,
      '/perfil',
      'report',
      new.id,
      'report:' || new.id::text || ':resolved:' || new.status
    );
  end if;
  return new;
end;
$$;

drop trigger if exists reports_notify_critical on public.reports;
create trigger reports_notify_critical
  after insert or update of status on public.reports
  for each row execute function private.notify_report_event();

create or replace function private.notify_request_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_title text;
begin
  if tg_table_name = 'community_requests' then
    v_kind := 'community_request';
    v_title := 'Hay una nueva solicitud de comunidad';
  else
    v_kind := 'organization_request';
    v_title := 'Hay una nueva solicitud institucional';
  end if;

  perform private.notify_active_moderators(
    new.user_id,
    'request_queue',
    v_title,
    'Revisá la nueva entrada en la cola de solicitudes.',
    '/moderacion/solicitudes',
    v_kind,
    new.id,
    'queue:' || replace(v_kind, '_', '-') || ':' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists community_requests_notify_submission
  on public.community_requests;
create trigger community_requests_notify_submission
  after insert on public.community_requests
  for each row execute function private.notify_request_submission();

drop trigger if exists organization_requests_notify_submission
  on public.organization_requests;
create trigger organization_requests_notify_submission
  after insert on public.organization_requests
  for each row execute function private.notify_request_submission();

-- Son funciones internas de trigger/fan-out. El trigger puede ejecutarlas sin
-- exponer un RPC que permita fabricar notificaciones o enumerar moderadores.
revoke execute on function private.notify_active_moderators(
  uuid, text, text, text, text, text, uuid, text
) from public, anon, authenticated, service_role;
revoke execute on function private.notify_suspension_event(),
  private.notify_appeal_event(),
  private.notify_report_event(),
  private.notify_request_submission()
from public, anon, authenticated, service_role;

commit;
