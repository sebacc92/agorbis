-- =============================================================================
-- Agorbis · 0024 · Generación de resúmenes de IA bajo demanda
-- -----------------------------------------------------------------------------
-- La llamada al proveedor de IA sucede fuera de Postgres (en una Edge Function),
-- por lo que no se mantiene una transacción abierta mientras espera la red. Un
-- lease persistente deduplica workers y RPC breves reclaman/finalizan el
-- trabajo. La cache es inmutable por fuente: una respuesta generada con fuentes
-- viejas nunca puede pisar la correspondiente a un hash más nuevo.
-- =============================================================================

begin;

-- Es una cache regenerable y las filas creadas antes de este contrato no se
-- pueden verificar contra la fuente actual. Se eliminan antes de convertir
-- `source_hash` y `prompt_version` en identidad persistente.
delete from public.ai_summaries;

-- Defensa para instalaciones que ya aplicaron una versión anterior de 0023.
-- Ni siquiera SELECT queda disponible por REST: sólo el backend confiable lee
-- la clave exacta después de calcular el hash con una sesión sujeta a RLS.
drop policy if exists ai_summaries_select_visible on public.ai_summaries;
revoke all on public.ai_summaries from public, anon, authenticated;
grant select on public.ai_summaries to service_role;

-- `source_hash` forma parte de la identidad del artefacto, no es sólo metadata.
-- Mantener versiones anteriores también evita la carrera “terminó último el
-- worker que leyó primero”.
alter table public.ai_summaries
  drop constraint ai_summaries_pkey;

alter table public.ai_summaries
  add constraint ai_summaries_pkey
  primary key (content_type, content_id, locale, source_hash, prompt_version);

create index ai_summaries_latest_idx
  on public.ai_summaries (content_type, content_id, locale, generated_at desc);

create table public.ai_summary_generation_jobs (
  content_type          text not null,
  content_id            uuid not null,
  locale                text not null,
  source_hash           text not null,
  prompt_version        integer not null,
  includes_poll_results boolean not null,
  status                text not null default 'pending',
  requested_by          uuid references public.profiles (id) on delete set null,
  lease_token           uuid,
  lease_expires_at      timestamptz,
  attempt_count         integer not null default 1,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  completed_at          timestamptz,

  primary key (content_type, content_id, locale, source_hash, prompt_version),
  constraint ai_summary_generation_jobs_type_chk
    check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint ai_summary_generation_jobs_locale_chk
    check (locale ~ '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'),
  constraint ai_summary_generation_jobs_source_hash_chk
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_summary_generation_jobs_prompt_version_chk
    check (prompt_version > 0),
  constraint ai_summary_generation_jobs_status_chk
    check (status in ('pending', 'completed', 'failed')),
  constraint ai_summary_generation_jobs_attempt_count_chk
    check (attempt_count > 0),
  constraint ai_summary_generation_jobs_last_error_chk
    check (last_error is null or char_length(last_error) between 1 and 120),
  constraint ai_summary_generation_jobs_poll_results_chk
    check (not includes_poll_results or content_type = 'poll'),
  constraint ai_summary_generation_jobs_lease_chk
    check (
      (status = 'pending' and lease_token is not null and lease_expires_at is not null)
      or (status <> 'pending' and lease_token is null and lease_expires_at is null)
    ),
  constraint ai_summary_generation_jobs_completed_chk
    check ((status = 'completed') = (completed_at is not null))
);

create index ai_summary_generation_jobs_lease_idx
  on public.ai_summary_generation_jobs (lease_expires_at)
  where status = 'pending';

create unique index ai_summary_generation_jobs_lease_token_idx
  on public.ai_summary_generation_jobs (lease_token)
  where lease_token is not null;

-- Sólo registra leases efectivamente adquiridos: los hits de cache y quienes
-- encuentran otro worker en curso no consumen el límite.
create table public.ai_summary_generation_events (
  id             bigint generated always as identity primary key,
  requested_by   uuid not null references public.profiles (id) on delete cascade,
  content_type   text not null,
  content_id     uuid not null,
  locale         text not null,
  source_hash    text not null,
  prompt_version integer not null,
  requested_at   timestamptz not null default now(),

  constraint ai_summary_generation_events_type_chk
    check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint ai_summary_generation_events_locale_chk
    check (locale ~ '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'),
  constraint ai_summary_generation_events_source_hash_chk
    check (source_hash ~ '^[0-9a-f]{64}$'),
  constraint ai_summary_generation_events_prompt_version_chk
    check (prompt_version > 0)
);

