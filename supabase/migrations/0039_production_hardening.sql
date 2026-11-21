-- =============================================================================
-- Agorbis · 0039 · Hardening previo a producción
-- -----------------------------------------------------------------------------
-- Esta migración concentra las barreras que no pueden depender de la UI:
-- ACL explícitas para RPC, invariantes de identidad/estado, límites de abuso,
-- evidencia inmutable, privacidad de agregados, suspensiones y consentimiento
-- legal versionado. Todo helper privilegiado nuevo vive fuera del esquema
-- expuesto por PostgREST.
-- =============================================================================

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Helpers internos de autorización. Nunca se conceden a roles de la API.
-- -----------------------------------------------------------------------------
create or replace function private.raw_is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    where p.id = p_user and p.role in ('moderator', 'admin')
  ), false);
$$;

-- Toda capacidad privilegiada de moderación queda ligada tanto a la identidad
-- del JWT como a una sesión que ya verificó un segundo factor. `raw_*` sólo se
-- usa dentro de este helper para que ninguna policy o RPC pueda omitir AAL2.
create or replace function private.session_is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not null
    and p_user is not distinct from auth.uid()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and private.raw_is_moderator(p_user),
    false
  );
$$;

create or replace function private.raw_is_member(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.profiles p
    join public.communities home on home.id = p.home_community_id
    join public.communities target on target.id = p_community
    where p.id = p_user
      and (home.path = target.path or home.path like target.path || '.%')
  ), false);
$$;

create or replace function private.raw_content_author(p_type text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  case p_type
    when 'poll' then
      select p.author_id into v_author from public.polls p where p.id = p_id;
    when 'debate' then
      select d.author_id into v_author from public.debates d where d.id = p_id;
    when 'claim' then
      select c.author_id into v_author from public.claims c where c.id = p_id;
    when 'project' then
      select p.author_id into v_author from public.projects p where p.id = p_id;
    else
      v_author := null;
  end case;
  return v_author;
end;
$$;

create or replace function private.raw_content_exists(p_type text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return case p_type
    when 'poll' then exists (
      select 1 from public.polls p where p.id = p_id and p.status <> 'removed')
    when 'debate' then exists (
      select 1 from public.debates d where d.id = p_id and d.status <> 'removed')
    when 'claim' then exists (
      select 1 from public.claims c where c.id = p_id and c.status <> 'removed')
    when 'project' then exists (
      select 1 from public.projects p where p.id = p_id and p.status <> 'removed')
    else false
  end;
end;
$$;

create or replace function private.raw_is_verified_org_member(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user
      and m.organization_id = p_org
      and m.verified_at is not null
      and o.verified_at is not null
  ), false);
$$;

-- -----------------------------------------------------------------------------
-- Aceptación legal versionada. Los hashes son SHA-256 UTF-8 de la serialización
-- compacta y estable `JSON.stringify(<Record<Locale, LegalDocumentContent>>)`
-- exportada por src/lib/legal-content.ts (orden literal de propiedades). Esta
-- migración publica las tres versiones obligatorias; si falta cualquiera, el
-- gate se cierra en vez de degradarse silenciosamente.
-- -----------------------------------------------------------------------------
create table if not exists public.legal_document_versions (
  document_type text not null,
  version text not null,
  content_hash text not null,
  effective_at timestamptz not null,
  minimum_age smallint not null default 0,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (document_type, version),
  constraint legal_document_type_chk
    check (document_type in ('terms', 'privacy', 'community_rules')),
  constraint legal_document_version_chk
    check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  constraint legal_document_hash_chk
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint legal_document_minimum_age_chk
    check (minimum_age between 0 and 21)
);

create unique index if not exists legal_document_current_idx
  on public.legal_document_versions (document_type)
  where is_current;

insert into public.legal_document_versions (
  document_type, version, content_hash, effective_at, minimum_age, is_current
) values
  (
    'terms', '2026-08-23',
    '6221c945577bdf3ea485dc254ed657e596a2e8e8cbd2b1e8a2ec8a0fee38cd2f',
    timestamptz '2026-08-23 00:00:00+00', 18, true
  ),
  (
    'privacy', '2026-08-23',
    '1479e27d913daac1297f8b0527ac992f523f3785f131b22990f009487b89ed1d',
    timestamptz '2026-08-23 00:00:00+00', 0, true
  ),
  (
    'community_rules', '2026-08-23',
    '225563ba3a5d2429448dd2a99e35a5f472fc00bcc5fe44ac6fd7172517285541',
    timestamptz '2026-08-23 00:00:00+00', 0, true
  );

create table if not exists public.user_legal_acceptances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  document_type text not null,
  version text not null,
  minimum_age_attested boolean not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, document_type, version),
  constraint user_legal_acceptance_document_fk
    foreign key (document_type, version)
    references public.legal_document_versions (document_type, version)
    on delete restrict
);

create index if not exists user_legal_acceptances_user_idx
  on public.user_legal_acceptances (user_id, accepted_at desc);

alter table public.legal_document_versions enable row level security;
alter table public.user_legal_acceptances enable row level security;

drop policy if exists legal_document_versions_select_all
  on public.legal_document_versions;
create policy legal_document_versions_select_all
  on public.legal_document_versions for select using (true);

drop policy if exists user_legal_acceptances_select_own
  on public.user_legal_acceptances;
create policy user_legal_acceptances_select_own
  on public.user_legal_acceptances for select to authenticated
  using (user_id = auth.uid());

create or replace function private.has_current_legal_acceptance(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and (
      select count(distinct d.document_type) = 3
      from public.legal_document_versions d
      where d.is_current and d.effective_at <= now()
    )
    and not exists (
    select 1
    from public.legal_document_versions d
    where d.is_current
      and d.effective_at <= now()
      and not exists (
        select 1
        from public.user_legal_acceptances a
        where a.user_id = p_user
          and a.document_type = d.document_type
          and a.version = d.version
          and (d.minimum_age = 0 or a.minimum_age_attested)
      )
  );
$$;

-- -----------------------------------------------------------------------------
-- Suspensiones, apelaciones y auditoría inmutable de moderación.
-- -----------------------------------------------------------------------------
create table if not exists public.user_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null,
  -- La medida sobrevive como evidencia aunque quien moderó cierre su cuenta;
  -- se borra el vínculo identificable, no la decisión auditada.
  created_by uuid references public.profiles (id) on delete set null,
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id) on delete set null,
  lift_reason text,
  created_at timestamptz not null default now(),
  constraint user_suspensions_reason_chk
    check (char_length(reason) between 10 and 1000),
  constraint user_suspensions_window_chk
    check (ends_at is null or ends_at > starts_at),
  constraint user_suspensions_lift_chk check (
    (lifted_at is null and lifted_by is null and lift_reason is null)
    or
    (lifted_at is not null and char_length(lift_reason) between 3 and 1000)
  )
);

create index if not exists user_suspensions_active_idx
  on public.user_suspensions (user_id, starts_at, ends_at)
  where lifted_at is null;

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  suspension_id uuid not null references public.user_suspensions (id) on delete restrict,
  appellant_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  status text not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moderation_appeals_body_chk
    check (char_length(body) between 20 and 4000),
  constraint moderation_appeals_status_chk
    check (status in ('pending', 'reviewing', 'accepted', 'rejected', 'withdrawn')),
  constraint moderation_appeals_review_chk check (
    (status in ('pending', 'withdrawn') and reviewed_by is null and reviewed_at is null)
    or
    (status in ('reviewing', 'accepted', 'rejected') and reviewed_at is not null)
  )
);

create unique index if not exists moderation_appeals_one_open_idx
  on public.moderation_appeals (suspension_id)
  where status in ('pending', 'reviewing');
create index if not exists moderation_appeals_appellant_idx
  on public.moderation_appeals (appellant_id, created_at desc);
create index if not exists moderation_appeals_queue_idx
  on public.moderation_appeals (status, created_at);
create index if not exists moderation_appeals_retention_idx
  on public.moderation_appeals (updated_at)
  where status in ('accepted', 'rejected', 'withdrawn');
create index if not exists user_suspensions_lifted_retention_idx
  on public.user_suspensions (lifted_at)
  where lifted_at is not null;
create index if not exists user_suspensions_expired_retention_idx
  on public.user_suspensions (ends_at)
  where lifted_at is null and ends_at is not null;

create table if not exists public.moderation_audit_log (
  id bigint generated always as identity primary key,
  moderator_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint moderation_audit_action_chk
    check (char_length(action) between 3 and 120),
  constraint moderation_audit_target_chk
    check (char_length(target_type) between 1 and 80)
);

create index if not exists moderation_audit_created_idx
  on public.moderation_audit_log (created_at desc, id desc);
create index if not exists moderation_audit_target_idx
  on public.moderation_audit_log (target_type, target_id, created_at desc);

alter table public.user_suspensions enable row level security;
alter table public.moderation_appeals enable row level security;
alter table public.moderation_audit_log enable row level security;

drop policy if exists user_suspensions_select_own_or_mod on public.user_suspensions;
create policy user_suspensions_select_own_or_mod
  on public.user_suspensions for select to authenticated
  using (user_id = auth.uid() or public.is_moderator(auth.uid()));

drop policy if exists moderation_appeals_select_own_or_mod on public.moderation_appeals;
create policy moderation_appeals_select_own_or_mod
  on public.moderation_appeals for select to authenticated
  using (appellant_id = auth.uid() or public.is_moderator(auth.uid()));

drop policy if exists moderation_audit_select_mod on public.moderation_audit_log;
create policy moderation_audit_select_mod
  on public.moderation_audit_log for select to authenticated
  using (public.is_moderator(auth.uid()));

create or replace function private.active_suspension(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.user_suspensions s
    where s.user_id = p_user
      and s.starts_at <= now()
      and s.lifted_at is null
      and (s.ends_at is null or s.ends_at > now())
  ), false);
$$;

create or replace function private.assert_can_participate(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if private.active_suspension(p_user) then
    raise exception 'GEOUNITY_ACCOUNT_SUSPENDED'
      using errcode = 'insufficient_privilege';
  end if;
  if not private.has_current_legal_acceptance(p_user) then
    raise exception 'GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.can_participate()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and not private.active_suspension(auth.uid())
    and private.has_current_legal_acceptance(auth.uid());
$$;

create or replace function public.is_user_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and private.active_suspension(auth.uid());
$$;

create or replace function public.accept_current_legal(
  p_minimum_age_attested boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_at timestamptz := statement_timestamp();
  v_count integer;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_count
  from public.legal_document_versions d
  where d.is_current and d.effective_at <= now();
  if v_count <> 3 then
    raise exception 'GEOUNITY_LEGAL_NOT_CONFIGURED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if exists (
    select 1 from public.legal_document_versions d
    where d.is_current and d.effective_at <= now() and d.minimum_age > 0
  ) and not coalesce(p_minimum_age_attested, false) then
    raise exception 'GEOUNITY_MINIMUM_AGE_REQUIRED'
      using errcode = 'check_violation';
  end if;

  insert into public.user_legal_acceptances (
    user_id, document_type, version, minimum_age_attested, accepted_at
  )
  select v_user, d.document_type, d.version,
         coalesce(p_minimum_age_attested, false), v_at
  from public.legal_document_versions d
  where d.is_current and d.effective_at <= now()
  on conflict (user_id, document_type, version) do nothing;

  return v_at;
end;
$$;

-- Registro inicial usado exclusivamente por el backend después de verificar
-- la identidad. No confía en user_metadata ni acepta una identidad desde una
-- sesión de navegador: el único caller permitido por ACL es service_role.
create or replace function public.record_signup_legal_acceptance(
  p_user uuid,
  p_minimum_age_attested boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := statement_timestamp();
  v_count integer;
begin
  if p_user is null or not exists (
    select 1 from auth.users u where u.id = p_user
  ) then
    raise exception 'GEOUNITY_USER_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;

  -- El trigger de alta debe haber creado el perfil antes de registrar el
  -- consentimiento. Comprobarlo aquí produce un error estable y explícito en
  -- vez de depender del mensaje interno de la FK.
  if not exists (
    select 1 from public.profiles p where p.id = p_user
  ) then
    raise exception 'GEOUNITY_PROFILE_NOT_READY'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select count(*) into v_count
  from public.legal_document_versions d
  where d.is_current and d.effective_at <= now();
  if v_count <> 3 then
    raise exception 'GEOUNITY_LEGAL_NOT_CONFIGURED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if exists (
    select 1 from public.legal_document_versions d
    where d.is_current and d.effective_at <= now() and d.minimum_age > 0
  ) and not coalesce(p_minimum_age_attested, false) then
    raise exception 'GEOUNITY_MINIMUM_AGE_REQUIRED'
      using errcode = 'check_violation';
  end if;

  insert into public.user_legal_acceptances (
    user_id, document_type, version, minimum_age_attested, accepted_at
  )
  select p_user, d.document_type, d.version,
         coalesce(p_minimum_age_attested, false), v_at
  from public.legal_document_versions d
  where d.is_current and d.effective_at <= now()
  on conflict (user_id, document_type, version) do nothing;

  return v_at;
end;
$$;

create or replace function public.my_legal_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'can_participate', public.can_participate(),
    'is_suspended', private.active_suspension(auth.uid()),
    'documents', coalesce(jsonb_agg(jsonb_build_object(
      'type', d.document_type,
      'version', d.version,
      'effective_at', d.effective_at,
      'minimum_age', d.minimum_age,
      'accepted', a.user_id is not null
        and (d.minimum_age = 0 or a.minimum_age_attested),
      'accepted_at', a.accepted_at
    ) order by d.document_type) filter (where d.document_type is not null), '[]'::jsonb)
  )
  from public.legal_document_versions d
  left join public.user_legal_acceptances a
    on a.user_id = auth.uid()
   and a.document_type = d.document_type
   and a.version = d.version
  where d.is_current and d.effective_at <= now();
$$;

