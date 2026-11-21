-- =============================================================================
-- Agorbis · 0018 · Flujos cívicos completos
-- -----------------------------------------------------------------------------
-- Inicio personalizado, notificaciones, fuentes, instituciones, evolución de
-- reclamos, ejecución de proyectos, solicitudes de comunidades, relaciones de
-- contenido y métricas de activación. Todas las tablas nuevas tienen RLS.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Helpers para contenido polimórfico.
-- -----------------------------------------------------------------------------
create or replace function public.content_exists(p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return case p_type
    when 'poll' then exists (select 1 from public.polls where id = p_id and status <> 'removed')
    when 'debate' then exists (select 1 from public.debates where id = p_id and status <> 'removed')
    when 'claim' then exists (select 1 from public.claims where id = p_id and status <> 'removed')
    when 'project' then exists (select 1 from public.projects where id = p_id and status <> 'removed')
    else false
  end;
end;
$$;

create or replace function public.content_author(p_type text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_author uuid;
begin
  case p_type
    when 'poll' then select author_id into v_author from public.polls where id = p_id;
    when 'debate' then select author_id into v_author from public.debates where id = p_id;
    when 'claim' then select author_id into v_author from public.claims where id = p_id;
    when 'project' then select author_id into v_author from public.projects where id = p_id;
    else v_author := null;
  end case;
  return v_author;
end;
$$;

create or replace function public.can_manage_content(p_user uuid, p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null
    and (public.is_moderator(p_user) or public.content_author(p_type, p_id) = p_user);
$$;

grant execute on function public.content_exists(text, uuid) to anon, authenticated;
grant execute on function public.content_author(text, uuid) to anon, authenticated;
grant execute on function public.can_manage_content(uuid, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Fuentes y documentos dentro de publicaciones.
-- -----------------------------------------------------------------------------
create table if not exists public.content_sources (
  id            uuid primary key default gen_random_uuid(),
  content_type  text not null,
  content_id    uuid not null,
  added_by      uuid references public.profiles (id) on delete set null,
  title         text not null,
  url           text not null,
  publisher     text,
  published_at  date,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),

  constraint content_sources_type_chk check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint content_sources_title_chk check (char_length(title) between 3 and 180),
  constraint content_sources_url_chk check (url ~ '^https?://'),
  constraint content_sources_unique unique (content_type, content_id, url)
);

create index if not exists content_sources_target_idx
  on public.content_sources (content_type, content_id, created_at);

create or replace function public.guard_polymorphic_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.content_exists(new.content_type, new.content_id) then
    raise exception 'El contenido relacionado no existe o no está visible';
  end if;
  return new;
end;
$$;

drop trigger if exists content_sources_guard_target on public.content_sources;
create trigger content_sources_guard_target before insert or update on public.content_sources
  for each row execute function public.guard_polymorphic_content();

alter table public.content_sources enable row level security;
create policy content_sources_select_all on public.content_sources for select using (true);
create policy content_sources_insert_manager on public.content_sources for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.can_manage_content(auth.uid(), content_type, content_id)
  );
create policy content_sources_delete_manager on public.content_sources for delete to authenticated
  using (public.can_manage_content(auth.uid(), content_type, content_id));

-- -----------------------------------------------------------------------------
-- 4 · Organizaciones verificadas y respuestas institucionales.
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  community_id  uuid references public.communities (id) on delete set null,
  name          text not null,
  slug          text not null unique,
  type          text not null default 'government',
  description   text,
  website       text,
  logo_url      text,
  verified_at   timestamptz,
  verified_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint organizations_name_chk check (char_length(name) between 2 and 160),
  constraint organizations_slug_chk check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_type_chk check (type in ('government', 'ngo', 'institution', 'company', 'other')),
  constraint organizations_website_chk check (website is null or website ~ '^https?://')
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  role             text not null default 'representative',
  verified_at      timestamptz not null default now(),
  added_by         uuid references public.profiles (id) on delete set null,
  primary key (organization_id, user_id),
  constraint organization_members_role_chk check (role in ('representative', 'editor', 'admin'))
);

create table if not exists public.organization_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  community_id  uuid references public.communities (id) on delete set null,
  name          text not null,
  type          text not null,
  website       text,
  evidence_url  text,
  message       text not null,
  status        text not null default 'pending',
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint organization_requests_type_chk check (type in ('government', 'ngo', 'institution', 'company', 'other')),
  constraint organization_requests_status_chk check (status in ('pending', 'approved', 'rejected')),
  constraint organization_requests_message_chk check (char_length(message) between 20 and 2000)
);