create index ai_summary_generation_events_user_time_idx
  on public.ai_summary_generation_events (requested_by, requested_at desc);

alter table public.ai_summary_generation_jobs enable row level security;
alter table public.ai_summary_generation_events enable row level security;

-- No hay acceso directo desde el navegador. Las tres RPC quedan reservadas al
-- backend con service_role; `begin_*` recibe el usuario ya autenticado por la
-- action y lo valida contra profiles antes de aplicar el rate limit.
revoke all on public.ai_summary_generation_jobs from public, anon, authenticated;
revoke all on public.ai_summary_generation_events from public, anon, authenticated;
revoke all on sequence public.ai_summary_generation_events_id_seq
  from public, anon, authenticated;

create or replace function public.begin_ai_summary_generation(
  p_requester_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_locale text,
  p_source_hash text,
  p_prompt_version integer,
  p_includes_poll_results boolean
)
returns table (
  decision text,
  lease_token uuid,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user                 uuid := p_requester_id;
  v_now                  timestamptz := clock_timestamp();
  v_cached_results       boolean;
  v_job_status           text;
  v_job_results          boolean;
  v_job_lease_expires_at timestamptz;
  v_recent_count         integer;
  v_oldest_request       timestamptz;
  v_lease_token          uuid;
  v_retry_after          integer;
begin
  if v_user is null
     or not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'GEOUNITY_AI_INVALID_REQUESTER'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_content_type not in ('poll', 'debate', 'claim', 'project')
     or p_content_id is null
     or p_locale is null
     or p_locale !~ '^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$'
     or p_source_hash is null
     or p_source_hash !~ '^[0-9a-f]{64}$'
     or p_prompt_version is null
     or p_prompt_version <= 0
     or p_includes_poll_results is null
     or (p_includes_poll_results and p_content_type <> 'poll') then
    raise exception 'GEOUNITY_AI_INVALID_REQUEST'
      using errcode = 'invalid_parameter_value';
  end if;

  if not public.content_exists(p_content_type, p_content_id) then
    raise exception 'GEOUNITY_AI_CONTENT_UNAVAILABLE'
      using errcode = 'no_data_found';
  end if;

  if p_includes_poll_results
     and not coalesce(public.can_see_poll_results(p_content_id, v_user), false) then
    raise exception 'GEOUNITY_AI_RESULTS_HIDDEN'
      using errcode = 'insufficient_privilege';
  end if;

  -- Serializa una única clave exacta incluso antes de que exista su fila.
  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'ai-summary',
    p_content_type,
    p_content_id::text,
    p_locale,
    p_source_hash,
    p_prompt_version::text
  ), 0));

  select s.includes_poll_results
    into v_cached_results
  from public.ai_summaries s
  where s.content_type = p_content_type
    and s.content_id = p_content_id
    and s.locale = p_locale
    and s.source_hash = p_source_hash
    and s.prompt_version = p_prompt_version;

  if found then
    if v_cached_results is distinct from p_includes_poll_results then
      raise exception 'GEOUNITY_AI_HASH_METADATA_MISMATCH'
        using errcode = 'invalid_parameter_value';
    end if;

    if v_cached_results
       and not coalesce(public.can_see_poll_results(p_content_id, v_user), false) then
      raise exception 'GEOUNITY_AI_RESULTS_HIDDEN'
        using errcode = 'insufficient_privilege';
    end if;

    return query select 'cached'::text, null::uuid, 0;
    return;
  end if;

  select j.status, j.includes_poll_results, j.lease_expires_at
    into v_job_status, v_job_results, v_job_lease_expires_at
  from public.ai_summary_generation_jobs j
  where j.content_type = p_content_type
    and j.content_id = p_content_id
    and j.locale = p_locale
    and j.source_hash = p_source_hash
    and j.prompt_version = p_prompt_version
  for update;

  if found and v_job_results is distinct from p_includes_poll_results then
    raise exception 'GEOUNITY_AI_HASH_METADATA_MISMATCH'
      using errcode = 'invalid_parameter_value';
  end if;

  if found
     and v_job_status = 'pending'
     and v_job_lease_expires_at > v_now then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (v_job_lease_expires_at - v_now)))::integer
    );
    return query select 'pending'::text, null::uuid, v_retry_after;
    return;
  end if;

  -- El lock por usuario vuelve autoritativo el límite ante solicitudes Edge
  -- concurrentes. Diez generaciones reales cada diez minutos; cache/pending no
  -- cuentan. Se conserva una hora para calcular y auditar sin crecimiento
  -- indefinido por usuarios activos.
  perform pg_advisory_xact_lock(
    hashtextextended('ai-summary-user:' || v_user::text, 0)
  );

  delete from public.ai_summary_generation_events e
  where e.requested_by = v_user
    and e.requested_at < v_now - interval '1 hour';

  select count(*)::integer, min(e.requested_at)
    into v_recent_count, v_oldest_request
  from public.ai_summary_generation_events e
  where e.requested_by = v_user
    and e.requested_at > v_now - interval '10 minutes';

  if v_recent_count >= 10 then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        v_oldest_request + interval '10 minutes' - v_now
      )))::integer
    );
    return query select 'rate_limited'::text, null::uuid, v_retry_after;
    return;
  end if;

  v_lease_token := gen_random_uuid();

  insert into public.ai_summary_generation_jobs (
    content_type,
    content_id,
    locale,
    source_hash,
    prompt_version,
    includes_poll_results,
    status,
    requested_by,
    lease_token,
    lease_expires_at,
    attempt_count,
    last_error,
    created_at,
    updated_at,
    completed_at
  ) values (
    p_content_type,
    p_content_id,
    p_locale,
    p_source_hash,
    p_prompt_version,
    p_includes_poll_results,
    'pending',
    v_user,
    v_lease_token,
    v_now + interval '5 minutes',
    1,
    null,
    v_now,
    v_now,
    null
  )
  on conflict (content_type, content_id, locale, source_hash, prompt_version) do update
    set includes_poll_results = excluded.includes_poll_results,
        status = 'pending',
        requested_by = excluded.requested_by,
        lease_token = excluded.lease_token,
        lease_expires_at = excluded.lease_expires_at,
        attempt_count = ai_summary_generation_jobs.attempt_count + 1,
        last_error = null,
        updated_at = excluded.updated_at,
        completed_at = null;

  insert into public.ai_summary_generation_events (
    requested_by,
    content_type,
    content_id,
    locale,
    source_hash,
    prompt_version,
    requested_at
  ) values (
    v_user,
    p_content_type,
    p_content_id,
    p_locale,
    p_source_hash,
    p_prompt_version,
    v_now
  );

  return query select 'generate'::text, v_lease_token, 0;