create or replace function public.suspend_user(
  p_user uuid,
  p_reason text,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid;
  v_actor_role text;
  v_target_role text;
begin
  perform private.assert_can_participate(v_actor);
  select p.role into v_actor_role
  from public.profiles p where p.id = v_actor;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if p_user is null or p_user = v_actor then
    raise exception 'No podés suspender esa cuenta' using errcode = 'check_violation';
  end if;
  -- El row lock serializa suspensiones concurrentes de la misma cuenta.
  select p.role into v_target_role
  from public.profiles p where p.id = p_user
  for update;
  if not found then
    raise exception 'La cuenta no existe' using errcode = 'foreign_key_violation';
  end if;
  if v_target_role = 'admin'
     or (v_actor_role = 'moderator' and v_target_role <> 'user') then
    raise exception 'GEOUNITY_MODERATION_HIERARCHY'
      using errcode = 'insufficient_privilege';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'El fin de la suspensión debe ser futuro' using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'La suspensión necesita un motivo' using errcode = 'check_violation';
  end if;
  if private.active_suspension(p_user) then
    raise exception 'La cuenta ya está suspendida' using errcode = 'unique_violation';
  end if;

  insert into public.user_suspensions (user_id, ends_at, reason, created_by)
  values (p_user, p_ends_at, btrim(p_reason), v_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.lift_user_suspension(
  p_suspension uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_target_role text;
  v_rows integer;
begin
  perform private.assert_can_participate(v_actor);
  select p.role into v_actor_role
  from public.profiles p where p.id = v_actor;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Hace falta un motivo' using errcode = 'check_violation';
  end if;
  select p.role into v_target_role
  from public.user_suspensions s
  join public.profiles p on p.id = s.user_id
  where s.id = p_suspension
  for update of s;
  if not found then return false; end if;
  if v_target_role = 'admin'
     or (v_actor_role = 'moderator' and v_target_role <> 'user') then
    raise exception 'GEOUNITY_MODERATION_HIERARCHY'
      using errcode = 'insufficient_privilege';
  end if;

  update public.user_suspensions
     set lifted_at = statement_timestamp(), lifted_by = v_actor,
         lift_reason = btrim(p_reason)
   where id = p_suspension and lifted_at is null;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.submit_suspension_appeal(
  p_suspension uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_id uuid;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) < 20 then
    raise exception 'La apelación necesita más detalle' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.user_suspensions s
    where s.id = p_suspension and s.user_id = v_user
  ) then
    raise exception 'La suspensión no pertenece a tu cuenta'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.consume_window_limit(
    'suspension-appeals-day', v_user, 3, interval '1 day'
  );
  insert into public.moderation_appeals (suspension_id, appellant_id, body)
  values (p_suspension, v_user, btrim(p_body))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.withdraw_moderation_appeal(p_appeal uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid(); v_rows integer;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  update public.moderation_appeals
     set status = 'withdrawn', updated_at = statement_timestamp()
   where id = p_appeal and appellant_id = v_user and status = 'pending';
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create or replace function public.review_moderation_appeal(
  p_appeal uuid,
  p_status text,
  p_resolution_note text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_suspension uuid;
  v_actor_role text;
  v_target_role text;
  v_rows integer;
begin
  perform private.assert_can_participate(v_actor);
  select p.role into v_actor_role
  from public.profiles p where p.id = v_actor;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('reviewing', 'accepted', 'rejected') then
    raise exception 'Estado de apelación inválido' using errcode = 'check_violation';
  end if;
  if p_status in ('accepted', 'rejected')
     and char_length(btrim(coalesce(p_resolution_note, ''))) < 3 then
    raise exception 'La resolución necesita un fundamento' using errcode = 'check_violation';
  end if;

  select p.role into v_target_role
  from public.moderation_appeals a
  join public.user_suspensions s on s.id = a.suspension_id
  join public.profiles p on p.id = s.user_id
  where a.id = p_appeal;
  if not found then return false; end if;
  if v_target_role = 'admin'
     or (v_actor_role = 'moderator' and v_target_role <> 'user') then
    raise exception 'GEOUNITY_MODERATION_HIERARCHY'
      using errcode = 'insufficient_privilege';
  end if;

  update public.moderation_appeals
     set status = p_status,
         reviewed_by = v_actor,
         reviewed_at = statement_timestamp(),
         resolution_note = nullif(btrim(p_resolution_note), ''),
         updated_at = statement_timestamp()
   where id = p_appeal and status in ('pending', 'reviewing')
   returning suspension_id into v_suspension;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then return false; end if;

  if p_status = 'accepted' then
    update public.user_suspensions
       set lifted_at = statement_timestamp(), lifted_by = v_actor,
           lift_reason = 'Apelación aceptada: ' || btrim(p_resolution_note)
     where id = v_suspension and lifted_at is null;
  end if;
  return true;
end;
$$;

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `on delete set null` anonimiza al moderador cuando cierra su cuenta. Es
  -- la única mutación admisible: acción, objetivo, metadata y fecha siguen
  -- siendo inmutables durante el plazo de auditoría.
  if tg_op = 'UPDATE'
     and old.moderator_id is not null
     and new.moderator_id is null
     and (to_jsonb(new) - 'moderator_id')
       is not distinct from (to_jsonb(old) - 'moderator_id') then
    return new;
  end if;
  raise exception 'GEOUNITY_AUDIT_IMMUTABLE'
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists moderation_audit_immutable on public.moderation_audit_log;
create trigger moderation_audit_immutable
  before update or delete on public.moderation_audit_log
  for each row execute function private.reject_audit_mutation();

create or replace function private.audit_moderation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_metadata jsonb := '{}'::jsonb;
begin
  if v_actor is null or not private.session_is_moderator(v_actor) then
    return coalesce(new, old);
  end if;

  -- La auditoría registra exclusivamente estados de workflow, booleanos y
  -- enums de decisión. Nunca persiste la fila completa, UUID de personas ni
  -- texto libre (motivos, cuerpos, títulos, mensajes o descripciones).
  v_metadata := case
    when tg_table_name in (
      'reports', 'polls', 'debates', 'claims', 'projects',
      'debate_comments', 'community_requests', 'organization_requests',
      'claim_events', 'project_milestones', 'project_tasks',
      'project_contributions', 'moderation_appeals'
    ) then jsonb_strip_nulls(jsonb_build_object(
      'status_before', v_old ->> 'status',
      'status_after', v_new ->> 'status'
    ))
    when tg_table_name = 'content_sources' then jsonb_build_object(
      'verified_before', coalesce((v_old -> 'verified_at') <> 'null'::jsonb, false),
      'verified_after', coalesce((v_new -> 'verified_at') <> 'null'::jsonb, false)
    )
    when tg_table_name = 'organizations' then jsonb_build_object(
      'verified_before', coalesce((v_old -> 'verified_at') <> 'null'::jsonb, false),
      'verified_after', coalesce((v_new -> 'verified_at') <> 'null'::jsonb, false)
    )
    when tg_table_name = 'user_suspensions' then jsonb_build_object(
      'lifted_before', coalesce((v_old -> 'lifted_at') <> 'null'::jsonb, false),
      'lifted_after', coalesce((v_new -> 'lifted_at') <> 'null'::jsonb, false),
      'temporary_before', coalesce((v_old -> 'ends_at') <> 'null'::jsonb, false),
      'temporary_after', coalesce((v_new -> 'ends_at') <> 'null'::jsonb, false)
    )
    when tg_table_name = 'budget_proposals' then jsonb_build_object(
      'decision_before', case
        when v_old is null then null
        when v_old -> 'admitted_at' <> 'null'::jsonb then 'admitted'
        when v_old -> 'rejection_note' <> 'null'::jsonb then 'rejected'
        else 'pending'
      end,
      'decision_after', case
        when v_new is null then null
        when v_new -> 'admitted_at' <> 'null'::jsonb then 'admitted'
        when v_new -> 'rejection_note' <> 'null'::jsonb then 'rejected'
        else 'pending'
      end
    )
    when tg_table_name = 'organization_members' then jsonb_strip_nulls(
      jsonb_build_object(
        'role_before', v_old ->> 'role',
        'role_after', v_new ->> 'role',
        'verified_before', coalesce(
          (v_old -> 'verified_at') <> 'null'::jsonb, false
        ),
        'verified_after', coalesce(
          (v_new -> 'verified_at') <> 'null'::jsonb, false
        )
      )
    )
    else '{}'::jsonb
  end;

  insert into public.moderation_audit_log (
    moderator_id, action, target_type, target_id, metadata
  ) values (
    v_actor,
    lower(tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    jsonb_strip_nulls(v_metadata)
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Contadores transaccionales para abuso. Una excepción revierte también el
-- consumo de la ventana, de modo que los intentos fallidos no queman cuota.
-- -----------------------------------------------------------------------------
create table if not exists private.abuse_windows (
  scope text not null,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null,
  hits integer not null,
  primary key (scope, actor_id, window_started_at),
  constraint abuse_windows_hits_chk check (hits > 0)
);

create table if not exists private.write_cooldowns (
  scope text not null,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  next_allowed_at timestamptz not null,
  primary key (scope, actor_id)
);

create or replace function private.consume_window_limit(
  p_scope text,
  p_actor uuid,
  p_max integer,
  p_window interval
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := date_bin(p_window, clock_timestamp(), timestamptz '2000-01-01 00:00:00+00');
  v_hits integer;
begin
  insert into private.abuse_windows (scope, actor_id, window_started_at, hits)
  values (p_scope, p_actor, v_start, 1)
  on conflict (scope, actor_id, window_started_at) do update
    set hits = private.abuse_windows.hits + 1
    where private.abuse_windows.hits < p_max
  returning hits into v_hits;

  if v_hits is null then
    raise exception 'GEOUNITY_RATE_LIMIT:%', p_scope
      using errcode = 'program_limit_exceeded';
  end if;
end;
$$;

create or replace function private.consume_cooldown(
  p_scope text,
  p_actor uuid,
  p_wait interval
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_until timestamptz;
begin
  insert into private.write_cooldowns (scope, actor_id, next_allowed_at)
  values (p_scope, p_actor, clock_timestamp() + p_wait)
  on conflict (scope, actor_id) do update
    set next_allowed_at = clock_timestamp() + p_wait
    where private.write_cooldowns.next_allowed_at <= clock_timestamp()
  returning next_allowed_at into v_until;

  if v_until is null then
    raise exception 'GEOUNITY_RATE_LIMIT:%', p_scope
      using errcode = 'program_limit_exceeded';
  end if;
end;
$$;

-- Proyección propia y minimizada de vínculos donde la cuenta actuó como
-- moderadora/operadora. No devuelve cuerpos, metadata de auditoría ni UUID de
-- otras personas. Mantenerla en una RPC evita decenas de lecturas service_role
-- y hace que el filtro por auth.uid() sea parte del contrato de base.
create or replace function public.export_my_linked_activity()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_max_rows constant integer := 5000;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.consume_cooldown('data-export', v_user, interval '5 minutes');

  return jsonb_build_object(
    'budget_proposals_for_own_projects', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'budget_id', bp.budget_id,
        'project_id', bp.project_id,
        'requested_amount', bp.requested_amount,
        'admitted_at', bp.admitted_at,
        'rejection_note', bp.rejection_note,
        'created_at', bp.created_at
      ) order by bp.created_at, bp.id), '[]'::jsonb)
      from (
        select bp.id, bp.budget_id, bp.project_id, bp.requested_amount,
          bp.admitted_at, bp.rejection_note, bp.created_at
        from public.budget_proposals bp
        join public.projects p on p.id = bp.project_id
        where p.author_id = v_user
        order by bp.created_at, bp.id
        limit v_max_rows
      ) bp
    ),
    'budget_reviews', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'decision', case
          when bp.admitted_at is not null then 'admitted'
          else 'rejected'
        end,
        'admitted_at', bp.admitted_at
      ) order by bp.id), '[]'::jsonb)
      from (
        select bp.id, bp.admitted_at
        from public.budget_proposals bp
        where bp.admitted_by = v_user
        order by bp.id
        limit v_max_rows
      ) bp
    ),
    'content_removals', (
      select coalesce(jsonb_agg(to_jsonb(r)
        order by r.removed_at, r.content_type, r.id), '[]'::jsonb)
      from (
        select 'poll'::text as content_type, id, removed_at
          from public.polls where removed_by = v_user
        union all
        select 'debate'::text, id, removed_at
          from public.debates where removed_by = v_user
        union all
        select 'claim'::text, id, removed_at
          from public.claims where removed_by = v_user
        union all
        select 'project'::text, id, removed_at
          from public.projects where removed_by = v_user
        order by removed_at, content_type, id
        limit v_max_rows
      ) r
    ),
    'community_request_reviews', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'reviewed_at', r.reviewed_at
      ) order by r.reviewed_at, r.id), '[]'::jsonb)
      from (
        select r.id, r.status, r.reviewed_at
        from public.community_requests r where r.reviewed_by = v_user
        order by r.reviewed_at, r.id
        limit v_max_rows
      ) r
    ),
    'organization_request_reviews', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'reviewed_at', r.reviewed_at
      ) order by r.reviewed_at, r.id), '[]'::jsonb)
      from (
        select r.id, r.status, r.reviewed_at
        from public.organization_requests r where r.reviewed_by = v_user
        order by r.reviewed_at, r.id
        limit v_max_rows
      ) r
    ),
    'organization_verifications', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'verified_at', o.verified_at
      ) order by o.verified_at, o.id), '[]'::jsonb)
      from (
        select o.id, o.verified_at
        from public.organizations o where o.verified_by = v_user
        order by o.verified_at, o.id
        limit v_max_rows
      ) o
    ),
    'organization_memberships_added', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'organization_id', m.organization_id,
        'role', m.role,
        'verified_at', m.verified_at
      ) order by m.verified_at, m.organization_id), '[]'::jsonb)
      from (
        select m.organization_id, m.role, m.verified_at
        from public.organization_members m where m.added_by = v_user
        order by m.verified_at, m.organization_id
        limit v_max_rows
      ) m
    ),
    'report_resolutions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'resolved_at', r.resolved_at
      ) order by r.resolved_at, r.id), '[]'::jsonb)
      from (
        select r.id, r.status, r.resolved_at
        from public.reports r where r.resolved_by = v_user
        order by r.resolved_at, r.id
        limit v_max_rows
      ) r
    ),
    'notifications_as_actor', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', n.type,
        'entity_type', n.entity_type,
        'entity_id', n.entity_id,
        'created_at', n.created_at
      ) order by n.created_at, n.id), '[]'::jsonb)
      from (
        select n.id, n.type, n.entity_type, n.entity_id, n.created_at
        from public.notifications n where n.actor_id = v_user
        order by n.created_at, n.id
        limit v_max_rows
      ) n
    ),
    'suspensions_created', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'created_at', s.created_at
      ) order by s.created_at, s.id), '[]'::jsonb)
      from (
        select s.id, s.starts_at, s.ends_at, s.created_at
        from public.user_suspensions s where s.created_by = v_user
        order by s.created_at, s.id
        limit v_max_rows
      ) s
    ),
    'suspensions_lifted', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'lifted_at', s.lifted_at
      ) order by s.lifted_at, s.id), '[]'::jsonb)
      from (
        select s.id, s.lifted_at
        from public.user_suspensions s where s.lifted_by = v_user
        order by s.lifted_at, s.id
        limit v_max_rows
      ) s
    ),
    'appeal_reviews', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id, 'status', a.status, 'reviewed_at', a.reviewed_at
      ) order by a.reviewed_at, a.id), '[]'::jsonb)
      from (
        select a.id, a.status, a.reviewed_at
        from public.moderation_appeals a where a.reviewed_by = v_user
        order by a.reviewed_at, a.id
        limit v_max_rows
      ) a
    ),
    'moderation_actions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'action', a.action,
        'target_type', a.target_type,
        'created_at', a.created_at
      ) order by a.id), '[]'::jsonb)
      from (
        select a.id, a.action, a.target_type, a.created_at
        from public.moderation_audit_log a where a.moderator_id = v_user
        order by a.id
        limit v_max_rows
      ) a
    ),
    'operational_security', jsonb_build_object(
      'abuse_windows', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'scope', w.scope,
          'window_started_at', w.window_started_at,
          'hits', w.hits
        ) order by w.scope, w.window_started_at), '[]'::jsonb)
        from (
          select w.scope, w.window_started_at, w.hits
          from private.abuse_windows w where w.actor_id = v_user
          order by w.scope, w.window_started_at
          limit v_max_rows
        ) w
      ),
      'write_cooldowns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'scope', c.scope, 'next_allowed_at', c.next_allowed_at
        ) order by c.scope), '[]'::jsonb)
        from (
          select c.scope, c.next_allowed_at
          from private.write_cooldowns c where c.actor_id = v_user
          order by c.scope
          limit v_max_rows
        ) c
      )
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Los helpers históricos con p_user quedan ligados a la identidad del JWT.
-- Conservan firma para no romper policies ni clientes existentes, pero ya no
-- sirven como oráculos sobre terceros.
-- -----------------------------------------------------------------------------
create or replace function public.is_member(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and private.raw_is_member(p_user, p_community),
    false
  );