create table if not exists public.institutional_responses (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  content_type  text not null,
  content_id    uuid not null,
  response_type text not null default 'information',
  body          text not null,
  source_url    text,
  created_at    timestamptz not null default now(),
  constraint institutional_responses_content_type_chk check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint institutional_responses_type_chk check (response_type in ('information', 'acknowledged', 'commitment', 'completed')),
  constraint institutional_responses_body_chk check (char_length(body) between 20 and 4000),
  constraint institutional_responses_source_chk check (source_url is null or source_url ~ '^https?://')
);

create index if not exists institutional_responses_target_idx
  on public.institutional_responses (content_type, content_id, created_at);

create or replace function public.is_verified_org_member(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user and m.organization_id = p_org and o.verified_at is not null
  );
$$;

grant execute on function public.is_verified_org_member(uuid, uuid) to authenticated, anon;

drop trigger if exists institutional_responses_guard_target on public.institutional_responses;
create trigger institutional_responses_guard_target before insert or update on public.institutional_responses
  for each row execute function public.guard_polymorphic_content();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_requests enable row level security;
alter table public.institutional_responses enable row level security;

create policy organizations_select_verified on public.organizations for select
  using (verified_at is not null or public.is_moderator(auth.uid()));
create policy organizations_mod_write on public.organizations for all to authenticated
  using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));
create policy organization_members_select_own_or_mod on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_moderator(auth.uid()));
create policy organization_members_mod_write on public.organization_members for all to authenticated
  using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));
create policy organization_requests_select_own_or_mod on public.organization_requests for select to authenticated
  using (user_id = auth.uid() or public.is_moderator(auth.uid()));
create policy organization_requests_insert_own on public.organization_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy organization_requests_mod_update on public.organization_requests for update to authenticated
  using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));
create policy institutional_responses_select_all on public.institutional_responses for select using (true);
create policy institutional_responses_insert_verified on public.institutional_responses for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified_org_member(auth.uid(), organization_id)
    and public.content_exists(content_type, content_id)
  );
create policy institutional_responses_update_own on public.institutional_responses for update to authenticated
  using (author_id = auth.uid() or public.is_moderator(auth.uid()))
  with check (author_id = auth.uid() or public.is_moderator(auth.uid()));