end;
$$;

create or replace function public.complete_ai_summary_generation(
  p_content_type text,
  p_content_id uuid,
  p_locale text,
  p_source_hash text,
  p_lease_token uuid,
  p_summary text,
  p_key_points jsonb,
  p_prompt_version integer,
  p_model text,
  p_includes_poll_results boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job            public.ai_summary_generation_jobs%rowtype;
  v_cached_results boolean;
  v_now            timestamptz := clock_timestamp();
begin
  if p_lease_token is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(concat_ws(
    ':',
    'ai-summary',
    p_content_type,
    p_content_id::text,
    p_locale,
    p_source_hash,
    p_prompt_version::text
  ), 0));

  select j.*
    into v_job
  from public.ai_summary_generation_jobs j
  where j.content_type = p_content_type
    and j.content_id = p_content_id
    and j.locale = p_locale
    and j.source_hash = p_source_hash
    and j.prompt_version = p_prompt_version
  for update;

  -- El vencimiento permite que otro request haga reclaim; no invalida por sí
  -- solo al worker. Si hubo reclaim, el token cambió bajo el mismo advisory
  -- lock y esta finalización devuelve false sin tocar la cache.
  if not found
     or v_job.status <> 'pending'
     or v_job.lease_token is distinct from p_lease_token then
    return false;
  end if;

  if v_job.includes_poll_results is distinct from p_includes_poll_results then
    update public.ai_summary_generation_jobs j
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'metadata_mismatch',
        updated_at = v_now
    where j.content_type = p_content_type
      and j.content_id = p_content_id
      and j.locale = p_locale
      and j.source_hash = p_source_hash
      and j.prompt_version = p_prompt_version;
    return false;
  end if;

  if not public.content_exists(p_content_type, p_content_id) then
    update public.ai_summary_generation_jobs j
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'content_unavailable',
        updated_at = v_now
    where j.content_type = p_content_type
      and j.content_id = p_content_id
      and j.locale = p_locale
      and j.source_hash = p_source_hash
      and j.prompt_version = p_prompt_version;
    return false;
  end if;

  select s.includes_poll_results
    into v_cached_results
  from public.ai_summaries s
  where s.content_type = p_content_type
    and s.content_id = p_content_id
    and s.locale = p_locale
    and s.source_hash = p_source_hash
    and s.prompt_version = p_prompt_version;

  if found and v_cached_results is distinct from p_includes_poll_results then
    update public.ai_summary_generation_jobs j
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        last_error = 'cache_metadata_mismatch',
        updated_at = v_now
    where j.content_type = p_content_type
      and j.content_id = p_content_id
      and j.locale = p_locale
      and j.source_hash = p_source_hash
      and j.prompt_version = p_prompt_version;
    return false;
  end if;

  -- La primera finalización válida gana. La fila exacta no se reescribe: mismo
  -- hash implica el mismo artefacto cacheado aunque un lease se haya reintentado.
  insert into public.ai_summaries (
    content_type,
    content_id,
    locale,
    summary,
    key_points,
    source_hash,
    prompt_version,
    model,
    includes_poll_results,
    generated_at
  ) values (
    p_content_type,
    p_content_id,
    p_locale,
    p_summary,
    p_key_points,
    p_source_hash,
    p_prompt_version,
    p_model,
    p_includes_poll_results,
    v_now
  )
  on conflict (content_type, content_id, locale, source_hash, prompt_version) do nothing;

  update public.ai_summary_generation_jobs j
  set status = 'completed',
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = v_now,
      completed_at = v_now
  where j.content_type = p_content_type
    and j.content_id = p_content_id
    and j.locale = p_locale
    and j.source_hash = p_source_hash
    and j.prompt_version = p_prompt_version;

  return true;
