-- Agorbis · 0064 · Preferencias y filtros privados de notificaciones.
-- Los valores por defecto conservan la entrega de la aplicación anterior.
-- Sólo se pueden silenciar las cinco novedades opcionales enumeradas abajo;
-- avisos críticos, operativos y tipos futuros se entregan siempre.
begin;

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  replies boolean not null default true,
  poll_results boolean not null default true,
  claim_updates boolean not null default true,
  project_updates boolean not null default true,
  institutional_responses boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create policy notification_preferences_select_own
  on public.notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy notification_preferences_insert_own
  on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy notification_preferences_update_own
  on public.notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.notifications add column community_id uuid
  references public.communities(id) on delete set null;

-- Sólo contenido que ya identifica la notificación. No se deduce ni copia la
-- residencia de su destinatario, reportante o actor para etiquetar un aviso.
create function private.notification_content_community(p_entity_type text, p_entity_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.community_id from (
    select community_id from public.polls where p_entity_type = 'poll' and id = p_entity_id
    union all
    select community_id from public.debates where p_entity_type = 'debate' and id = p_entity_id
    union all
    select community_id from public.claims where p_entity_type = 'claim' and id = p_entity_id
    union all
    select community_id from public.projects where p_entity_type = 'project' and id = p_entity_id
  ) c limit 1;
$$;
revoke all on function private.notification_content_community(text, uuid)
  from public, anon, authenticated, service_role;

update public.notifications n
set community_id = private.notification_content_community(n.entity_type, n.entity_id)
where n.entity_type in ('poll', 'debate', 'claim', 'project');

create function private.apply_notification_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_enabled boolean;
begin
  select case new.type
    when 'reply' then p.replies
    when 'poll_closed' then p.poll_results
    when 'claim_update' then p.claim_updates
    when 'project_update' then p.project_updates
    when 'institutional_response' then p.institutional_responses
    else true
  end into v_enabled
  from public.notification_preferences p where p.user_id = new.recipient_id;
  if v_enabled is false then return null; end if;
  new.community_id := private.notification_content_community(new.entity_type, new.entity_id);
  return new;
end;
$$;
revoke all on function private.apply_notification_preferences()
  from public, anon, authenticated, service_role;
create trigger notifications_apply_preferences
  before insert on public.notifications
  for each row execute function private.apply_notification_preferences();

create index notifications_community_page_idx
  on public.notifications(recipient_id, community_id, created_at desc, id desc);
create index notifications_type_page_idx
  on public.notifications(recipient_id, type, created_at desc, id desc);

-- Invoker + RLS: el selector no descubre comunidades ni destinatarios a partir
-- de bandejas ajenas. El conteo y la paginación siguen consultando la tabla RLS.
create function public.notification_communities()
returns table(community_id uuid, name text)
language sql stable security invoker set search_path = '' as $$
  select distinct c.id, c.name
  from public.notifications n
  join public.communities c on c.id = n.community_id
  where n.recipient_id = (select auth.uid())
  order by c.name, c.id;
$$;
revoke all on function public.notification_communities() from public, anon;
grant execute on function public.notification_communities() to authenticated;

create function public.notification_inbox(
  p_unread_only boolean default false,
  p_type text default null,
  p_community_id uuid default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_unread_only is null
    or (p_before_created is null) <> (p_before_id is null)
    or (p_type is not null and p_type not in (
      'reply', 'poll_closed', 'claim_update', 'project_update',
      'institutional_response', 'essential'
    )) then
    raise exception 'Filtro de notificaciones inválido' using errcode = '22023';
  end if;
  with filtered as materialized (
    select n.* from public.notifications n
    where n.recipient_id = (select auth.uid())
      and (not p_unread_only or n.read_at is null)
      and (p_community_id is null or n.community_id = p_community_id)
      and (p_type is null or n.type = p_type or (
        p_type = 'essential' and n.type not in (
          'reply', 'poll_closed', 'claim_update', 'project_update', 'institutional_response'
        )
      ))
  ), page as materialized (
    select n.* from filtered n
    where p_before_created is null or (n.created_at, n.id) < (p_before_created, p_before_id)
    order by n.created_at desc, n.id desc limit p_limit + 1
  ), visible as (
    select * from page order by created_at desc, id desc limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.id desc) from visible v), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'unread', (select count(*) from filtered where read_at is null),
    'has_more', (select count(*) > p_limit from page)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.notification_inbox(boolean, text, uuid, timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.notification_inbox(boolean, text, uuid, timestamptz, uuid, integer)
  to authenticated;

create function public.mark_notifications_read(
  p_notification_id uuid default null,
  p_unread_only boolean default false,
  p_type text default null,
  p_community_id uuid default null
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if p_unread_only is null or (p_type is not null and p_type not in (
    'reply', 'poll_closed', 'claim_update', 'project_update',
    'institutional_response', 'essential'
  )) then
    raise exception 'Filtro de notificaciones inválido' using errcode = '22023';
  end if;
  update public.notifications n set read_at = statement_timestamp()
  where n.recipient_id = (select auth.uid()) and n.read_at is null
    and (p_notification_id is null or n.id = p_notification_id)
    and (p_community_id is null or n.community_id = p_community_id)
    and (p_type is null or n.type = p_type or (
      p_type = 'essential' and n.type not in (
        'reply', 'poll_closed', 'claim_update', 'project_update', 'institutional_response'
      )
    ));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.mark_notifications_read(uuid, boolean, text, uuid)
  from public, anon;
grant execute on function public.mark_notifications_read(uuid, boolean, text, uuid)
  to authenticated;

commit;