$$;

create or replace function public.is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and private.session_is_moderator(p_user),
    false
  );
$$;

create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1 from public.profiles p where p.id = p_user and p.role = 'admin'
    ),
    false
  );
$$;

create or replace function public.content_exists(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.raw_content_exists(p_type, p_id);
$$;

create or replace function public.content_author(p_type text, p_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.raw_content_author(p_type, p_id);
$$;

create or replace function public.can_manage_content(
  p_user uuid,
  p_type text,
  p_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and p_user is not null
    and (
      private.session_is_moderator(p_user)
      or private.raw_content_author(p_type, p_id) = p_user
    ),
    false
  );
$$;

create or replace function public.is_verified_org_member(p_user uuid, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and private.raw_is_verified_org_member(p_user, p_org),
    false
  );
$$;

create or replace function public.can_update_claim_as_org(p_user uuid, p_claim uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and exists (
      select 1
      from public.claims c
      where c.id = p_claim
        and c.responsible_organization_id is not null
        and private.raw_is_verified_org_member(
          p_user, c.responsible_organization_id
        )
    ),
    false
  );
$$;

create or replace function public.my_community_visibility(
  p_user uuid,
  p_community uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'GEOUNITY_SELF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select cv.is_anonymous
    from public.community_visibility cv
    where cv.user_id = p_user and cv.community_id = p_community
  ), false);
end;
$$;

-- Este helper ya no es RPC pública, pero los triggers de cuota y
-- quota_summary lo siguen usando. La exención de cuota moderadora también exige
-- una sesión AAL2. Las cargas internas sin JWT siguen omitiendo la cuota en el
-- trigger, antes de llegar a este helper.
create or replace function public.quota_remaining(
  p_user uuid,
  p_level smallint,
  p_content_type text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_table text; v_limit integer; v_used integer;
begin
  if p_user is null then return 0; end if;
  if private.session_is_moderator(p_user) then return null; end if;

  v_table := case p_content_type
    when 'poll' then 'polls'
    when 'debate' then 'debates'
    when 'claim' then 'claims'
    when 'project' then 'projects'
  end;
  if v_table is null then
    raise exception 'Tipo de contenido desconocido: %', p_content_type;
  end if;

  select q.monthly_limit into v_limit
  from public.content_quotas q
  where q.level = p_level and q.content_type = p_content_type;
  if v_limit is null then return null; end if;

  execute format($query$
    select count(*)
    from public.%I t
    join public.communities c on c.id = t.community_id
    where t.author_id = $1
      and c.level = $2
      and t.created_at >= date_trunc('month', now())
      and t.created_at < date_trunc('month', now()) + interval '1 month'
      and (
        t.status <> 'removed'
        or (t.removed_by = t.author_id
          and t.removed_at > t.created_at + interval '24 hours')
      )
  $query$, v_table)
  into v_used using p_user, p_level;
  return greatest(0, v_limit - v_used);
end;
$$;

create or replace function public.quota_summary(p_user uuid)
returns table (
  level smallint,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  content_type text,
  monthly_limit int,
  remaining int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'GEOUNITY_SELF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    c.level,
    c.id,
    c.slug,
    c.name,
    c.emoji,
    q.content_type,
    case when private.session_is_moderator(p_user) then null else cq.monthly_limit end,
    public.quota_remaining(p_user, c.level, q.content_type)
  from public.profiles pr
  join public.communities home on home.id = pr.home_community_id
  join public.communities c
    on home.path = c.path or home.path like c.path || '.%'
  cross join (
    select distinct cq0.content_type from public.content_quotas cq0
  ) q
  left join public.content_quotas cq
    on cq.level = c.level and cq.content_type = q.content_type
  where pr.id = p_user
  order by c.level asc, q.content_type asc;
end;
$$;

create or replace function public.can_vote_budget(p_user uuid, p_budget uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_user is distinct from auth.uid() then
    raise exception 'GEOUNITY_SELF_ONLY'
      using errcode = 'insufficient_privilege';
  end if;
  return exists (
    select 1
    from public.community_budgets b
    join public.profiles p on p.id = p_user
    where b.id = p_budget
      and private.raw_is_member(p_user, b.community_id)
      and coalesce(p.residence_changed_at, p.created_at) < b.voting_opens_at
  );
end;
$$;

-- Policies que antes llamaban content_exists siguen validando el target sin
-- necesitar exponer ese helper como RPC.
drop policy if exists institutional_responses_insert_verified
  on public.institutional_responses;
create policy institutional_responses_insert_verified
  on public.institutional_responses for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_verified_org_member(auth.uid(), organization_id)
    and case content_type
      when 'poll' then exists (
        select 1 from public.polls p where p.id = content_id and p.status <> 'removed')
      when 'debate' then exists (
        select 1 from public.debates d where d.id = content_id and d.status <> 'removed')
      when 'claim' then exists (
        select 1 from public.claims c where c.id = content_id and c.status <> 'removed')
      when 'project' then exists (
        select 1 from public.projects p where p.id = content_id and p.status <> 'removed')
      else false
    end
  );

-- -----------------------------------------------------------------------------
-- Gate genérico de participación. No se instala sobre tablas de lectura,
-- aceptación legal, apelaciones o notificaciones. DELETE queda permitido para
-- que una suspensión no impida retirar contenido/datos propios.
-- -----------------------------------------------------------------------------
create or replace function private.guard_participation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Ocultar contenido propio es una forma de borrado y debe seguir disponible.
  if tg_op = 'UPDATE'
     and tg_table_name in ('polls', 'debates', 'claims', 'projects')
     and to_jsonb(new) ->> 'status' = 'removed'
     and to_jsonb(old) ->> 'author_id' = v_actor::text then
    return new;
  end if;

  perform private.assert_can_participate(v_actor);
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'follows', 'community_visibility', 'poll_votes', 'debate_comments',
    'comment_votes', 'claims', 'claim_supports', 'debates', 'polls',
    'projects', 'project_pledges', 'project_comments', 'reports',
    'content_sources', 'institutional_responses', 'claim_events',
    'project_milestones', 'project_tasks', 'project_contributions',
    'community_requests', 'organization_requests', 'content_relations',
    'community_budgets', 'budget_proposals', 'budget_votes', 'budget_reports',
    'claim_uploads'
  ] loop
    execute format('drop trigger if exists aa_participation_gate on public.%I', v_table);
    execute format(
      'create trigger aa_participation_gate before insert or update on public.%I '
      'for each row execute function private.guard_participation()',
      v_table
    );
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Retención operativa. Las aceptaciones vigentes nunca se purgan; una versión
-- histórica sólo vence si existe una aceptación posterior del mismo documento.
-- La baja de cuenta conserva el comportamiento existente (ON DELETE CASCADE).
-- -----------------------------------------------------------------------------
create table if not exists public.data_retention_policies (
  dataset text primary key,
  retention_days integer not null,
  rationale text not null,
  purge_on_account_deletion boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint data_retention_days_chk check (retention_days between 1 and 36500)
);

insert into public.data_retention_policies (
  dataset, retention_days, rationale, purge_on_account_deletion
) values
  ('activation_events', 90, 'Telemetría cruda de activación; sólo tendencias recientes.', true),
  ('abuse_windows', 7, 'Contadores técnicos de ventanas ya vencidas.', true),
  ('write_cooldowns', 1, 'Cooldowns técnicos vencidos; no tienen valor histórico.', true),
  ('moderation_audit_log', 2555, 'Trazabilidad de moderación: siete años.', false),
  ('moderation_appeals', 2555, 'Apelaciones terminales: siete años desde su cierre.', true),
  ('user_suspensions', 2555, 'Suspensiones levantadas o vencidas: siete años.', true),
  ('unconfirmed_accounts', 30, 'Altas de email nunca confirmadas y sin actividad.', true),
  ('user_legal_acceptances', 1825, 'Prueba histórica de consentimiento: cinco años.', true)
on conflict (dataset) do update set
  retention_days = excluded.retention_days,
  rationale = excluded.rationale,
  purge_on_account_deletion = excluded.purge_on_account_deletion,
  updated_at = now();

alter table public.data_retention_policies enable row level security;
drop policy if exists data_retention_policies_select_all
  on public.data_retention_policies;
create policy data_retention_policies_select_all
  on public.data_retention_policies for select using (true);
grant select on public.data_retention_policies to anon, authenticated;
grant all on public.data_retention_policies to service_role;

-- Una aceptación legal se registra durante el alta y, por sí sola, no convierte
-- una cuenta que nunca confirmó su email en una cuenta activa. Cualquier otro
-- vínculo cívico, editorial, operativo o de moderación impide el borrado
-- automático y deriva el caso a revisión manual.
create or replace function private.account_has_real_activity(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = p_user and (
        p.home_community_id is not null
        or p.residence_changed_at is not null
        or p.avatar_url is not null
        or p.bio is not null
        or p.verification_level <> 0
        or p.role <> 'user'
      )
    )
    or exists (select 1 from public.follows x where x.user_id = p_user)
    or exists (select 1 from public.community_visibility x where x.user_id = p_user)
    or exists (select 1 from public.poll_votes x where x.user_id = p_user)
    or exists (select 1 from public.comment_votes x where x.user_id = p_user)
    or exists (select 1 from public.claim_supports x where x.user_id = p_user)
    or exists (select 1 from public.project_pledges x where x.user_id = p_user)
    or exists (select 1 from public.budget_votes x where x.user_id = p_user)
    or exists (select 1 from public.claim_uploads x where x.owner_id = p_user)
    or exists (
      select 1 from storage.objects x
      where x.owner = p_user or x.owner_id = p_user::text
    )
    or exists (select 1 from public.debate_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_comments x where x.user_id = p_user)
    or exists (select 1 from public.project_contributions x where x.user_id = p_user)
    or exists (select 1 from public.organization_members x where x.user_id = p_user)
    or exists (select 1 from public.community_requests x where x.user_id = p_user)
    or exists (select 1 from public.organization_requests x where x.user_id = p_user)
    or exists (select 1 from public.notifications x where x.recipient_id = p_user)
    or exists (select 1 from public.reports x where x.reporter_id = p_user)
    -- `signup` se crea automáticamente junto con profiles y no demuestra uso.
    or exists (
      select 1 from public.activation_events x
      where x.user_id = p_user and x.event <> 'signup'
    )
    or exists (select 1 from public.ai_summary_generation_events x where x.requested_by = p_user)
    or exists (select 1 from public.ai_summary_generation_jobs x where x.requested_by = p_user)
    or exists (select 1 from public.polls x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.debates x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.claims x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.projects x where x.author_id = p_user or x.removed_by = p_user)
    or exists (select 1 from public.community_info x where x.updated_by = p_user)
    or exists (select 1 from public.community_budgets x where x.created_by = p_user)
    or exists (select 1 from public.budget_proposals x where x.admitted_by = p_user)
    or exists (select 1 from public.budget_reports x where x.author_id = p_user)
    or exists (select 1 from public.claim_events x where x.actor_id = p_user)
    or exists (select 1 from public.content_sources x where x.added_by = p_user)
    or exists (select 1 from public.content_relations x where x.created_by = p_user)
    or exists (select 1 from public.institutional_responses x where x.author_id = p_user)
    or exists (select 1 from public.notifications x where x.actor_id = p_user)
    or exists (select 1 from public.organizations x where x.verified_by = p_user)
    or exists (select 1 from public.organization_members x where x.added_by = p_user)
    or exists (select 1 from public.community_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.organization_requests x where x.reviewed_by = p_user)
    or exists (select 1 from public.project_tasks x where x.assigned_user_id = p_user)
    or exists (select 1 from public.reports x where x.resolved_by = p_user)
    or exists (
      select 1 from public.user_suspensions x
      where x.user_id = p_user or x.created_by = p_user or x.lifted_by = p_user
    )
    or exists (
      select 1 from public.moderation_appeals x
      where x.appellant_id = p_user or x.reviewed_by = p_user
    )
    or exists (select 1 from public.moderation_audit_log x where x.moderator_id = p_user);
$$;

create or replace function private.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.moderator_id is not null
     and new.moderator_id is null
     and (to_jsonb(new) - 'moderator_id')
       is not distinct from (to_jsonb(old) - 'moderator_id') then
    return new;
  end if;
  if auth.uid() is null
     and current_setting('geounity.retention_purge', true) = 'on' then
    return old;
  end if;
  raise exception 'GEOUNITY_AUDIT_IMMUTABLE'
    using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.purge_expired_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_activation integer;
  v_windows integer;
  v_cooldowns integer;
  v_audit integer;
  v_appeals integer;
  v_suspensions integer;
  v_unconfirmed integer;
  v_legal integer;
begin
  perform set_config('geounity.retention_purge', 'on', true);

  delete from public.activation_events e
   where e.created_at < now() - interval '90 days';
  get diagnostics v_activation = row_count;

  delete from private.abuse_windows w
   where w.window_started_at < now() - interval '7 days';
  get diagnostics v_windows = row_count;

  delete from private.write_cooldowns c
   where c.next_allowed_at < now() - interval '1 day';
  get diagnostics v_cooldowns = row_count;

  delete from public.moderation_audit_log a
   where a.created_at < now() - interval '2555 days';
  get diagnostics v_audit = row_count;

  -- Las apelaciones se eliminan primero porque la suspensión que las contiene
  -- conserva una FK RESTRICT. Un caso pendiente/revisando mantiene también su
  -- suspensión, aunque ésta ya haya vencido.
  delete from public.moderation_appeals a
   where a.status in ('accepted', 'rejected', 'withdrawn')
     and a.updated_at < now() - interval '2555 days';
  get diagnostics v_appeals = row_count;

  delete from public.user_suspensions s
   where (
       (s.lifted_at is not null
         and s.lifted_at < now() - interval '2555 days')
       or
       (s.lifted_at is null and s.ends_at is not null
         and s.ends_at < now() - interval '2555 days')
     )
     and not exists (
       select 1 from public.moderation_appeals a
       where a.suspension_id = s.id
     );
  get diagnostics v_suspensions = row_count;

  delete from public.user_legal_acceptances a
   where a.accepted_at < now() - interval '1825 days'
     and not exists (
       select 1 from public.legal_document_versions d
       where d.document_type = a.document_type
         and d.version = a.version and d.is_current
     )
     and exists (
       select 1 from public.user_legal_acceptances newer
       where newer.user_id = a.user_id
         and newer.document_type = a.document_type
         and newer.accepted_at > a.accepted_at
     );
  get diagnostics v_legal = row_count;

  -- `auth.users` es la raíz canónica que usa admin.deleteUser; sus cascadas
  -- eliminan profile y aceptaciones. Se limita el lote para acotar locks y se
  -- excluye cualquier señal de confirmación, identidad externa o actividad.
  with candidates as (
    select u.id
    from auth.users u
    where u.created_at < now() - interval '30 days'
      and u.email_confirmed_at is null
      and u.phone_confirmed_at is null
      and u.last_sign_in_at is null
      and u.invited_at is null
      and u.deleted_at is null
      and not coalesce(u.is_sso_user, false)
      and not coalesce(u.is_anonymous, false)
      and not exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider <> 'email'
      )
      and not private.account_has_real_activity(u.id)
    order by u.created_at, u.id
    limit 1000
  ), deleted as (
    delete from auth.users u
    using candidates c
    where u.id = c.id
    returning u.id
  )
  select count(*) into v_unconfirmed from deleted;

  perform set_config('geounity.retention_purge', 'off', true);
  return jsonb_build_object(
    'activation_events', v_activation,
    'abuse_windows', v_windows,
    'write_cooldowns', v_cooldowns,
    'moderation_audit_log', v_audit,
    'moderation_appeals', v_appeals,
    'user_suspensions', v_suspensions,
    'unconfirmed_accounts', v_unconfirmed,
    'user_legal_acceptances', v_legal
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Búsqueda: el motor histórico queda privado y una fachada valida/escapa todos
-- los parámetros. El backslash es el escape por defecto de LIKE en PostgreSQL.
-- -----------------------------------------------------------------------------
alter function public.global_search(text, text, uuid, text, integer, integer)
  set schema private;

create function public.global_search(
  p_query text,
  p_kind text default null,
  p_community uuid default null,
  p_status text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  kind text,
  id uuid,
  title text,
  summary text,
  status text,
  community_id uuid,
  community_slug text,
  community_name text,
  community_emoji text,
  href text,
  created_at timestamptz,
  rank integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_query text;
begin
  if p_query is null
     or char_length(btrim(p_query)) < 3
     or char_length(btrim(p_query)) > 100 then
    return;
  end if;
  if p_kind is not null
     and p_kind not in ('community', 'poll', 'debate', 'claim', 'project', 'institution') then
    return;
  end if;
  -- Primero se escapa el propio escape, después los dos comodines de LIKE.
  v_query := replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_');
  return query
  select *
  from private.global_search(
    v_query,
    p_kind,
    p_community,
    nullif(p_status, ''),
    least(greatest(coalesce(p_limit, 24), 1), 50),
    least(greatest(coalesce(p_offset, 0), 0), 500)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- ACL cerrada. También se revocan funciones security-invoker: las únicas RPC
-- alcanzables son la matriz que consume la app y los contratos nuevos de esta
-- migración. Las funciones de trigger continúan ejecutándose por el trigger.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public
  from public, anon, authenticated, service_role;
revoke execute on all functions in schema private
  from public, anon, authenticated, service_role;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

-- Lecturas públicas usadas por la aplicación.
grant execute on function public.budget_results(uuid) to anon, authenticated;
grant execute on function public.can_see_poll_results(uuid) to anon, authenticated;
grant execute on function public.community_member_visibility_counts(uuid)
  to anon, authenticated;
grant execute on function public.community_public_members(uuid, text, integer)
  to anon, authenticated;
grant execute on function public.debate_column_comments(uuid, integer)
  to anon, authenticated;
grant execute on function public.debate_column_counts(uuid)
  to anon, authenticated;
grant execute on function public.global_search(text, text, uuid, text, integer, integer)
  to anon, authenticated;
grant execute on function public.poll_feed(uuid, integer, timestamptz, uuid, text)
  to anon, authenticated;
grant execute on function public.poll_option_anonymous_counts(uuid)
  to anon, authenticated;
grant execute on function public.poll_option_voters(uuid) to anon, authenticated;
grant execute on function public.poll_results(uuid) to anon, authenticated;
grant execute on function public.poll_results_by_child(uuid) to anon, authenticated;
grant execute on function public.poll_stats(uuid) to anon, authenticated;
grant execute on function public.public_profile(uuid) to anon, authenticated;
grant execute on function public.public_profiles(uuid[]) to anon, authenticated;
grant execute on function public.sibling_claim_profile(uuid) to anon, authenticated;
grant execute on function public.sibling_poll_contrast(uuid, integer)
  to anon, authenticated;

-- Mutaciones/lecturas ligadas a la sesión.
grant execute on function public.add_claim_event_with_status(
  uuid, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.approve_community_request(
  uuid, uuid, text, text, text, double precision, double precision, text
) to authenticated;
grant execute on function public.approve_organization_request(uuid, text)
  to authenticated;
grant execute on function public.can_correct_residence(uuid) to authenticated;
grant execute on function public.can_vote_budget(uuid, uuid) to authenticated;
grant execute on function public.create_poll_with_options(
  uuid, text, text, text, text, smallint, text, text, text[]
) to authenticated;
grant execute on function public.create_project_with_relation(
  uuid, text, text, text, numeric, text, text, text, text
) to authenticated;
grant execute on function public.my_community_visibility(uuid, uuid)
  to authenticated;
grant execute on function public.personalized_feed(
  uuid, integer, timestamptz, uuid
) to authenticated;
grant execute on function public.quota_summary(uuid) to authenticated;
grant execute on function public.record_activation_visit() to authenticated;
grant execute on function public.remove_own_content(text, uuid) to authenticated;
grant execute on function public.replace_budget_vote(uuid, jsonb) to authenticated;

-- Helpers estrictamente ligados a auth.uid() requeridos por policies/índices.
grant execute on function public.is_member(uuid, uuid) to authenticated;
grant execute on function public.is_moderator(uuid) to anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.can_manage_content(uuid, text, uuid)
  to authenticated;
grant execute on function public.is_verified_org_member(uuid, uuid)
  to authenticated;
grant execute on function public.can_update_claim_as_org(uuid, uuid)
  to authenticated;
grant execute on function public.budget_phase(uuid) to authenticated;
grant execute on function public.search_normalize(text) to authenticated;

-- Contratos de consentimiento, suspensión y Storage de la sesión.
grant execute on function public.can_participate() to authenticated;
grant execute on function public.is_user_suspended() to authenticated;
grant execute on function public.export_my_linked_activity() to authenticated;
grant execute on function public.accept_current_legal(boolean) to authenticated;
grant execute on function public.my_legal_status() to authenticated;
grant execute on function public.suspend_user(uuid, text, timestamptz)
  to authenticated;
grant execute on function public.lift_user_suspension(uuid, text)
  to authenticated;
grant execute on function public.submit_suspension_appeal(uuid, text)
  to authenticated;
grant execute on function public.withdraw_moderation_appeal(uuid)
  to authenticated;
grant execute on function public.review_moderation_appeal(uuid, text, text)
  to authenticated;

-- Jobs de backend. sync_due conserva authenticated porque hoy la pantalla de
-- notificaciones lo invoca; la función no acepta datos controlados por usuario.
grant execute on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) to service_role;
grant execute on function public.complete_ai_summary_generation(
  text, uuid, text, text, uuid, text, jsonb, integer, text, boolean
) to service_role;
grant execute on function public.fail_ai_summary_generation(uuid, text)
  to service_role;
grant execute on function public.escalate_silent_claims() to service_role;
grant execute on function public.sync_due_poll_notifications()
  to authenticated, service_role;
grant execute on function public.can_see_poll_results(uuid, uuid)
  to service_role;
grant execute on function public.purge_expired_operational_data()
  to service_role;
grant execute on function public.record_signup_legal_acceptance(uuid, boolean)
  to service_role;

-- -----------------------------------------------------------------------------
-- Tareas y aportes: identidad inmutable y transiciones explícitas.
-- -----------------------------------------------------------------------------
drop policy if exists project_tasks_manage on public.project_tasks;
drop policy if exists project_tasks_insert_manager on public.project_tasks;
drop policy if exists project_tasks_update_manager_or_assignee on public.project_tasks;
create policy project_tasks_insert_manager
  on public.project_tasks for insert to authenticated
  with check (public.can_manage_content(auth.uid(), 'project', project_id));
create policy project_tasks_update_manager_or_assignee
  on public.project_tasks for update to authenticated
  using (
    public.can_manage_content(auth.uid(), 'project', project_id)
    or assigned_user_id = auth.uid()
  )
  with check (
    public.can_manage_content(auth.uid(), 'project', project_id)
    or assigned_user_id = auth.uid()
  );

drop policy if exists project_contributions_update_own_or_manager
  on public.project_contributions;
drop policy if exists project_contributions_update_manager
  on public.project_contributions;
create policy project_contributions_update_manager
  on public.project_contributions for update to authenticated
  using (public.can_manage_content(auth.uid(), 'project', project_id))
  with check (public.can_manage_content(auth.uid(), 'project', project_id));

drop policy if exists project_contributions_insert_member
  on public.project_contributions;
create policy project_contributions_insert_member
  on public.project_contributions for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'offered'
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.status in ('proposal', 'funding', 'in_progress')
        and public.is_member(auth.uid(), p.community_id)
    )
  );

create or replace function private.guard_project_task_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_manager boolean;
begin
  if v_actor is null then return new; end if;
  v_manager := private.session_is_moderator(v_actor)
    or private.raw_content_author('project', old.project_id) = v_actor;
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.milestone_id is distinct from old.milestone_id
     or new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.assigned_user_id is distinct from old.assigned_user_id
     or new.assigned_organization_id is distinct from old.assigned_organization_id
     or new.skills_needed is distinct from old.skills_needed
     or new.due_date is distinct from old.due_date
     or new.created_at is distinct from old.created_at then
    raise exception 'GEOUNITY_TASK_FIELDS_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;
  if not (v_manager or old.assigned_user_id = v_actor) then
    raise exception 'No podés actualizar esa tarea'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'open' and new.status in ('in_progress', 'blocked'))
    or (old.status = 'in_progress' and new.status in ('completed', 'blocked'))
    or (old.status = 'blocked' and new.status in ('open', 'in_progress'))
  ) then
    raise exception 'GEOUNITY_INVALID_TASK_TRANSITION'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ab_project_tasks_update_guard on public.project_tasks;