end;
$$;

create or replace function public.fail_ai_summary_generation(
  p_lease_token uuid,
  p_error_code text default 'generation_failed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if p_lease_token is null then
    return false;
  end if;

  update public.ai_summary_generation_jobs j
  set status = 'failed',
      lease_token = null,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(trim(p_error_code), ''), 'generation_failed'), 120),
      updated_at = clock_timestamp()
  where j.status = 'pending'
    and j.lease_token = p_lease_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
)
  from public, anon, authenticated;
grant execute on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
)
  to service_role;

revoke all on function public.complete_ai_summary_generation(
  text, uuid, text, text, uuid, text, jsonb, integer, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_ai_summary_generation(
  text, uuid, text, text, uuid, text, jsonb, integer, text, boolean
) to service_role;

revoke all on function public.fail_ai_summary_generation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_ai_summary_generation(uuid, text)
  to service_role;

comment on table public.ai_summary_generation_jobs is
  'Leases persistentes que deduplican una generación Edge por contenido, idioma y hash exacto.';
comment on table public.ai_summary_generation_events is
  'Eventos de leases adquiridos usados para el rate limit autoritativo por usuario.';
comment on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) is
  'Devuelve cached, generate, pending o rate_limited; generate incluye un lease de cinco minutos.';
comment on function public.complete_ai_summary_generation(
  text, uuid, text, text, uuid, text, jsonb, integer, text, boolean
) is
  'Finaliza un lease e inserta una cache inmutable por source_hash; sólo service_role.';
comment on function public.fail_ai_summary_generation(uuid, text) is
  'Libera un lease fallido sin persistir detalles sensibles del proveedor; sólo service_role.';

commit;
