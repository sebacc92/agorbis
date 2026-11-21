-- =============================================================================
-- Agorbis · 0059 · Consentimiento versionado para participacion civica sensible
-- -----------------------------------------------------------------------------
-- Separa esta decision de Terminos, Privacidad, Normas comunitarias y del aviso
-- de transferencias internacionales. La aceptacion solo puede registrarse con
-- una sesion autenticada, para auth.uid(), sobre una version y hash exactos.
--
-- IMPORTANTE PARA LA REVISION PREVIA A PRODUCCION
-- Esta migracion crea el mecanismo y activa un gate fail-closed, pero NO publica
-- una version del aviso ni inventa su texto. Si se aplicara tal como esta, toda
-- participacion quedaria bloqueada hasta que otra migracion revisada insertara
-- exactamente una version current con el snapshot aprobado. No hay backfill de
-- aceptaciones ni una via administrativa para aceptar en nombre de una persona.
-- =============================================================================

begin;

-- La cobertura del gate depende del inventario autoritativo instalado por 0039
-- y de los refinamientos posteriores. Un esquema inesperado aborta en vez de
-- dejar acciones nuevas fuera del consentimiento por accidente.
do $migration_guard$
declare
  v_expected_gate_tables constant text[] := array[
    'budget_proposals',
    'budget_reports',
    'claim_events',
    'claim_supports',
    'claim_uploads',
    'claims',
    'comment_votes',
    'community_budgets',
    'community_requests',
    'community_visibility',
    'content_relations',
    'content_sources',
    'debate_comments',
    'debates',
    'follows',
    'institutional_responses',
    'organization_requests',
    'polls',
    'project_comments',
    'project_contributions',
    'project_milestones',
    'project_pledges',
    'project_tasks',
    'projects',
    'reports'
  ]::text[];
  v_actual_gate_tables text[];
begin
  if (select count(*) from public.legal_document_versions where is_current) <> 3
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'privacy'
         and version = '2026-08-25.1'
         and is_current
     )
     or (select count(*) from public.international_transfer_notice_versions where is_current) <> 1
     or not exists (
       select 1
       from public.international_transfer_notice_versions
       where version = '2026-08-25.1'
         and is_current
         and superseded_at is null
     )
     or to_regprocedure('private.has_current_legal_acceptance(uuid)') is null
     or to_regprocedure('private.has_current_international_transfer_consent(uuid)') is null
     or to_regprocedure('private.assert_can_participate(uuid)') is null
     or to_regprocedure('private.guard_participation()') is null
     or to_regprocedure('public.can_participate()') is null
     or to_regprocedure('public.my_legal_status()') is null
     or to_regclass('public.sensitive_participation_notice_versions') is not null
     or to_regclass('public.user_sensitive_participation_consents') is not null then
    raise exception 'AGORBIS_0059_PRECONDITION_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  select array_agg(c.relname order by c.relname)
    into v_actual_gate_tables
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and t.tgname = 'aa_participation_gate'
    and not t.tgisinternal;

  if v_actual_gate_tables is distinct from v_expected_gate_tables then
    raise exception 'AGORBIS_0059_PARTICIPATION_GATE_INVENTORY_MISMATCH'
      using errcode = 'object_not_in_prerequisite_state',
            detail = format(
              'expected=%s actual=%s',
              v_expected_gate_tables,
              coalesce(v_actual_gate_tables, '{}'::text[])
            );
  end if;
end;
$migration_guard$;