create trigger ab_project_tasks_update_guard
  before update on public.project_tasks
  for each row execute function private.guard_project_task_update();

create or replace function private.guard_project_contribution_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_manager boolean;
begin
  if v_actor is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id is distinct from v_actor or new.status <> 'offered' then
      raise exception 'GEOUNITY_INVALID_CONTRIBUTION_OWNER'
        using errcode = 'insufficient_privilege';
    end if;
    new.created_at := statement_timestamp();
    new.updated_at := new.created_at;
    return new;
  end if;

  v_manager := private.session_is_moderator(v_actor)
    or private.raw_content_author('project', old.project_id) = v_actor;
  if not v_manager then
    raise exception 'Sólo quien gestiona el proyecto revisa aportes'
      using errcode = 'insufficient_privilege';
  end if;
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.description is distinct from old.description
     or new.quantity is distinct from old.quantity
     or new.unit is distinct from old.unit
     or new.created_at is distinct from old.created_at then
    raise exception 'GEOUNITY_CONTRIBUTION_FIELDS_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
    (old.status = 'offered' and new.status in ('accepted', 'declined'))
    or (old.status = 'accepted' and new.status in ('completed', 'declined'))
  ) then
    raise exception 'GEOUNITY_INVALID_CONTRIBUTION_TRANSITION'
      using errcode = 'check_violation';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists ab_project_contributions_guard
  on public.project_contributions;