create or replace function public.approve_organization_request(p_request uuid, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_request public.organization_requests%rowtype; v_org uuid;
begin
  if not public.is_moderator(auth.uid()) then raise exception 'Sin permisos'; end if;
  select * into v_request from public.organization_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'Solicitud inexistente o ya revisada'; end if;
  insert into public.organizations (community_id, name, slug, type, website, verified_at, verified_by)
  values (v_request.community_id, v_request.name, p_slug, v_request.type, v_request.website, now(), auth.uid())
  returning id into v_org;
  insert into public.organization_members (organization_id, user_id, role, added_by)
  values (v_org, v_request.user_id, 'admin', auth.uid());
  update public.organization_requests set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request;
  return v_org;
end;
$$;

grant execute on function public.approve_organization_request(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5 · Reclamos con responsable y línea de tiempo.
-- -----------------------------------------------------------------------------
alter table public.claims drop constraint if exists claims_status_chk;
alter table public.claims add constraint claims_status_chk check (
  status in ('open', 'under_review', 'acknowledged', 'in_progress', 'resolved', 'rejected', 'removed')
);
alter table public.claims
  add column if not exists responsible_organization_id uuid references public.organizations (id) on delete set null;
alter table public.claims add column if not exists location_text text;

create table if not exists public.claim_events (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.claims (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  event_type    text not null default 'update',
  title         text not null,
  body          text,
  status        text,
  evidence_url  text,
  event_date    date not null default current_date,
  created_at    timestamptz not null default now(),
  constraint claim_events_type_chk check (event_type in ('created', 'status_change', 'official_response', 'evidence', 'update', 'resolution')),
  constraint claim_events_title_chk check (char_length(title) between 3 and 180),
  constraint claim_events_evidence_chk check (evidence_url is null or evidence_url ~ '^https?://')
);

create index if not exists claim_events_claim_idx on public.claim_events (claim_id, event_date desc, created_at desc);

create or replace function public.can_update_claim_as_org(p_user uuid, p_claim uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.claims c
    where c.id = p_claim
      and c.responsible_organization_id is not null
      and public.is_verified_org_member(p_user, c.responsible_organization_id)
  );
$$;

grant execute on function public.can_update_claim_as_org(uuid, uuid) to authenticated;

alter table public.claim_events enable row level security;
create policy claim_events_select_all on public.claim_events for select using (true);
create policy claim_events_insert_manager on public.claim_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      public.can_manage_content(auth.uid(), 'claim', claim_id)
      or public.can_update_claim_as_org(auth.uid(), claim_id)
    )
  );
create policy claim_events_mod_delete on public.claim_events for delete to authenticated
  using (public.is_moderator(auth.uid()));
create policy claims_update_responsible_org on public.claims for update to authenticated
  using (public.can_update_claim_as_org(auth.uid(), id))
  with check (public.can_update_claim_as_org(auth.uid(), id));

create or replace function public.guard_claim_event_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is not null
     and not public.is_verified_org_member(new.actor_id, new.organization_id) then
    raise exception 'No representás a esa organización';
  end if;
  return new;
end;
$$;

drop trigger if exists claim_events_guard_organization on public.claim_events;
create trigger claim_events_guard_organization before insert or update on public.claim_events
  for each row execute function public.guard_claim_event_organization();

create or replace function public.guard_claim_institutional_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_moderator(auth.uid())
     and old.author_id is distinct from auth.uid()
     and public.can_update_claim_as_org(auth.uid(), old.id)
     and (to_jsonb(new) - 'status' - 'support_count')
         is distinct from (to_jsonb(old) - 'status' - 'support_count') then
    raise exception 'La institución responsable sólo puede actualizar el estado del reclamo';
  end if;
  return new;
end;
$$;

drop trigger if exists claims_guard_institutional_update on public.claims;
create trigger claims_guard_institutional_update before update on public.claims
  for each row execute function public.guard_claim_institutional_update();

insert into public.claim_events (claim_id, actor_id, event_type, title, body, status, event_date, created_at)
select id, author_id, 'created', 'Reclamo publicado', null, status, created_at::date, created_at
from public.claims c
where not exists (
  select 1 from public.claim_events e where e.claim_id = c.id and e.event_type = 'created'
);

-- -----------------------------------------------------------------------------
-- 6 · Proyectos ejecutables: hitos, tareas y aportes no monetarios.
-- -----------------------------------------------------------------------------
create table if not exists public.project_milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null,
  description   text,
  target_date   date,
  status        text not null default 'pending',
  sort_order    smallint not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint project_milestones_status_chk check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  constraint project_milestones_title_chk check (char_length(title) between 3 and 160)
);

create table if not exists public.project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  milestone_id  uuid references public.project_milestones (id) on delete set null,
  title         text not null,
  description   text,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  assigned_organization_id uuid references public.organizations (id) on delete set null,
  skills_needed text,
  due_date      date,
  status        text not null default 'open',
  created_at    timestamptz not null default now(),
  constraint project_tasks_status_chk check (status in ('open', 'in_progress', 'completed', 'blocked')),
  constraint project_tasks_title_chk check (char_length(title) between 3 and 180)
);