create table public.sensitive_participation_notice_versions (
  version text primary key,
  content_hash text not null,
  content_snapshot jsonb not null,
  content_hash_algorithm text not null default 'sha256-json-stringify-v1',
  scope_catalog_version text not null,
  scope_codes text[] not null,
  effective_at timestamptz not null,
  superseded_at timestamptz,
  is_current boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  constraint sensitive_participation_notice_version_chk
    check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  constraint sensitive_participation_notice_hash_chk
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint sensitive_participation_notice_snapshot_chk check (
    jsonb_typeof(content_snapshot) = 'object'
    and content_snapshot ? 'es'
    and content_snapshot ? 'en'
    and jsonb_typeof(content_snapshot -> 'es' -> 'sections') = 'array'
    and jsonb_typeof(content_snapshot -> 'en' -> 'sections') = 'array'
  ),
  constraint sensitive_participation_notice_hash_algorithm_chk
    check (content_hash_algorithm = 'sha256-json-stringify-v1'),
  constraint sensitive_participation_scope_catalog_version_chk
    check (scope_catalog_version = 'agorbis-sensitive-participation-v1'),
  -- Catalogo derivado de las superficies reales. Cambiar o agregar un scope
  -- requiere una nueva migracion y una nueva version del aviso.
  constraint sensitive_participation_scope_codes_chk check (
    scope_codes = array[
      'civic_content_publication',
      'civic_opinion_and_debate',
      'civic_support_and_commitments',
      'claims_and_evidence',
      'poll_and_budget_ballots',
      'participation_membership_visibility',
      'safety_reports_and_civic_requests'
    ]::text[]
  ),
  constraint sensitive_participation_notice_lifecycle_chk check (
    (is_current and superseded_at is null)
    or (
      not is_current
      and superseded_at is not null
      and superseded_at >= effective_at
    )
  ),
  constraint sensitive_participation_notice_version_hash_scope_uniq
    unique (version, content_hash, scope_catalog_version)
);

create unique index sensitive_participation_notice_current_idx
  on public.sensitive_participation_notice_versions ((is_current))
  where is_current;

comment on table public.sensitive_participation_notice_versions is
  'Snapshots inmutables y versionados del aviso de participacion civica que puede revelar datos sensibles. 0059 no publica texto: una version current requiere revision separada.';
comment on column public.sensitive_participation_notice_versions.scope_codes is
  'Catalogo cerrado de superficies cubiertas. Su alteracion exige version nueva y migracion revisada.';

create table public.user_sensitive_participation_consents (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  notice_version text not null,
  notice_hash text not null,
  scope_catalog_version text not null,
  decision text not null,
  locale text,
  source text not null,
  recorded_at timestamptz not null default statement_timestamp(),
  constraint user_sensitive_participation_notice_fk
    foreign key (notice_version, notice_hash, scope_catalog_version)
    references public.sensitive_participation_notice_versions (
      version,
      content_hash,
      scope_catalog_version
    )
    on delete restrict,
  constraint user_sensitive_participation_decision_locale_chk check (
    (decision = 'accepted' and locale in ('es', 'en'))
    or (decision = 'withdrawn' and locale is null)
  ),
  constraint user_sensitive_participation_source_chk
    check (
      (decision = 'accepted' and source = 'participation_gate')
      or (decision = 'withdrawn' and source = 'participation_withdrawal')
    )
);

create index user_sensitive_participation_consents_user_idx
  on public.user_sensitive_participation_consents (
    user_id,
    notice_version,
    event_id desc
  );
create index user_sensitive_participation_consents_notice_idx
  on public.user_sensitive_participation_consents (
    notice_version,
    notice_hash,
    scope_catalog_version,
    user_id,
    event_id desc
  );

comment on table public.user_sensitive_participation_consents is
  'Eventos append-only de aceptacion o retiro para version, hash y catalogo exactos; nunca se completan por backfill.';

alter table public.sensitive_participation_notice_versions enable row level security;
alter table public.user_sensitive_participation_consents enable row level security;

create policy sensitive_participation_notice_versions_select_all
  on public.sensitive_participation_notice_versions
  for select using (true);

create policy user_sensitive_participation_consents_select_own
  on public.user_sensitive_participation_consents
  for select to authenticated
  using (user_id = auth.uid());