create trigger ab_project_contributions_guard
  before insert or update on public.project_contributions
  for each row execute function private.guard_project_contribution_write();

-- -----------------------------------------------------------------------------
-- Reportes, solicitudes y tracking de uploads: targets reales y ventanas duras.
-- -----------------------------------------------------------------------------
create or replace function private.guard_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_exists boolean;
begin
  if v_actor is null then return new; end if;
  if new.reporter_id is distinct from v_actor or new.status <> 'pending' then
    raise exception 'GEOUNITY_INVALID_REPORTER'
      using errcode = 'insufficient_privilege';
  end if;
  v_exists := case new.target_type
    when 'debate_comment' then exists (
      select 1 from public.debate_comments c
      where c.id = new.target_id and c.status = 'visible')
    else private.raw_content_exists(new.target_type, new.target_id)
  end;
  if not coalesce(v_exists, false) then
    raise exception 'GEOUNITY_REPORT_TARGET_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;
  perform private.consume_window_limit('reports-hour', v_actor, 10, interval '1 hour');
  perform private.consume_window_limit('reports-day', v_actor, 30, interval '1 day');
  new.created_at := statement_timestamp();
  new.resolved_by := null;
  new.resolved_at := null;
  return new;
end;
$$;

drop trigger if exists ab_reports_validate on public.reports;
create trigger ab_reports_validate
  before insert on public.reports
  for each row execute function private.guard_report_insert();

create or replace function private.guard_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_pending integer;
begin
  if v_actor is null then return new; end if;
  if new.user_id is distinct from v_actor or new.status <> 'pending' then
    raise exception 'GEOUNITY_INVALID_REQUEST_OWNER'
      using errcode = 'insufficient_privilege';
  end if;
  execute format(
    'select count(*) from public.%I where user_id = $1 and status = ''pending''',
    tg_table_name
  ) into v_pending using v_actor;
  if v_pending >= 3 then
    raise exception 'GEOUNITY_TOO_MANY_PENDING_REQUESTS'
      using errcode = 'program_limit_exceeded';
  end if;
  perform private.consume_window_limit(
    tg_table_name || '-day', v_actor, 3, interval '1 day'
  );
  new.created_at := statement_timestamp();
  new.reviewed_by := null;
  new.reviewed_at := null;
  return new;
end;
$$;

drop trigger if exists ab_community_requests_validate on public.community_requests;
create trigger ab_community_requests_validate
  before insert on public.community_requests
  for each row execute function private.guard_request_insert();
drop trigger if exists ab_organization_requests_validate on public.organization_requests;
create trigger ab_organization_requests_validate
  before insert on public.organization_requests
  for each row execute function private.guard_request_insert();

create or replace function private.guard_request_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_allowed boolean := false;
begin
  if v_actor is null then return new; end if;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_table_name = 'community_requests' then
    if (to_jsonb(new) - array[
          'status', 'parent_community_id', 'resolution_note',
          'created_community_id', 'reviewed_by', 'reviewed_at'
        ]) is distinct from
       (to_jsonb(old) - array[
          'status', 'parent_community_id', 'resolution_note',
          'created_community_id', 'reviewed_by', 'reviewed_at'
        ]) then
      raise exception 'GEOUNITY_REQUEST_FIELDS_IMMUTABLE'
        using errcode = 'insufficient_privilege';
    end if;
    v_allowed :=
      (old.status = 'pending' and new.status in (
        'reviewing', 'approved', 'rejected', 'duplicate'
      )) or
      (old.status = 'reviewing' and new.status in (
        'approved', 'rejected', 'duplicate'
      ));
    if new.status = 'approved' and not exists (
      select 1 from public.communities c
      where c.id = new.created_community_id
        and c.name = old.requested_name
        and c.parent_id is not distinct from new.parent_community_id
    ) then
      raise exception 'GEOUNITY_APPROVED_COMMUNITY_REQUIRED'
        using errcode = 'foreign_key_violation';
    end if;
  else
    if (to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at'])
         is distinct from
       (to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at']) then
      raise exception 'GEOUNITY_REQUEST_FIELDS_IMMUTABLE'
        using errcode = 'insufficient_privilege';
    end if;
    v_allowed := old.status = 'pending'
      and new.status in ('approved', 'rejected');
    if new.status = 'approved' and not exists (
      select 1
      from public.organizations o
      join public.organization_members m on m.organization_id = o.id
      where m.user_id = old.user_id
        and o.name = old.name
        and o.community_id is not distinct from old.community_id
        and o.verified_at is not null
    ) then
      raise exception 'GEOUNITY_APPROVED_ORGANIZATION_REQUIRED'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  if new.status is not distinct from old.status or not v_allowed then
    raise exception 'GEOUNITY_INVALID_REQUEST_TRANSITION'
      using errcode = 'check_violation';
  end if;
  new.reviewed_by := v_actor;
  new.reviewed_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists ac_community_requests_transition
  on public.community_requests;
create trigger ac_community_requests_transition
  before update on public.community_requests
  for each row execute function private.guard_request_update();
drop trigger if exists ac_organization_requests_transition
  on public.organization_requests;
create trigger ac_organization_requests_transition
  before update on public.organization_requests
  for each row execute function private.guard_request_update();

alter table public.claim_uploads drop constraint if exists claim_uploads_path_chk;
alter table public.claim_uploads add constraint claim_uploads_path_chk check (
  path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
);

create or replace function private.guard_claim_upload_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_pending integer;
begin
  if v_actor is null then return new; end if;
  if new.owner_id is distinct from v_actor
     or split_part(new.path, '/', 1) <> v_actor::text then
    raise exception 'GEOUNITY_INVALID_UPLOAD_OWNER'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'claims' and o.name = new.path
  ) then
    raise exception 'GEOUNITY_UPLOAD_OBJECT_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;
  select count(*) into v_pending
  from public.claim_uploads u
  where u.owner_id = v_actor and u.claim_id is null;
  if v_pending >= 12 then
    raise exception 'GEOUNITY_TOO_MANY_PENDING_UPLOADS'
      using errcode = 'program_limit_exceeded';
  end if;
  perform private.consume_window_limit('claim-uploads-hour', v_actor, 20, interval '1 hour');
  new.created_at := statement_timestamp();
  new.claim_id := null;
  new.attached_at := null;
  return new;
end;
$$;

drop trigger if exists ab_claim_uploads_validate on public.claim_uploads;
create trigger ab_claim_uploads_validate
  before insert on public.claim_uploads
  for each row execute function private.guard_claim_upload_insert();

-- -----------------------------------------------------------------------------
-- URLs de evidencia derivadas del host confiable de la petición y paths que
-- deben existir realmente en Storage. Sin request.headers (seed/service), se
-- exige al menos la ruta canónica y se conserva el origen provisto.
-- -----------------------------------------------------------------------------
create or replace function public.validate_claim_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracked integer;
  v_objects integer;
  v_distinct integer;
  v_headers jsonb := '{}'::jsonb;
  v_host text;
  v_proto text;
  v_i integer;
begin
  if cardinality(new.image_paths) <> cardinality(new.image_urls)
     or cardinality(new.image_paths) > 4 then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID'
      using errcode = 'check_violation';
  end if;
  if cardinality(new.image_paths) = 0 then
    new.image_url := null;
    new.image_urls := '{}';
    return new;
  end if;
  select count(distinct p) into v_distinct from unnest(new.image_paths) p;
  if v_distinct <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_DUPLICATED'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_tracked
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.path = any(new.image_paths);
  select count(*) into v_objects
  from storage.objects o
  where o.bucket_id = 'claims' and o.name = any(new.image_paths);
  if v_tracked <> cardinality(new.image_paths)
     or v_objects <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID'
      using errcode = 'check_violation';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_host := nullif(v_headers ->> 'host', '');
  v_proto := coalesce(nullif(v_headers ->> 'x-forwarded-proto', ''), 'https');
  if v_proto not in ('http', 'https') then v_proto := 'https'; end if;

  if v_host is not null then
    select array_agg(
      v_proto || '://' || v_host || '/storage/v1/object/public/claims/' || p
      order by ord
    ) into new.image_urls
    from unnest(new.image_paths) with ordinality paths(p, ord);
  else
    for v_i in 1..cardinality(new.image_paths) loop
      if new.image_urls[v_i] !~ '^https?://[^/]+/storage/v1/object/public/claims/'
         or right(new.image_urls[v_i], char_length(new.image_paths[v_i]) + 1)
            <> '/' || new.image_paths[v_i] then
        raise exception 'GEOUNITY_CLAIM_IMAGE_URL_INVALID'
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  new.image_url := new.image_urls[1];
  return new;
end;
$$;

create or replace function public.can_upload_claim_object()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.can_participate() then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('claim-objects:' || v_user::text, 0));
  return (select count(*) from storage.objects o
          where o.bucket_id = 'claims'
            and split_part(o.name, '/', 1) = v_user::text) < 200
     and (select count(*) from public.claim_uploads u
          where u.owner_id = v_user and u.claim_id is null) < 12;
end;
$$;

create or replace function public.can_upload_avatar_object()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null or not public.can_participate() then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('avatar-objects:' || v_user::text, 0));
  return (select count(*) from storage.objects o
          where o.bucket_id = 'avatars'
            and split_part(o.name, '/', 1) = v_user::text) < 20;
end;
$$;

drop policy if exists "geounity_own_folder_insert" on storage.objects;
drop policy if exists "geounity_own_folder_update" on storage.objects;
drop policy if exists "geounity_own_folder_delete" on storage.objects;
drop policy if exists "geounity_avatar_insert" on storage.objects;
drop policy if exists "geounity_avatar_update" on storage.objects;
drop policy if exists "geounity_avatar_delete" on storage.objects;
drop policy if exists "geounity_claim_insert" on storage.objects;
drop policy if exists "geounity_claim_delete_pending" on storage.objects;

create policy "geounity_avatar_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]+\.(jpg|png|webp|avif)$')
    and public.can_upload_avatar_object()
  );
create policy "geounity_avatar_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_participate()
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]+\.(jpg|png|webp|avif)$')
    and public.can_participate()
  );
create policy "geounity_avatar_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = auth.uid()::text
      or public.is_moderator(auth.uid()))
  );

create policy "geounity_claim_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'claims'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~ ('^' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$')
    and public.can_upload_claim_object()
  );
-- No UPDATE en claims: un object path publicado es evidencia inmutable.
create policy "geounity_claim_delete_pending" on storage.objects
  for delete to authenticated using (
    bucket_id = 'claims'
    and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (
      select 1 from public.claim_uploads u
      where u.path = name and u.claim_id is not null
    )
  );

-- RPC de creación convertidas a SECURITY DEFINER con autorización completa.
-- Esto permite retirar INSERT directo sobre polls/options/projects sin cambiar
-- la firma consumida por la aplicación.
create or replace function public.create_poll_with_options(
  p_community uuid,
  p_question text,
  p_description text,
  p_type text,
  p_category text,
  p_max_choices smallint,
  p_results_visibility text,
  p_closes_at text,
  p_options text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_poll uuid;
  v_option_count integer := coalesce(cardinality(p_options), 0);
  v_max_choices smallint := nullif(p_max_choices, 0);
  v_closes_at timestamptz := nullif(p_closes_at, '')::timestamptz;
begin
  perform private.assert_can_participate(v_user);
  if not private.raw_is_member(v_user, p_community) then
    raise exception 'GEOUNITY_COMMUNITY_MEMBERSHIP_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if v_option_count < 2 or v_option_count > 10 then
    raise exception 'Una encuesta necesita entre 2 y 10 opciones'
      using errcode = 'check_violation';
  end if;
  if p_type not in ('single', 'multiple', 'binary') then
    raise exception 'Tipo de encuesta inválido' using errcode = 'check_violation';
  end if;
  if p_type = 'binary' and v_option_count <> 2 then
    raise exception 'Una encuesta binaria necesita exactamente 2 opciones'
      using errcode = 'check_violation';
  end if;
  if p_type <> 'multiple' and v_max_choices is not null then
    raise exception 'Sólo una encuesta múltiple admite un máximo de opciones'
      using errcode = 'check_violation';
  end if;
  if v_max_choices is not null
     and (v_max_choices < 1 or v_max_choices > v_option_count) then
    raise exception 'El máximo de opciones no es válido'
      using errcode = 'check_violation';
  end if;
  if p_results_visibility not in ('always', 'after_vote', 'after_close') then
    raise exception 'Visibilidad de resultados inválida'
      using errcode = 'check_violation';
  end if;
  if p_results_visibility = 'after_close' and v_closes_at is null then
    raise exception 'Los resultados al cierre requieren fecha de cierre'
      using errcode = 'check_violation';
  end if;
  if v_closes_at is not null and v_closes_at <= now() then
    raise exception 'La fecha de cierre tiene que ser futura'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from unnest(p_options) option
    where nullif(btrim(option), '') is null or char_length(btrim(option)) > 120
  ) then
    raise exception 'Las opciones no son válidas' using errcode = 'check_violation';
  end if;
  if (select count(distinct lower(btrim(option))) from unnest(p_options) option)
       <> v_option_count then
    raise exception 'Las opciones no pueden repetirse'
      using errcode = 'check_violation';
  end if;

  insert into public.polls (
    community_id, author_id, question, description, type, category,
    max_choices, results_visibility, closes_at
  ) values (
    p_community, v_user, p_question, nullif(btrim(p_description), ''),
    p_type, p_category, v_max_choices, p_results_visibility, v_closes_at
  ) returning id into v_poll;

  insert into public.poll_options (poll_id, label, sort_order)
  select v_poll, btrim(option), (ordinality - 1)::smallint
  from unnest(p_options) with ordinality as options(option, ordinality);
  return v_poll;