create table if not exists public.project_contributions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          text not null,
  description   text not null,
  quantity      numeric,
  unit          text,
  status        text not null default 'offered',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint project_contributions_kind_chk check (kind in ('time', 'materials', 'skills', 'logistics', 'other')),
  constraint project_contributions_status_chk check (status in ('offered', 'accepted', 'completed', 'declined')),
  constraint project_contributions_description_chk check (char_length(description) between 5 and 1000)
);

create index if not exists project_milestones_project_idx on public.project_milestones (project_id, sort_order);
create index if not exists project_tasks_project_idx on public.project_tasks (project_id, status, due_date);
create index if not exists project_contributions_project_idx on public.project_contributions (project_id, status, created_at);

alter table public.project_milestones enable row level security;
alter table public.project_tasks enable row level security;
alter table public.project_contributions enable row level security;

create policy project_milestones_select_all on public.project_milestones for select using (true);
create policy project_milestones_manage on public.project_milestones for all to authenticated
  using (public.can_manage_content(auth.uid(), 'project', project_id))
  with check (public.can_manage_content(auth.uid(), 'project', project_id));
create policy project_tasks_select_all on public.project_tasks for select using (true);
create policy project_tasks_manage on public.project_tasks for all to authenticated
  using (
    public.can_manage_content(auth.uid(), 'project', project_id)
    or assigned_user_id = auth.uid()
  )
  with check (
    public.can_manage_content(auth.uid(), 'project', project_id)
    or assigned_user_id = auth.uid()
  );
create policy project_contributions_select_all on public.project_contributions for select using (true);
create policy project_contributions_insert_member on public.project_contributions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.status in ('proposal', 'funding', 'in_progress')
        and public.is_member(auth.uid(), p.community_id)
    )
  );
create policy project_contributions_update_own_or_manager on public.project_contributions for update to authenticated
  using (user_id = auth.uid() or public.can_manage_content(auth.uid(), 'project', project_id))
  with check (user_id = auth.uid() or public.can_manage_content(auth.uid(), 'project', project_id));

-- -----------------------------------------------------------------------------
-- 7 · Solicitudes de comunidades faltantes.
-- -----------------------------------------------------------------------------
create table if not exists public.community_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  requested_name text not null,
  country       text not null,
  parent_community_id uuid references public.communities (id) on delete set null,
  requested_level text not null default 'city',
  reason        text not null,
  evidence_url  text,
  status        text not null default 'pending',
  resolution_note text,
  created_community_id uuid references public.communities (id) on delete set null,
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint community_requests_level_chk check (requested_level in ('province', 'city', 'neighborhood')),
  constraint community_requests_status_chk check (status in ('pending', 'reviewing', 'approved', 'rejected', 'duplicate')),
  constraint community_requests_reason_chk check (char_length(reason) between 20 and 1500),
  constraint community_requests_evidence_chk check (evidence_url is null or evidence_url ~ '^https?://')
);

alter table public.community_requests enable row level security;
create policy community_requests_select_own_or_mod on public.community_requests for select to authenticated
  using (user_id = auth.uid() or public.is_moderator(auth.uid()));
create policy community_requests_insert_own on public.community_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
create policy community_requests_mod_update on public.community_requests for update to authenticated
  using (public.is_moderator(auth.uid())) with check (public.is_moderator(auth.uid()));

-- -----------------------------------------------------------------------------
-- 8 · Relaciones entre publicaciones.
-- -----------------------------------------------------------------------------
create table if not exists public.content_relations (
  id            uuid primary key default gen_random_uuid(),
  source_type   text not null,
  source_id     uuid not null,
  target_type   text not null,
  target_id     uuid not null,
  relation_type text not null default 'related',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint content_relations_source_type_chk check (source_type in ('poll', 'debate', 'claim', 'project')),
  constraint content_relations_target_type_chk check (target_type in ('poll', 'debate', 'claim', 'project')),
  constraint content_relations_relation_chk check (relation_type in ('related', 'result_of', 'proposal_for', 'follow_up')),
  constraint content_relations_not_self_chk check (source_type <> target_type or source_id <> target_id),
  constraint content_relations_unique unique (source_type, source_id, target_type, target_id)
);

create index if not exists content_relations_source_idx on public.content_relations (source_type, source_id);
create index if not exists content_relations_target_idx on public.content_relations (target_type, target_id);