create function private.has_current_sensitive_participation_consent(
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and (
      select count(*) = 1
      from public.sensitive_participation_notice_versions n
      where n.is_current
        and n.effective_at <= now()
        and n.scope_catalog_version = 'agorbis-sensitive-participation-v1'
    )
    and coalesce((
      select c.decision = 'accepted'
      from public.sensitive_participation_notice_versions n
      join public.user_sensitive_participation_consents c
        on c.user_id = p_user
       and c.notice_version = n.version
       and c.notice_hash = n.content_hash
       and c.scope_catalog_version = n.scope_catalog_version
      where n.is_current
        and n.effective_at <= now()
        and n.scope_catalog_version = 'agorbis-sensitive-participation-v1'
      order by c.event_id desc
      limit 1
    ), false);
$$;

-- Mantiene un unico punto de autorizacion para RPCs, RLS, uploads y los 25
-- triggers aa_participation_gate ya inventariados. Sin version current, devuelve
-- false: la ausencia de configuracion nunca habilita participacion.
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
    )
    and private.has_current_international_transfer_consent(p_user)
    and private.has_current_sensitive_participation_consent(p_user);
$$;

create function public.grant_current_sensitive_participation_consent(
  p_version text,
  p_content_hash text,
  p_expressly_accepted boolean,
  p_locale text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_notice public.sensitive_participation_notice_versions%rowtype;
  v_at timestamptz;
  v_latest_decision text;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if not coalesce(p_expressly_accepted, false) then
    raise exception 'AGORBIS_SENSITIVE_PARTICIPATION_CONSENT_REQUIRED'
      using errcode = 'check_violation';
  end if;
  if p_locale is null or p_locale not in ('es', 'en') then
    raise exception 'AGORBIS_SENSITIVE_PARTICIPATION_LOCALE_INVALID'
      using errcode = 'check_violation';
  end if;

  select n.* into v_notice
  from public.sensitive_participation_notice_versions n
  where n.version = p_version
    and n.content_hash = p_content_hash
    and n.scope_catalog_version = 'agorbis-sensitive-participation-v1'
    and n.is_current
    and n.effective_at <= now();
  if not found then
    raise exception 'AGORBIS_SENSITIVE_PARTICIPATION_NOTICE_NOT_CURRENT'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sensitive-participation-consent:' || v_user::text || ':' || v_notice.version,
    0
  ));

  select c.decision, c.recorded_at
    into v_latest_decision, v_at
  from public.user_sensitive_participation_consents c
  where c.user_id = v_user
    and c.notice_version = v_notice.version
    and c.notice_hash = v_notice.content_hash
    and c.scope_catalog_version = v_notice.scope_catalog_version
  order by c.event_id desc
  limit 1;
  if found and v_latest_decision = 'accepted' then
    return v_at;
  end if;

  insert into public.user_sensitive_participation_consents (
    user_id,
    notice_version,
    notice_hash,
    scope_catalog_version,
    decision,
    locale,
    source
  ) values (
    v_user,
    v_notice.version,
    v_notice.content_hash,
    v_notice.scope_catalog_version,
    'accepted',
    p_locale,
    'participation_gate'
  )
  returning recorded_at into v_at;
  return v_at;
end;
$$;