end;
$$;

create or replace function public.create_project_with_relation(
  p_community uuid,
  p_title text,
  p_summary text,
  p_plan text,
  p_budget_amount numeric,
  p_currency text,
  p_resources_needed text,
  p_time_estimate text,
  p_source_claim text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_source_claim uuid := nullif(p_source_claim, '')::uuid;
begin
  perform private.assert_can_participate(v_user);
  if not private.raw_is_member(v_user, p_community) then
    raise exception 'GEOUNITY_COMMUNITY_MEMBERSHIP_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if v_source_claim is not null
     and not (
       private.session_is_moderator(v_user)
       or coalesce(
         private.raw_content_author('claim', v_source_claim) = v_user,
         false
       )
     ) then
    raise exception 'No podés vincular ese reclamo'
      using errcode = 'insufficient_privilege';
  end if;
  if v_source_claim is not null
     and not private.raw_content_exists('claim', v_source_claim) then
    raise exception 'El reclamo de origen no existe'
      using errcode = 'foreign_key_violation';
  end if;

  insert into public.projects (
    community_id, author_id, title, summary, plan, budget_amount, currency,
    resources_needed, time_estimate
  ) values (
    p_community, v_user, p_title, p_summary, p_plan,
    nullif(p_budget_amount, 0), p_currency,
    nullif(btrim(p_resources_needed), ''), nullif(btrim(p_time_estimate), '')
  ) returning id into v_project;

  if v_source_claim is not null then
    insert into public.content_relations (
      source_type, source_id, target_type, target_id, relation_type, created_by
    ) values ('claim', v_source_claim, 'project', v_project, 'proposal_for', v_user);
  end if;
  return v_project;
end;
$$;

create or replace function public.add_claim_event_with_status(
  p_claim uuid,
  p_organization text,
  p_event_type text,
  p_title text,
  p_body text,
  p_evidence_url text,
  p_event_date text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_organization uuid := nullif(p_organization, '')::uuid;
  v_event_date date := nullif(p_event_date, '')::date;
  v_status text := nullif(p_status, '');
  v_claim public.claims%rowtype;
  v_mod boolean;
  v_org boolean;
  v_author boolean;
begin
  perform private.assert_can_participate(v_user);
  select * into v_claim from public.claims c where c.id = p_claim for update;
  if not found or v_claim.status = 'removed' then
    raise exception 'El reclamo no existe' using errcode = 'foreign_key_violation';
  end if;

  v_mod := private.session_is_moderator(v_user);
  v_author := v_claim.author_id is not distinct from v_user;
  v_org := v_organization is not null
    and v_organization = v_claim.responsible_organization_id
    and private.raw_is_verified_org_member(v_user, v_organization);

  if not (v_mod or v_author or v_org) then
    raise exception 'No podés actualizar ese reclamo'
      using errcode = 'insufficient_privilege';
  end if;
  if v_organization is not null and not (v_mod or v_org) then
    raise exception 'No representás a la organización responsable'
      using errcode = 'insufficient_privilege';
  end if;
  if p_event_type = 'official_response' and not (v_mod or v_org) then
    raise exception 'Una respuesta oficial requiere la organización responsable'
      using errcode = 'insufficient_privilege';
  end if;
  if v_status is not null and not (v_mod or v_org) then
    raise exception 'Sólo moderación o la organización responsable cambia el estado'
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(p_evidence_url), '') is not null
     and btrim(p_evidence_url) !~ '^https?://' then
    raise exception 'La evidencia debe usar HTTP o HTTPS'
      using errcode = 'check_violation';
  end if;

  if v_status is not null then
    update public.claims set status = v_status where id = p_claim;
  end if;

  insert into public.claim_events (
    claim_id, actor_id, organization_id, event_type, title, body,
    evidence_url, event_date, status
  ) values (
    p_claim, v_user, v_organization, p_event_type, p_title,
    nullif(btrim(p_body), ''), nullif(btrim(p_evidence_url), ''),
    coalesce(v_event_date, current_date), v_status
  ) returning id into v_event;
  return v_event;
end;
$$;

create or replace function public.guard_claim_event_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_responsible uuid;
begin
  if v_actor is null then return new; end if;
  if new.actor_id is distinct from v_actor then
    raise exception 'GEOUNITY_ACTOR_MUST_MATCH_SESSION'
      using errcode = 'insufficient_privilege';
  end if;
  select c.responsible_organization_id into v_responsible
  from public.claims c where c.id = new.claim_id;

  if new.event_type = 'official_response' and new.organization_id is null then
    raise exception 'Una respuesta oficial requiere organización'
      using errcode = 'check_violation';
  end if;
  if new.organization_id is not null and not private.session_is_moderator(v_actor) then
    if new.organization_id is distinct from v_responsible
       or not private.raw_is_verified_org_member(v_actor, new.organization_id) then
      raise exception 'No representás a la organización responsable'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

-- Las respuestas institucionales son declaraciones públicas inmutables. Una
-- corrección se publica como una nueva respuesta, preservando trazabilidad.
drop policy if exists institutional_responses_update_own
  on public.institutional_responses;

-- -----------------------------------------------------------------------------
-- Opciones: editables sólo antes del primer voto por vías internas. Los roles
-- de API no reciben DML directo; esta guarda protege además consola/migraciones.
-- -----------------------------------------------------------------------------
create or replace function private.guard_poll_option_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll uuid := case when tg_op = 'DELETE' then old.poll_id else new.poll_id end;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('poll-options:' || v_poll::text));
  if exists (select 1 from public.poll_votes v where v.poll_id = v_poll) then
    raise exception 'GEOUNITY_POLL_OPTIONS_FROZEN'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if tg_op = 'UPDATE' and new.poll_id is distinct from old.poll_id then
    raise exception 'La opción no puede moverse de encuesta'
      using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.poll_options o where o.poll_id = v_poll;
    if v_count >= 10 then
      raise exception 'Una encuesta admite hasta 10 opciones'
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.poll_options o
      where o.poll_id = v_poll and lower(btrim(o.label)) = lower(btrim(new.label))
    ) then
      raise exception 'Las opciones no pueden repetirse'
        using errcode = 'unique_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists aa_poll_options_frozen on public.poll_options;
create trigger aa_poll_options_frozen
  before insert or update or delete on public.poll_options
  for each row execute function private.guard_poll_option_mutation();

create or replace function public.prepare_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_poll public.polls%rowtype; v_options integer;
begin
  if auth.uid() is not null and new.user_id is distinct from auth.uid() then
    raise exception 'GEOUNITY_VOTER_MUST_MATCH_SESSION'
      using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.poll_id::text || ':' || new.user_id::text));
  select * into v_poll from public.polls p where p.id = new.poll_id;
  if not found then
    raise exception 'La encuesta no existe' using errcode = 'foreign_key_violation';
  end if;
  if v_poll.status <> 'active' then
    raise exception 'Esta encuesta está cerrada' using errcode = 'check_violation';
  end if;
  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'El plazo para votar ya venció' using errcode = 'check_violation';
  end if;
  select count(*) into v_options from public.poll_options o where o.poll_id = v_poll.id;
  if v_options < 2 or v_options > 10 or (v_poll.type = 'binary' and v_options <> 2) then
    raise exception 'La encuesta está mal configurada' using errcode = 'check_violation';
  end if;
  if v_poll.type = 'multiple' and v_poll.max_choices is not null
     and (select count(*) from public.poll_votes v
          where v.poll_id = new.poll_id and v.user_id = new.user_id)
         >= v_poll.max_choices then
    raise exception 'Esta encuesta permite elegir hasta % opciones', v_poll.max_choices
      using errcode = 'check_violation';
  end if;
  new.poll_type := v_poll.type;
  new.created_at := statement_timestamp();
  return new;
end;
$$;

create or replace function private.guard_profile_system_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then return new; end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'GEOUNITY_IMMUTABLE_PROFILE_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if not private.session_is_moderator(v_actor)
     and (new.role is distinct from old.role
       or new.verification_level is distinct from old.verification_level) then
    raise exception 'GEOUNITY_IMMUTABLE_PROFILE_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if new.residence_changed_at is distinct from old.residence_changed_at
     and new.home_community_id is not distinct from old.home_community_id then
    raise exception 'GEOUNITY_RESIDENCE_TIMESTAMP_MANAGED_BY_DB'
      using errcode = 'insufficient_privilege';
  end if;

  if new.home_community_id is distinct from old.home_community_id then
    perform private.assert_can_participate(v_actor);
  end if;
  return new;
end;
$$;

drop trigger if exists aa_profiles_system_fields on public.profiles;
create trigger aa_profiles_system_fields
  before update on public.profiles
  for each row execute function private.guard_profile_system_fields();

-- -----------------------------------------------------------------------------
-- Los campos de identidad, territorio, tiempos y agregados del contenido no
-- pueden cambiarse con un UPDATE arbitrario. Las transiciones permitidas son
-- deliberadamente unidireccionales para autores y representantes.
-- -----------------------------------------------------------------------------
create or replace function private.guard_core_content_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then return new; end if;
  perform private.assert_can_participate(v_actor);
  if new.author_id is distinct from v_actor then
    raise exception 'GEOUNITY_AUTHOR_MUST_MATCH_SESSION'
      using errcode = 'insufficient_privilege';
  end if;

  new.created_at := statement_timestamp();
  new.removed_by := null;
  new.removed_at := null;
  new.status_before_removal := null;
  case tg_table_name
    when 'polls' then new.status := 'active';
    when 'debates' then new.status := 'open';
    when 'claims' then
      new.status := 'open';
      new.support_count := 0;
    when 'projects' then
      new.status := 'proposal';
      new.pledged_total := 0;
  end case;
  return new;
end;
$$;

create or replace function private.guard_core_content_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_mod boolean;
  v_author boolean;
  v_org boolean := false;
  v_changed_other boolean;
  v_allowed boolean := false;
begin
  if v_actor is null or pg_trigger_depth() > 1 then return new; end if;
  v_mod := private.session_is_moderator(v_actor);
  v_author := old.author_id is not distinct from v_actor;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.community_id is distinct from old.community_id
     or new.created_at is distinct from old.created_at then
    raise exception 'GEOUNITY_IMMUTABLE_CONTENT_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_table_name = 'claims' then
    v_changed_other :=
      (to_jsonb(new) - array['status', 'responsible_organization_id',
        'removed_by', 'removed_at', 'status_before_removal', 'support_count'])
      is distinct from
      (to_jsonb(old) - array['status', 'responsible_organization_id',
        'removed_by', 'removed_at', 'status_before_removal', 'support_count']);
    if new.support_count is distinct from old.support_count then
      raise exception 'GEOUNITY_DERIVED_COUNTER_IMMUTABLE'
        using errcode = 'insufficient_privilege';
    end if;
    if new.responsible_organization_id is distinct from old.responsible_organization_id
       and not v_mod then
      raise exception 'GEOUNITY_MODERATOR_REQUIRED'
        using errcode = 'insufficient_privilege';
    end if;
    v_org := old.responsible_organization_id is not null
      and private.raw_is_verified_org_member(v_actor, old.responsible_organization_id);
  elsif tg_table_name = 'projects' then
    v_changed_other :=
      (to_jsonb(new) - array['status', 'removed_by', 'removed_at',
        'status_before_removal', 'pledged_total'])
      is distinct from
      (to_jsonb(old) - array['status', 'removed_by', 'removed_at',
        'status_before_removal', 'pledged_total']);
    if new.pledged_total is distinct from old.pledged_total then
      raise exception 'GEOUNITY_DERIVED_COUNTER_IMMUTABLE'
        using errcode = 'insufficient_privilege';
    end if;
  else
    v_changed_other :=
      (to_jsonb(new) - array['status', 'removed_by', 'removed_at', 'status_before_removal'])
      is distinct from
      (to_jsonb(old) - array['status', 'removed_by', 'removed_at', 'status_before_removal']);
  end if;

  if v_changed_other then
    raise exception 'GEOUNITY_IMMUTABLE_CONTENT_FIELD'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is not distinct from old.status then return new; end if;
  if v_mod then return new; end if;

  case tg_table_name
    when 'polls' then
      v_allowed := v_author and (
        (old.status = 'active' and new.status = 'closed')
        or (old.status in ('active', 'closed') and new.status = 'removed')
      );
    when 'debates' then
      v_allowed := v_author and (
        (old.status = 'open' and new.status = 'closed')
        or (old.status in ('open', 'closed') and new.status = 'removed')
      );
    when 'claims' then
      v_allowed := (v_author and new.status = 'removed') or (v_org and (
        (old.status = 'open' and new.status in ('under_review', 'acknowledged', 'rejected'))
        or (old.status = 'under_review' and new.status in ('acknowledged', 'in_progress', 'rejected'))
        or (old.status = 'acknowledged' and new.status in ('in_progress', 'resolved', 'rejected'))
        or (old.status = 'in_progress' and new.status in ('resolved', 'rejected'))
      ));
    when 'projects' then
      v_allowed := v_author and (
        (old.status = 'proposal' and new.status in ('funding', 'in_progress', 'removed'))
        or (old.status = 'funding' and new.status in ('in_progress', 'removed'))
        or (old.status = 'in_progress' and new.status in ('completed', 'removed'))
        or (old.status = 'completed' and new.status = 'removed')
      );
  end case;

  if not v_allowed then
    raise exception 'GEOUNITY_INVALID_STATUS_TRANSITION'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array['polls', 'debates', 'claims', 'projects'] loop
    execute format('drop trigger if exists ab_core_insert_guard on public.%I', v_table);
    execute format(
      'create trigger ab_core_insert_guard before insert on public.%I '
      'for each row execute function private.guard_core_content_insert()', v_table);
    execute format('drop trigger if exists ab_core_update_guard on public.%I', v_table);
    execute format(
      'create trigger ab_core_update_guard before update on public.%I '
      'for each row execute function private.guard_core_content_update()', v_table);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Agregados sin lost updates. Cada trigger aplica un delta sobre la fila padre;