create or replace function public.guard_content_relation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.content_exists(new.source_type, new.source_id)
     or not public.content_exists(new.target_type, new.target_id) then
    raise exception 'Uno de los contenidos vinculados no existe o no está visible';
  end if;
  return new;
end;
$$;

drop trigger if exists content_relations_guard on public.content_relations;
create trigger content_relations_guard before insert or update on public.content_relations
  for each row execute function public.guard_content_relation();

alter table public.content_relations enable row level security;
create policy content_relations_select_all on public.content_relations for select using (true);
create policy content_relations_insert_manager on public.content_relations for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_manage_content(auth.uid(), source_type, source_id)
  );
create policy content_relations_delete_manager on public.content_relations for delete to authenticated
  using (public.can_manage_content(auth.uid(), source_type, source_id));

-- -----------------------------------------------------------------------------
-- 2 · Notificaciones internas.
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  type          text not null,
  title         text not null,
  body          text,
  href          text not null,
  entity_type   text,
  entity_id     uuid,
  dedupe_key    text unique,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, read_at, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated
  using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_own on public.notifications for delete to authenticated
  using (recipient_id = auth.uid());

create or replace function public.create_notification(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text,
  p_href text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  insert into public.notifications (
    recipient_id, actor_id, type, title, body, href, entity_type, entity_id, dedupe_key
  ) values (
    p_recipient, p_actor, p_type, p_title, p_body, p_href, p_entity_type, p_entity_id, p_dedupe_key
  ) on conflict (dedupe_key) do nothing;
end;
$$;

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_recipient uuid; v_title text; v_parent_author uuid;
begin
  if tg_table_name = 'debate_comments' then
    select author_id, title into v_recipient, v_title from public.debates where id = new.debate_id;
    perform public.create_notification(v_recipient, new.user_id, 'reply', 'Nuevo comentario en tu debate',
      left(new.body, 180), '/debates/' || new.debate_id, 'debate', new.debate_id,
      'debate-comment:' || new.id || ':author');
  else
    select author_id, title into v_recipient, v_title from public.projects where id = new.project_id;
    perform public.create_notification(v_recipient, new.user_id, 'reply', 'Nueva pregunta en tu proyecto',
      left(new.body, 180), '/proyectos/' || new.project_id, 'project', new.project_id,
      'project-comment:' || new.id || ':author');
    if new.parent_id is not null then
      select user_id into v_parent_author from public.project_comments where id = new.parent_id;
      perform public.create_notification(v_parent_author, new.user_id, 'reply', 'Respondieron tu pregunta',
        left(new.body, 180), '/proyectos/' || new.project_id, 'project', new.project_id,
        'project-comment:' || new.id || ':parent');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists debate_comments_notify on public.debate_comments;
create trigger debate_comments_notify after insert on public.debate_comments
  for each row execute function public.notify_new_comment();
drop trigger if exists project_comments_notify on public.project_comments;
create trigger project_comments_notify after insert on public.project_comments
  for each row execute function public.notify_new_comment();

create or replace function public.notify_content_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_recipient uuid; v_user uuid; v_title text; v_type text; v_href text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_type := case tg_table_name when 'polls' then 'poll' when 'claims' then 'claim' else 'project' end;
  v_title := case tg_table_name when 'polls' then new.question else new.title end;
  v_href := case tg_table_name
    when 'polls' then '/encuestas/' || new.id
    when 'claims' then '/reclamos/' || new.id
    else '/proyectos/' || new.id end;
  v_recipient := new.author_id;

  perform public.create_notification(v_recipient, auth.uid(), 'status_change',
    'Cambió el estado de tu publicación', v_title || ' · ' || new.status,
    v_href, v_type, new.id, 'status:' || v_type || ':' || new.id || ':' || new.status || ':author');

  if tg_table_name = 'polls' and new.status = 'closed' then
    for v_user in select distinct user_id from public.poll_votes where poll_id = new.id loop
      perform public.create_notification(v_user, auth.uid(), 'poll_closed', 'Cerró una encuesta en la que votaste',
        v_title, v_href, v_type, new.id, 'poll-closed:' || new.id || ':' || v_user);
    end loop;
  elsif tg_table_name = 'claims' then
    for v_user in select user_id from public.claim_supports where claim_id = new.id loop
      perform public.create_notification(v_user, auth.uid(), 'claim_update', 'Hay novedades en un reclamo que apoyás',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'claim-status:' || new.id || ':' || new.status || ':' || v_user);
    end loop;
  elsif tg_table_name = 'projects' then
    for v_user in
      select user_id from public.project_pledges where project_id = new.id
      union select user_id from public.project_contributions where project_id = new.id
    loop
      perform public.create_notification(v_user, auth.uid(), 'project_update', 'Avanzó un proyecto al que te sumaste',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'project-status:' || new.id || ':' || new.status || ':' || v_user);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists polls_notify_status on public.polls;
create trigger polls_notify_status after update of status on public.polls
  for each row execute function public.notify_content_status();
drop trigger if exists claims_notify_status on public.claims;
create trigger claims_notify_status after update of status on public.claims
  for each row execute function public.notify_content_status();
drop trigger if exists projects_notify_status on public.projects;
create trigger projects_notify_status after update of status on public.projects
  for each row execute function public.notify_content_status();

create or replace function public.notify_project_milestone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_project_title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  select title into v_project_title from public.projects where id = new.project_id;
  for v_user in
    select user_id from public.project_pledges where project_id = new.project_id
    union select user_id from public.project_contributions where project_id = new.project_id
  loop
    perform public.create_notification(v_user, auth.uid(), 'project_update',
      'Nuevo avance en un proyecto al que te sumaste',
      v_project_title || ' · ' || new.title || ' · ' || new.status,
      '/proyectos/' || new.project_id, 'project', new.project_id,
      'milestone:' || new.id || ':' || new.status || ':' || v_user);
  end loop;
  return new;
end;
$$;

drop trigger if exists project_milestones_notify on public.project_milestones;
create trigger project_milestones_notify after insert or update of status on public.project_milestones
  for each row execute function public.notify_project_milestone();

create or replace function public.record_claim_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status <> 'removed' then
    insert into public.claim_events (claim_id, actor_id, event_type, title, status)
    values (new.id, auth.uid(), case when new.status = 'resolved' then 'resolution' else 'status_change' end,
      'Estado actualizado a ' || new.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists claims_record_status_event on public.claims;
create trigger claims_record_status_event after update of status on public.claims
  for each row execute function public.record_claim_status_event();

create or replace function public.notify_claim_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_claim_title text;
begin
  select title into v_claim_title from public.claims where id = new.claim_id;
  for v_user in select user_id from public.claim_supports where claim_id = new.claim_id loop
    perform public.create_notification(v_user, new.actor_id, 'claim_update',
      'Hay una actualización en un reclamo que apoyás',
      v_claim_title || ' · ' || new.title,
      '/reclamos/' || new.claim_id, 'claim', new.claim_id,
      'claim-event:' || new.id || ':' || v_user);
  end loop;
  return new;
end;
$$;

drop trigger if exists claim_events_notify on public.claim_events;
create trigger claim_events_notify after insert on public.claim_events
  for each row execute function public.notify_claim_event();

create or replace function public.notify_institutional_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_recipient uuid; v_org text; v_href text;
begin
  v_recipient := public.content_author(new.content_type, new.content_id);
  select name into v_org from public.organizations where id = new.organization_id;
  v_href := case new.content_type
    when 'poll' then '/encuestas/' when 'debate' then '/debates/'
    when 'claim' then '/reclamos/' else '/proyectos/' end || new.content_id;
  perform public.create_notification(v_recipient, new.author_id, 'institutional_response',
    'Nueva respuesta institucional', v_org || ': ' || left(new.body, 160), v_href,
    new.content_type, new.content_id, 'institutional-response:' || new.id);
  return new;
end;
$$;

drop trigger if exists institutional_responses_notify on public.institutional_responses;
create trigger institutional_responses_notify after insert on public.institutional_responses
  for each row execute function public.notify_institutional_response();

create or replace function public.sync_due_poll_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update public.polls set status = 'closed'
  where status = 'active' and closes_at is not null and closes_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.sync_due_poll_notifications() to authenticated;

create or replace function public.notify_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.create_notification(new.user_id, auth.uid(), 'request_update',
      case tg_table_name when 'community_requests' then 'Actualizamos tu solicitud de comunidad'
        else 'Actualizamos tu solicitud institucional' end,
      coalesce(
        to_jsonb(new)->>'resolution_note',
        to_jsonb(new)->>'name',
        to_jsonb(new)->>'requested_name',
        ''
      ) || ' · ' || new.status,
      case tg_table_name when 'community_requests' then '/comunidades/solicitar'
        else '/instituciones/solicitar' end,
      'request', new.id, 'request:' || tg_table_name || ':' || new.id || ':' || new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists community_requests_notify on public.community_requests;
create trigger community_requests_notify after update of status on public.community_requests
  for each row execute function public.notify_request_status();
drop trigger if exists organization_requests_notify on public.organization_requests;
create trigger organization_requests_notify after update of status on public.organization_requests
  for each row execute function public.notify_request_status();

-- -----------------------------------------------------------------------------
-- 1 · Feed de toda la cadena residencial.
-- -----------------------------------------------------------------------------
create or replace function public.personalized_feed(p_user uuid, p_limit integer default 40)
returns table (
  id uuid,
  kind text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  title text,
  summary text,
  status text,
  engagement numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with home as (
    select c.path from public.profiles p
    join public.communities c on c.id = p.home_community_id
    where p.id = p_user and p_user = auth.uid()
  ), chain as (
    select c.* from public.communities c, home h
    where h.path = c.path or h.path like c.path || '.%'
  ), feed as (
    select p.id, 'poll'::text kind, c.id community_id, c.slug, c.name, c.emoji,
      p.question title, p.description summary, p.status,
      (select count(distinct user_id) from public.poll_votes v where v.poll_id = p.id)::numeric engagement,
      p.created_at
    from public.polls p join chain c on c.id = p.community_id where p.status <> 'removed'
    union all
    select d.id, 'debate', c.id, c.slug, c.name, c.emoji, d.title, left(d.body, 300), d.status,
      (select count(*) from public.debate_comments dc where dc.debate_id = d.id and dc.status = 'visible')::numeric,
      d.created_at
    from public.debates d join chain c on c.id = d.community_id where d.status <> 'removed'
    union all
    select cl.id, 'claim', c.id, c.slug, c.name, c.emoji, cl.title, left(cl.description, 300), cl.status,
      cl.support_count::numeric, cl.created_at
    from public.claims cl join chain c on c.id = cl.community_id where cl.status <> 'removed'
    union all
    select pr.id, 'project', c.id, c.slug, c.name, c.emoji, pr.title, pr.summary, pr.status,
      ((select count(*) from public.project_contributions pc where pc.project_id = pr.id)
        + (select count(*) from public.project_pledges pp where pp.project_id = pr.id))::numeric,
      pr.created_at
    from public.projects pr join chain c on c.id = pr.community_id where pr.status <> 'removed'
  )
  select f.id, f.kind, f.community_id, f.slug, f.name, f.emoji, f.title, f.summary,
    f.status, f.engagement, f.created_at
  from feed f order by f.created_at desc, f.id desc limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.personalized_feed(uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 10 · Métricas de activación sin analítica invasiva.
-- -----------------------------------------------------------------------------
create table if not exists public.activation_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  event       text not null,
  event_date  date not null default current_date,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint activation_events_event_chk check (event in ('signup', 'residence_selected', 'first_participation', 'visit', 'return_week'))
);

create unique index if not exists activation_once_per_user_idx
  on public.activation_events (user_id, event)
  where event in ('signup', 'residence_selected', 'first_participation', 'return_week');
create unique index if not exists activation_daily_visit_idx
  on public.activation_events (user_id, event, event_date)
  where event = 'visit';
create index if not exists activation_events_date_idx on public.activation_events (event_date, event);

alter table public.activation_events enable row level security;
create policy activation_events_mod_select on public.activation_events for select to authenticated
  using (public.is_moderator(auth.uid()));

create or replace function public.track_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activation_events (user_id, event, event_date, created_at)
    values (new.id, 'signup', new.created_at::date, new.created_at) on conflict do nothing;
    if new.home_community_id is not null then
      insert into public.activation_events (user_id, event, event_date, metadata)
      values (new.id, 'residence_selected', current_date, jsonb_build_object('community_id', new.home_community_id))
      on conflict do nothing;
    end if;
  elsif new.home_community_id is distinct from old.home_community_id and new.home_community_id is not null then
    insert into public.activation_events (user_id, event, metadata)
    values (new.id, 'residence_selected', jsonb_build_object('community_id', new.home_community_id))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_track_activation on public.profiles;
create trigger profiles_track_activation after insert or update on public.profiles
  for each row execute function public.track_profile_activation();

create or replace function public.track_first_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_kind text;
begin
  v_user := case tg_table_name
    when 'poll_votes' then new.user_id when 'debate_comments' then new.user_id
    when 'claim_supports' then new.user_id when 'project_pledges' then new.user_id
    when 'project_contributions' then new.user_id else new.author_id end;
  v_kind := tg_table_name;
  if v_user is not null then
    insert into public.activation_events (user_id, event, metadata)
    values (v_user, 'first_participation', jsonb_build_object('kind', v_kind)) on conflict do nothing;
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'poll_votes', 'debate_comments', 'claim_supports', 'project_pledges',
    'project_contributions', 'polls', 'debates', 'claims', 'projects'
  ] loop
    execute format('drop trigger if exists %I_track_activation on public.%I', v_table, v_table);
    execute format('create trigger %I_track_activation after insert on public.%I for each row execute function public.track_first_participation()', v_table, v_table);
  end loop;
end;
$$;

create or replace function public.record_activation_visit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid(); v_signup date;
begin
  if v_user is null then return; end if;
  insert into public.activation_events (user_id, event) values (v_user, 'visit') on conflict do nothing;
  select event_date into v_signup from public.activation_events
    where user_id = v_user and event = 'signup' limit 1;
  if v_signup is not null and current_date > v_signup and current_date <= v_signup + 7 then
    insert into public.activation_events (user_id, event) values (v_user, 'return_week') on conflict do nothing;
  end if;
end;
$$;

grant execute on function public.record_activation_visit() to authenticated;

-- Backfill mínimo para que el tablero sea útil desde el primer despliegue.
insert into public.activation_events (user_id, event, event_date, created_at)
select id, 'signup', created_at::date, created_at from public.profiles on conflict do nothing;
insert into public.activation_events (user_id, event, event_date, metadata)
select id, 'residence_selected', coalesce(residence_changed_at, created_at)::date,
  jsonb_build_object('community_id', home_community_id)
from public.profiles where home_community_id is not null on conflict do nothing;

with participations as (
  select author_id user_id, created_at, 'polls' kind from public.polls where author_id is not null
  union all select author_id, created_at, 'debates' from public.debates where author_id is not null
  union all select author_id, created_at, 'claims' from public.claims where author_id is not null
  union all select author_id, created_at, 'projects' from public.projects where author_id is not null
  union all select user_id, created_at, 'poll_votes' from public.poll_votes
  union all select user_id, created_at, 'debate_comments' from public.debate_comments
  union all select user_id, created_at, 'claim_supports' from public.claim_supports
  union all select user_id, created_at, 'project_pledges' from public.project_pledges
  union all select user_id, created_at, 'project_contributions' from public.project_contributions
), firsts as (
  select distinct on (user_id) user_id, created_at, kind
  from participations order by user_id, created_at
)
insert into public.activation_events (user_id, event, event_date, created_at, metadata)
select user_id, 'first_participation', created_at::date, created_at, jsonb_build_object('kind', kind)
from firsts on conflict do nothing;

commit;