-- Retirar esta decision deja la cuenta en modo lectura: no borra contenido ni
-- afecta la licitud previa. La evidencia conserva el instante de retiro y una
-- accion afirmativa posterior puede habilitar otra vez la misma version.
create function public.withdraw_current_sensitive_participation_consent(
  p_version text,
  p_content_hash text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_withdrawn_at timestamptz;
  v_latest_decision text;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1
    from public.sensitive_participation_notice_versions n
    where n.version = p_version
      and n.content_hash = p_content_hash
      and n.scope_catalog_version = 'agorbis-sensitive-participation-v1'
      and n.is_current
      and n.effective_at <= now()
  ) then
    raise exception 'AGORBIS_SENSITIVE_PARTICIPATION_NOTICE_NOT_CURRENT'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'sensitive-participation-consent:' || v_user::text || ':' || p_version,
    0
  ));

  select c.decision, c.recorded_at
    into v_latest_decision, v_withdrawn_at
  from public.user_sensitive_participation_consents c
  where c.user_id = v_user
    and c.notice_version = p_version
    and c.notice_hash = p_content_hash
    and c.scope_catalog_version = 'agorbis-sensitive-participation-v1'
  order by c.event_id desc
  limit 1;

  if v_withdrawn_at is null then
    raise exception 'AGORBIS_SENSITIVE_PARTICIPATION_CONSENT_NOT_FOUND'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_latest_decision = 'withdrawn' then
    return v_withdrawn_at;
  end if;

  insert into public.user_sensitive_participation_consents (
    user_id,
    notice_version,
    notice_hash,
    scope_catalog_version,
    decision,
    locale,
    source
  ) values (
    v_user,
    p_version,
    p_content_hash,
    'agorbis-sensitive-participation-v1',
    'withdrawn',
    null,
    'participation_withdrawal'
  )
  returning recorded_at into v_withdrawn_at;
  return v_withdrawn_at;
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
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', d.document_type,
        'version', d.version,
        'effective_at', d.effective_at,
        'minimum_age', d.minimum_age,
        'accepted', a.user_id is not null
          and (d.minimum_age = 0 or a.minimum_age_attested),
        'accepted_at', a.accepted_at
      ) order by d.document_type)
      from public.legal_document_versions d
      left join public.user_legal_acceptances a
        on a.user_id = auth.uid()
       and a.document_type = d.document_type
       and a.version = d.version
      where d.is_current and d.effective_at <= now()
    ), '[]'::jsonb),
    'international_transfer_consent', (
      select jsonb_build_object(
        'version', n.version,
        'content_hash', n.content_hash,
        'content_hash_algorithm', n.content_hash_algorithm,
        'provider_register_version', n.provider_register_version,
        'effective_at', n.effective_at,
        'status', case when c.user_id is null then 'missing' else 'accepted' end,
        'accepted_at', c.accepted_at,
        'locale', c.locale,
        'source', c.source
      )
      from public.international_transfer_notice_versions n
      left join public.user_international_transfer_consents c
        on c.user_id = auth.uid()
       and c.notice_version = n.version
       and c.notice_hash = n.content_hash
      where n.is_current and n.effective_at <= now()
    ),
    'sensitive_participation_consent', coalesce((
      select jsonb_build_object(
        'version', n.version,
        'content_hash', n.content_hash,
        'content_hash_algorithm', n.content_hash_algorithm,
        'scope_catalog_version', n.scope_catalog_version,
        'scope_codes', to_jsonb(n.scope_codes),
        'effective_at', n.effective_at,
        'status', case
          when c.event_id is null then 'missing'
          else c.decision
        end,
        'decision_at', c.recorded_at,
        'accepted_at', case
          when c.decision = 'accepted' then c.recorded_at
          else null
        end,
        'withdrawn_at', case
          when c.decision = 'withdrawn' then c.recorded_at
          else null
        end,
        'locale', c.locale,
        'source', c.source
      )
      from public.sensitive_participation_notice_versions n
      left join lateral (
        select event.*
        from public.user_sensitive_participation_consents event
        where event.user_id = auth.uid()
          and event.notice_version = n.version
          and event.notice_hash = n.content_hash
          and event.scope_catalog_version = n.scope_catalog_version
        order by event.event_id desc
        limit 1
      ) c on true
      where n.is_current and n.effective_at <= now()
    ), jsonb_build_object(
      'scope_catalog_version', 'agorbis-sensitive-participation-v1',
      'status', 'not_configured'
    ))
  );
$$;

revoke all on function private.has_current_sensitive_participation_consent(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.grant_current_sensitive_participation_consent(
  text, text, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function public.withdraw_current_sensitive_participation_consent(
  text, text
) from public, anon, authenticated, service_role;

grant execute on function public.grant_current_sensitive_participation_consent(
  text, text, boolean, text
) to authenticated;
grant execute on function public.withdraw_current_sensitive_participation_consent(
  text, text
) to authenticated;

revoke all on public.sensitive_participation_notice_versions,
  public.user_sensitive_participation_consents
from public, anon, authenticated, service_role;
revoke all on sequence
  public.user_sensitive_participation_consents_event_id_seq
from public, anon, authenticated, service_role;
grant select on public.sensitive_participation_notice_versions
to anon, authenticated, service_role;
grant select on public.user_sensitive_participation_consents
to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