-- PostgreSQL serializa esos UPDATE por row lock y preserva operaciones paralelas.
-- -----------------------------------------------------------------------------
create or replace function public.sync_comment_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.debate_comments set score = score + new.value where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.debate_comments set score = score - old.value where id = old.comment_id;
  elsif new.comment_id = old.comment_id then
    update public.debate_comments
       set score = score + new.value - old.value
     where id = new.comment_id;
  else
    update public.debate_comments set score = score - old.value where id = old.comment_id;
    update public.debate_comments set score = score + new.value where id = new.comment_id;
  end if;
  return null;
end;
$$;

create or replace function public.sync_claim_support_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.claims set support_count = support_count + 1 where id = new.claim_id;
  else
    update public.claims
       set support_count = greatest(0, support_count - 1)
     where id = old.claim_id;
  end if;
  return null;
end;
$$;

create or replace function public.sync_pledged_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.projects
       set pledged_total = pledged_total + new.amount
     where id = new.project_id;
  elsif tg_op = 'DELETE' then
    update public.projects
       set pledged_total = greatest(0, pledged_total - old.amount)
     where id = old.project_id;
  elsif new.project_id = old.project_id then
    update public.projects
       set pledged_total = greatest(0, pledged_total + new.amount - old.amount)
     where id = new.project_id;
  else
    update public.projects
       set pledged_total = greatest(0, pledged_total - old.amount)
     where id = old.project_id;
    update public.projects
       set pledged_total = pledged_total + new.amount
     where id = new.project_id;
  end if;
  return null;
end;
$$;

-- Cooldown atómico: la fila (scope,user) es el punto único de serialización.
create or replace function public.enforce_debate_column()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_debate public.debates%rowtype; v_actor uuid := auth.uid();
begin
  if v_actor is not null and new.user_id is distinct from v_actor then
    raise exception 'GEOUNITY_COMMENTER_MUST_MATCH_SESSION'
      using errcode = 'insufficient_privilege';
  end if;
  select * into v_debate from public.debates d where d.id = new.debate_id;
  if not found then
    raise exception 'El debate no existe' using errcode = 'foreign_key_violation';
  end if;
  if v_debate.status <> 'open' then
    raise exception 'Este debate está cerrado' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.communities c
    where c.id = new.column_community_id and c.parent_id = v_debate.community_id
  ) then
    raise exception 'La columna no es una sub-comunidad directa de este debate'
      using errcode = 'check_violation';
  end if;
  -- Seed, migraciones y service jobs conservan timestamps explícitos; el
  -- navegador queda sellado y serializado por usuario.
  if v_actor is not null then
    perform private.consume_cooldown(
      'debate-comments', v_actor, interval '15 seconds'
    );
    new.created_at := statement_timestamp();
    new.score := 0;
    new.status := 'visible';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- k-anonimato por personas, no por selecciones (encuestas múltiples).
-- -----------------------------------------------------------------------------
create or replace function public.poll_results_by_child(p_poll uuid)
returns table (
  child_id uuid,
  child_name text,
  child_emoji text,
  option_id uuid,
  votes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with attributed as (
    select child.id child_id, child.name child_name, child.emoji child_emoji,
           v.option_id, v.user_id
    from public.poll_votes v
    join public.polls p on p.id = v.poll_id
    join public.communities pc on pc.id = p.community_id
    join public.profiles pr on pr.id = v.user_id
    join public.communities home on home.id = pr.home_community_id
    join public.communities child
      on child.parent_id = pc.id
     and (home.path = child.path or home.path like child.path || '.%')
    where v.poll_id = p_poll and public.can_see_poll_results(p_poll)
  ), eligible as (
    select a.child_id
    from attributed a
    group by a.child_id
    having count(distinct a.user_id) >= 5
  )
  select a.child_id, max(a.child_name), max(a.child_emoji), a.option_id,
         count(*)::bigint
  from attributed a
  join eligible e on e.child_id = a.child_id
  group by a.child_id, a.option_id
  order by max(a.child_name), a.option_id;
$$;

create or replace function public.sibling_poll_contrast(
  p_community uuid,
  p_limit integer default 6
)
returns table (
  poll_id uuid,
  question text,
  top_option_label text,
  children_counted integer,
  agreeing_children integer,
  min_share numeric,
  max_share numeric,
  spread numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with attributed as (
    select p.id poll_id, p.question, child.id child_id, v.option_id, v.user_id
    from public.polls p
    join public.poll_votes v on v.poll_id = p.id
    join public.profiles pr on pr.id = v.user_id
    join public.communities home on home.id = pr.home_community_id
    join public.communities child
      on child.parent_id = p_community
     and (home.path = child.path or home.path like child.path || '.%')
    where p.community_id = p_community
      and p.status <> 'removed'
      and public.can_see_poll_results(p.id)
  ), eligible as (
    select a.poll_id, a.child_id
    from attributed a
    group by a.poll_id, a.child_id
    having count(distinct a.user_id) >= 5
  ), per_child_option as (
    select a.poll_id, max(a.question) question, a.child_id, a.option_id,
           count(*)::bigint votes
    from attributed a
    join eligible e on e.poll_id = a.poll_id and e.child_id = a.child_id
    group by a.poll_id, a.child_id, a.option_id
  ), child_totals as (
    select p.poll_id, p.child_id, sum(p.votes) total
    from per_child_option p group by p.poll_id, p.child_id
  ), poll_top as (
    select distinct on (x.poll_id) x.poll_id, x.option_id, po.label
    from (
      select p.poll_id, p.option_id, sum(p.votes) votes
      from per_child_option p group by p.poll_id, p.option_id
    ) x
    join public.poll_options po on po.id = x.option_id
    order by x.poll_id, x.votes desc, po.label
  ), shares as (
    select ct.poll_id, ct.child_id,
      round(100.0 * coalesce((
        select p.votes from per_child_option p
        join poll_top pt0 on pt0.poll_id = p.poll_id and pt0.option_id = p.option_id
        where p.poll_id = ct.poll_id and p.child_id = ct.child_id
      ), 0) / ct.total, 1) share,
      ((select p.option_id from per_child_option p
        join public.poll_options po on po.id = p.option_id
        where p.poll_id = ct.poll_id and p.child_id = ct.child_id
        order by p.votes desc, po.label limit 1)
       = (select pt.option_id from poll_top pt where pt.poll_id = ct.poll_id)) agrees
    from child_totals ct
  )
  select s.poll_id, max(pco.question), max(pt.label), count(*)::int,
         count(*) filter (where s.agrees)::int,
         min(s.share), max(s.share), max(s.share) - min(s.share)
  from shares s
  join poll_top pt on pt.poll_id = s.poll_id
  join per_child_option pco on pco.poll_id = s.poll_id
  group by s.poll_id
  having count(distinct s.child_id) >= 2
  order by max(s.share) - min(s.share) desc
  limit least(greatest(p_limit, 1), 20);
$$;

-- -----------------------------------------------------------------------------
-- Integridad geográfica y FKs compuestas que evitan relaciones cruzadas.
-- -----------------------------------------------------------------------------
create or replace function private.guard_community_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_parent public.communities%rowtype;
begin
  if new.parent_id is null then
    if new.level <> 0 or new.path <> new.slug then
      raise exception 'GEOUNITY_INVALID_ROOT_COMMUNITY'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;
  select * into v_parent from public.communities p where p.id = new.parent_id;
  if not found then
    raise exception 'La comunidad padre no existe' using errcode = 'foreign_key_violation';
  end if;
  if new.level <> v_parent.level + 1
     or new.path <> v_parent.path || '.' || new.slug then
    raise exception 'GEOUNITY_INVALID_COMMUNITY_HIERARCHY'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists communities_hierarchy_guard on public.communities;
create trigger communities_hierarchy_guard
  before insert or update of slug, level, parent_id, path on public.communities
  for each row execute function private.guard_community_hierarchy();

-- -----------------------------------------------------------------------------
-- Contratos de escritura estrechos. Los tres upserts que usa la interfaz pasan
-- por RPC para que `ON CONFLICT` actualice sólo el valor mutable y nunca intente
-- reclamar privilegios UPDATE sobre las claves de identidad.
-- -----------------------------------------------------------------------------
alter table public.poll_votes alter column poll_type set default 'single';

create or replace function public.set_comment_vote(
  p_comment uuid,
  p_value smallint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para votar'
      using errcode = 'invalid_authorization_specification';
  end if;
  if p_value not in (-1, 1) then
    raise exception 'El voto no es válido' using errcode = 'check_violation';
  end if;

  insert into public.comment_votes (comment_id, user_id, value)
  values (p_comment, v_actor, p_value)
  on conflict (comment_id, user_id) do update
    set value = excluded.value;
end;
$$;

create or replace function public.set_project_pledge(
  p_project uuid,
  p_amount numeric,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para participar'
      using errcode = 'invalid_authorization_specification';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero'
      using errcode = 'check_violation';
  end if;

  insert into public.project_pledges (project_id, user_id, amount, message)
  values (p_project, v_actor, p_amount, nullif(btrim(p_message), ''))
  on conflict (project_id, user_id) do update
    set amount = excluded.amount,
        message = excluded.message;
end;
$$;

create or replace function public.set_community_visibility(
  p_community uuid,
  p_is_anonymous boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para guardar esta preferencia'
      using errcode = 'invalid_authorization_specification';
  end if;
  if p_is_anonymous is null then
    raise exception 'La preferencia de visibilidad no es válida'
      using errcode = 'check_violation';
  end if;

  insert into public.community_visibility (
    user_id, community_id, is_anonymous
  ) values (
    v_actor, p_community, p_is_anonymous
  )
  on conflict (user_id, community_id) do update
    set is_anonymous = excluded.is_anonymous;
end;
$$;

-- Fuentes: la sesión aporta el contenido editorial; identidad, reloj y marca de
-- verificación son siempre decisión de la base.
create or replace function private.guard_content_source_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then return new; end if;
  if new.added_by is distinct from v_actor then
    raise exception 'GEOUNITY_SOURCE_AUTHOR_MUST_MATCH_SESSION'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_at := statement_timestamp();
  new.verified_at := case
    when private.session_is_moderator(v_actor) then statement_timestamp()
    else null
  end;
  return new;
end;
$$;

drop trigger if exists ab_content_sources_seal on public.content_sources;
create trigger ab_content_sources_seal
  before insert on public.content_sources
  for each row execute function private.guard_content_source_insert();

-- Reportes: el navegador sólo elige el siguiente estado. Actor y timestamps se
-- derivan aquí, y el contenido original de la denuncia queda inmutable.
create or replace function private.guard_report_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_allowed boolean;
begin
  if v_actor is null then return new; end if;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - array['status', 'resolved_by', 'resolved_at'])
       is distinct from
     (to_jsonb(old) - array['status', 'resolved_by', 'resolved_at']) then
    raise exception 'GEOUNITY_REPORT_FIELDS_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;

  v_allowed :=
    (old.status = 'pending' and new.status in (
      'reviewing', 'resolved', 'dismissed'
    )) or
    (old.status = 'reviewing' and new.status in ('resolved', 'dismissed'));
  if new.status is not distinct from old.status or not v_allowed then
    raise exception 'GEOUNITY_INVALID_REPORT_TRANSITION'
      using errcode = 'check_violation';
  end if;

  if new.status in ('resolved', 'dismissed') then
    new.resolved_by := v_actor;
    new.resolved_at := statement_timestamp();
  else
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists ac_reports_transition on public.reports;
create trigger ac_reports_transition
  before update on public.reports
  for each row execute function private.guard_report_update();

alter table public.reports
  drop constraint if exists reports_resolution_state_chk;
alter table public.reports
  add constraint reports_resolution_state_chk check (
    (status in ('pending', 'reviewing') and resolved_at is null)
    or (status in ('resolved', 'dismissed') and resolved_at is not null)
  );

-- Hitos: sólo cambia el estado; `completed_at` refleja exactamente ese estado
-- y no acepta fechas elegidas por el cliente.
create or replace function private.guard_project_milestone_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid(); v_allowed boolean;
begin
  if v_actor is null then return new; end if;
  if not (
    private.session_is_moderator(v_actor)
    or private.raw_content_author('project', old.project_id) = v_actor
  ) then
    raise exception 'No podés actualizar ese hito'
      using errcode = 'insufficient_privilege';
  end if;
  if (to_jsonb(new) - array['status', 'completed_at']) is distinct from
     (to_jsonb(old) - array['status', 'completed_at']) then
    raise exception 'GEOUNITY_MILESTONE_FIELDS_IMMUTABLE'
      using errcode = 'insufficient_privilege';
  end if;
  if new.status is not distinct from old.status then
    new.completed_at := old.completed_at;
    return new;
  end if;

  v_allowed := case old.status
    when 'pending' then new.status in ('in_progress', 'blocked', 'completed')
    when 'in_progress' then new.status in ('pending', 'blocked', 'completed')
    when 'blocked' then new.status in ('pending', 'in_progress', 'completed')
    when 'completed' then new.status = 'in_progress'
    else false
  end;
  if not v_allowed then
    raise exception 'GEOUNITY_INVALID_MILESTONE_TRANSITION'
      using errcode = 'check_violation';
  end if;

  new.completed_at := case
    when new.status = 'completed' then statement_timestamp()
    else null
  end;
  return new;
end;
$$;

drop trigger if exists ab_project_milestones_transition
  on public.project_milestones;
create trigger ab_project_milestones_transition
  before update on public.project_milestones
  for each row execute function private.guard_project_milestone_update();

alter table public.project_milestones
  drop constraint if exists project_milestones_completion_state_chk;
alter table public.project_milestones
  add constraint project_milestones_completion_state_chk check (
    (status = 'completed') = (completed_at is not null)
  );

-- Partidas: no existe edición ni borrado en producto. Una creación válida queda
-- atribuida al moderador autenticado y usa siempre el reloj del servidor.
create or replace function private.guard_community_budget_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then return new; end if;
  if not private.session_is_moderator(v_actor) then
    raise exception 'GEOUNITY_MODERATOR_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  new.created_by := v_actor;
  new.created_at := statement_timestamp();
  return new;
end;
$$;

drop trigger if exists ab_community_budgets_seal
  on public.community_budgets;
create trigger ab_community_budgets_seal
  before insert on public.community_budgets
  for each row execute function private.guard_community_budget_insert();

alter table public.project_comments
  add constraint project_comments_project_id_id_key unique (project_id, id);
alter table public.project_comments
  add constraint project_comments_parent_same_project_fk
  foreign key (project_id, parent_id)
  references public.project_comments (project_id, id)
  on delete cascade;

alter table public.project_milestones
  add constraint project_milestones_project_id_id_key unique (project_id, id);
alter table public.project_tasks
  add constraint project_tasks_milestone_same_project_fk
  foreign key (project_id, milestone_id)
  references public.project_milestones (project_id, id);

-- Tabla de configuración expuesta: lectura pública explícita, nunca escritura.
alter table public.claim_response_windows enable row level security;
drop policy if exists claim_response_windows_select_all
  on public.claim_response_windows;
create policy claim_response_windows_select_all
  on public.claim_response_windows for select using (true);
revoke insert, update, delete, truncate on public.claim_response_windows
  from anon, authenticated;
grant select on public.claim_response_windows to anon, authenticated;

-- Índices para FKs y rutas de autorización frecuentes.
create index if not exists organization_members_user_idx
  on public.organization_members (user_id, organization_id);
create index if not exists project_comments_user_idx
  on public.project_comments (user_id, created_at desc);
create index if not exists project_comments_parent_idx
  on public.project_comments (parent_id) where parent_id is not null;
create index if not exists project_contributions_user_idx
  on public.project_contributions (user_id, created_at desc);
create index if not exists claims_responsible_org_idx
  on public.claims (responsible_organization_id)
  where responsible_organization_id is not null;
create index if not exists institutional_responses_org_idx
  on public.institutional_responses (organization_id, created_at desc);
create index if not exists institutional_responses_author_idx
  on public.institutional_responses (author_id, created_at desc);
create index if not exists claim_uploads_owner_idx
  on public.claim_uploads (owner_id, created_at desc);
create index if not exists claim_uploads_claim_idx
  on public.claim_uploads (claim_id) where claim_id is not null;
create index if not exists budget_proposals_project_idx
  on public.budget_proposals (project_id);
create index if not exists budget_reports_project_idx
  on public.budget_reports (project_id);
create index if not exists budget_reports_author_idx
  on public.budget_reports (author_id, created_at desc);
create index if not exists notifications_actor_idx
  on public.notifications (actor_id) where actor_id is not null;
create index if not exists organization_requests_user_idx
  on public.organization_requests (user_id, created_at desc);
create index if not exists community_requests_user_idx
  on public.community_requests (user_id, created_at desc);
create index if not exists claim_events_actor_idx
  on public.claim_events (actor_id) where actor_id is not null;
create index if not exists claim_events_org_idx
  on public.claim_events (organization_id) where organization_id is not null;
create index if not exists project_tasks_assigned_user_idx
  on public.project_tasks (assigned_user_id, status)
  where assigned_user_id is not null;
create index if not exists project_tasks_assigned_org_idx
  on public.project_tasks (assigned_organization_id, status)
  where assigned_organization_id is not null;

-- -----------------------------------------------------------------------------
-- Privilegios por columna. Los defaults y campos del sistema quedan fuera de
-- INSERT/UPDATE de PostgREST aunque una policy futura sea demasiado amplia.
-- -----------------------------------------------------------------------------
-- La sesión anónima es sólo lectura. 0031 otorgaba DML a todo rol de API para
-- poder probar RLS local; producción reduce además la capacidad SQL subyacente.
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- Catálogos y entidades creadas únicamente por RPC/servicio. Moderación sigue
-- operando mediante approve_* y los jobs con service_role, nunca por REST DML.
revoke insert, update, delete, truncate on public.activation_events,
  public.communities,
  public.community_info,
  public.content_quotas,
  public.organizations,
  public.organization_members
from authenticated;

-- No existe una acción de producto que borre estas filas directamente. Las
-- bajas de cuenta/cascadas y los jobs internos corren con un rol confiable.
revoke delete on public.budget_proposals,
  public.budget_reports,
  public.claims,
  public.content_relations,
  public.content_sources,
  public.debate_comments,
  public.debates,
  public.profiles,
  public.project_comments
from authenticated;

revoke insert, update, delete, truncate on public.community_budgets
  from authenticated;
grant insert (
  community_id, title, description, amount, currency, tokens_per_voter,
  max_tokens_per_proposal, proposals_close_at, voting_opens_at,
  voting_closes_at, report_due_at
) on public.community_budgets to authenticated;

revoke insert, update on public.follows from authenticated;
grant insert (user_id, community_id) on public.follows to authenticated;

revoke insert, update, delete on public.community_visibility from authenticated;
grant insert (user_id, community_id, is_anonymous)
  on public.community_visibility to authenticated;
grant update (is_anonymous) on public.community_visibility to authenticated;

revoke insert, update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, bio, home_community_id)
  on public.profiles to authenticated;

revoke insert, update, delete on public.polls from authenticated;
grant update (status) on public.polls to authenticated;
revoke insert, update, delete on public.poll_options from authenticated;

revoke insert, update, delete on public.poll_votes from authenticated;
grant insert (poll_id, option_id, user_id, is_anonymous)
  on public.poll_votes to authenticated;

revoke insert, update on public.comment_votes from authenticated;
grant insert (comment_id, user_id, value)
  on public.comment_votes to authenticated;
grant update (value) on public.comment_votes to authenticated;

revoke insert, update, delete on public.projects from authenticated;
grant update (status) on public.projects to authenticated;

revoke insert, update on public.debates from authenticated;
grant insert (community_id, title, body, author_id)
  on public.debates to authenticated;
grant update (status) on public.debates to authenticated;

revoke insert, update on public.claims from authenticated;
grant insert (
  community_id, author_id, title, description, category, image_url,
  image_urls, image_paths, location_text, lat, lng
) on public.claims to authenticated;
grant update (status, responsible_organization_id)
  on public.claims to authenticated;

revoke insert, update on public.claim_supports from authenticated;
grant insert (claim_id, user_id) on public.claim_supports to authenticated;

revoke insert, update on public.content_sources from authenticated;
grant insert (
  content_type, content_id, added_by, title, url, publisher, published_at
) on public.content_sources to authenticated;

revoke insert, update on public.content_relations from authenticated;
grant insert (
  source_type, source_id, target_type, target_id, relation_type, created_by
) on public.content_relations to authenticated;

revoke insert, update, delete on public.claim_events from authenticated;
revoke update, delete on public.institutional_responses from authenticated;
revoke insert on public.institutional_responses from authenticated;
grant insert (
  organization_id, author_id, content_type, content_id,
  response_type, body, source_url
) on public.institutional_responses to authenticated;

revoke insert, update, delete on public.project_tasks from authenticated;
grant insert (
  project_id, milestone_id, title, description, assigned_user_id,
  assigned_organization_id, skills_needed, due_date
) on public.project_tasks to authenticated;
grant update (status) on public.project_tasks to authenticated;

revoke insert, update, delete on public.project_contributions from authenticated;
grant insert (project_id, user_id, kind, description, quantity, unit)
  on public.project_contributions to authenticated;
grant update (status) on public.project_contributions to authenticated;

revoke insert, update, delete on public.project_milestones from authenticated;
grant insert (project_id, title, description, target_date, sort_order)
  on public.project_milestones to authenticated;
grant update (status) on public.project_milestones to authenticated;

revoke insert, update on public.project_pledges from authenticated;
grant insert (project_id, user_id, amount, message)
  on public.project_pledges to authenticated;
grant update (amount, message) on public.project_pledges to authenticated;

revoke insert, update on public.debate_comments from authenticated;
grant insert (debate_id, column_community_id, user_id, body)
  on public.debate_comments to authenticated;
grant update (status) on public.debate_comments to authenticated;

revoke insert, update on public.project_comments from authenticated;
grant insert (project_id, user_id, body, parent_id)
  on public.project_comments to authenticated;
grant update (status) on public.project_comments to authenticated;

revoke insert, update, delete on public.reports from authenticated;
grant insert (reporter_id, target_type, target_id, reason)
  on public.reports to authenticated;
grant update (status) on public.reports to authenticated;
revoke insert, delete on public.community_requests from authenticated;
grant insert (
  user_id, requested_name, country, parent_community_id,
  requested_level, reason, evidence_url
) on public.community_requests to authenticated;
revoke update on public.community_requests from authenticated;
grant update (
  status, parent_community_id, resolution_note, created_community_id
) on public.community_requests to authenticated;
revoke insert, delete on public.organization_requests from authenticated;
grant insert (user_id, community_id, name, type, website, evidence_url, message)
  on public.organization_requests to authenticated;
revoke update on public.organization_requests from authenticated;
grant update (status)
  on public.organization_requests to authenticated;
revoke insert, update, delete on public.claim_uploads from authenticated;
grant insert (owner_id, path) on public.claim_uploads to authenticated;

revoke insert, update on public.budget_proposals from authenticated;
grant insert (budget_id, project_id, requested_amount)
  on public.budget_proposals to authenticated;
grant update (admitted_at, rejection_note)
  on public.budget_proposals to authenticated;

revoke insert, update on public.budget_votes from authenticated;
grant insert (budget_id, proposal_id, user_id, tokens)
  on public.budget_votes to authenticated;
grant update (tokens) on public.budget_votes to authenticated;

revoke insert, update on public.budget_reports from authenticated;
grant insert (
  budget_id, project_id, amount_spent, summary, evidence_url, author_id
) on public.budget_reports to authenticated;

revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Nuevas tablas: lectura mínima; toda mutación pasa por RPC estrechas.
revoke all on public.legal_document_versions,
  public.user_legal_acceptances,
  public.user_suspensions,
  public.moderation_appeals,
  public.moderation_audit_log
from anon, authenticated;
grant select on public.legal_document_versions to anon, authenticated;
grant select on public.user_legal_acceptances,
  public.user_suspensions,
  public.moderation_appeals
to authenticated;
-- La metadata interna no forma parte del contrato de moderación web. Incluso
-- minimizada queda reservada a jobs/operación confiable; la UI recibe sólo las
-- columnas necesarias para la trazabilidad visible.
grant select (
  id, moderator_id, action, target_type, target_id, created_at
) on public.moderation_audit_log to authenticated;
grant all on public.legal_document_versions,
  public.user_legal_acceptances,
  public.user_suspensions,
  public.moderation_appeals,
  public.moderation_audit_log
to service_role;

-- Registro automático de toda mutación hecha por una identidad moderadora.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'reports', 'communities', 'community_budgets', 'polls', 'debates',
    'claims', 'projects', 'debate_comments', 'content_sources',
    'community_requests', 'organization_requests', 'organizations',
    'institutional_responses', 'claim_events', 'project_milestones',
    'project_tasks', 'project_contributions', 'user_suspensions',
    'moderation_appeals', 'budget_proposals', 'organization_members'
  ] loop
    execute format('drop trigger if exists zz_moderation_audit on public.%I', v_table);
    execute format(
      'create trigger zz_moderation_audit after insert or update or delete on public.%I '
      'for each row execute function private.audit_moderation_change()', v_table
    );
  end loop;
end $$;

-- Funciones heredadas con `search_path = public` quedan con catálogos y
-- extensiones explícitos y pg_temp al final. Los helpers nuevos usan ''.
do $$
declare v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and p.proconfig @> array['search_path=public']
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, extensions, pg_temp',
      v_function.signature
    );
  end loop;
end $$;

-- Los REVOKE por esquema no pueden retirar el EXECUTE incorporado que PUBLIC
-- recibe por defecto; hace falta cerrarlo globalmente para funciones futuras.
alter default privileges
  revoke execute on functions from public, anon, authenticated, service_role;

-- Los helpers privados creados después de la primera pasada también quedan
-- sin ACL, incluso aunque el esquema ya carezca de USAGE para roles de API.
revoke execute on all functions in schema private
  from public, anon, authenticated, service_role;

-- Estas dos RPC se crean después de la matriz principal: primero se elimina el
-- EXECUTE implícito de PUBLIC y después se concede sólo a la sesión autenticada.
revoke execute on function public.can_upload_claim_object()
  from public, anon, authenticated, service_role;
revoke execute on function public.can_upload_avatar_object()
  from public, anon, authenticated, service_role;
grant execute on function public.can_upload_claim_object() to authenticated;
grant execute on function public.can_upload_avatar_object() to authenticated;
revoke execute on function public.set_comment_vote(uuid, smallint),
  public.set_project_pledge(uuid, numeric, text),
  public.set_community_visibility(uuid, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.set_comment_vote(uuid, smallint),
  public.set_project_pledge(uuid, numeric, text),
  public.set_community_visibility(uuid, boolean)
to authenticated;

commit;
