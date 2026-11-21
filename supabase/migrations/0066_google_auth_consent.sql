-- Agorbis · 0066 · Decisión opcional, versionada y revocable para Google.
-- Preparación aditiva: NO publica avisos, NO inventa aceptaciones y NO modifica
-- los consentimientos generales, la participación o el acceso por correo.
begin;

create table public.google_auth_notice_versions (
  provider text not null default 'google' check (provider = 'google'),
  version text primary key check (version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content_hash_algorithm text not null default 'sha256-postgres-jsonb-v1'
    check (content_hash_algorithm = 'sha256-postgres-jsonb-v1'),
  content_snapshot jsonb not null,
  effective_at timestamptz,
  approved_at timestamptz,
  approval_reference text,
  is_current boolean not null default false,
  superseded_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint google_auth_notice_snapshot_check check (
    coalesce(
      jsonb_typeof(content_snapshot) = 'object'
      and jsonb_typeof(content_snapshot -> 'es') = 'object'
      and jsonb_typeof(content_snapshot -> 'en') = 'object'
      and jsonb_typeof(content_snapshot -> 'es' -> 'title') = 'string'
      and jsonb_typeof(content_snapshot -> 'en' -> 'title') = 'string'
      and length(btrim(content_snapshot -> 'es' ->> 'title')) > 0
      and length(btrim(content_snapshot -> 'en' ->> 'title')) > 0
      and jsonb_typeof(content_snapshot -> 'es' -> 'summary') = 'string'
      and jsonb_typeof(content_snapshot -> 'en' -> 'summary') = 'string'
      and jsonb_typeof(content_snapshot -> 'es' -> 'sections') = 'array'
      and jsonb_typeof(content_snapshot -> 'en' -> 'sections') = 'array'
      and jsonb_array_length(content_snapshot -> 'es' -> 'sections') > 0
      and jsonb_array_length(content_snapshot -> 'en' -> 'sections') > 0,
      false
    )
  ),
  constraint google_auth_notice_hash_check check (
    content_hash = encode(extensions.digest(content_snapshot::text, 'sha256'), 'hex')
  ),
  constraint google_auth_notice_approval_check check (
    (approved_at is null and approval_reference is null and not is_current)
    or (
      approved_at is not null and isfinite(approved_at)
      and approval_reference is not null
      and length(btrim(approval_reference)) between 10 and 500
      and effective_at is not null and isfinite(effective_at)
      and approved_at <= effective_at
    )
  ),
  constraint google_auth_notice_lifecycle_check check (
    (not is_current or (approved_at is not null and superseded_at is null))
    and (superseded_at is null or (
      not is_current and approved_at is not null
      and isfinite(superseded_at) and superseded_at >= effective_at
    ))
  ),
  constraint google_auth_notice_version_hash_unique unique (version, content_hash)
);
create unique index google_auth_notice_one_current_provider_idx
  on public.google_auth_notice_versions(provider) where is_current;

-- No existe RPC de publicación. Sólo una migración revisada puede aportar la
-- aprobación, su referencia y el snapshot completo. El hash se verifica en DB;
-- los consumidores usan el hash devuelto, sin reserializar JSON en JavaScript.
create function private.guard_google_auth_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.approved_at is not null then
      raise exception 'AGORBIS_GOOGLE_NOTICE_IMMUTABLE' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.provider is distinct from old.provider
      or new.version is distinct from old.version
      or new.content_hash is distinct from old.content_hash
      or new.content_hash_algorithm is distinct from old.content_hash_algorithm
      or new.content_snapshot is distinct from old.content_snapshot
      or new.created_at is distinct from old.created_at
      or (old.approved_at is not null and (
        new.approved_at is distinct from old.approved_at
        or new.approval_reference is distinct from old.approval_reference
        or new.effective_at is distinct from old.effective_at
      ))
      or (old.superseded_at is not null and (
        new.superseded_at is distinct from old.superseded_at or new.is_current
      )) then
      raise exception 'AGORBIS_GOOGLE_NOTICE_IMMUTABLE' using errcode = 'check_violation';
    end if;
  end if;
  if new.is_current and (
    new.approved_at is null or new.effective_at is null
    or new.approved_at > clock_timestamp() or new.effective_at > clock_timestamp()
  ) then
    raise exception 'AGORBIS_GOOGLE_NOTICE_NOT_APPROVED' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_google_auth_notice()
  from public, anon, authenticated, service_role;
create trigger google_auth_notice_guard
  before insert or update or delete on public.google_auth_notice_versions
  for each row execute function private.guard_google_auth_notice();

create table public.user_google_auth_consent_events (
  event_id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notice_version text,
  notice_hash text,
  decision text not null check (decision in ('accepted', 'withdrawn')),
  locale text,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint google_auth_consent_notice_fk foreign key (notice_version, notice_hash)
    references public.google_auth_notice_versions(version, content_hash) on delete restrict,
  constraint google_auth_consent_notice_pair_check check (
    (notice_version is null) = (notice_hash is null)
  ),
  constraint google_auth_consent_decision_check check (
    (decision = 'accepted' and notice_version is not null and locale is not null and locale in ('es', 'en'))
    or (decision = 'withdrawn' and locale is null)
  )
);
create index user_google_auth_consent_latest_idx
  on public.user_google_auth_consent_events(user_id, event_id desc);
create index user_google_auth_consent_notice_idx
  on public.user_google_auth_consent_events(notice_version, notice_hash);

-- La barrera avanza en CADA retiro, incluso si el evento ya es withdrawn.
-- Así una segunda retirada también invalida ceremonias abiertas después de la
-- primera, conservando la idempotencia de la prueba (sin eventos duplicados).
create table private.google_auth_consent_barriers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_withdrawn_at timestamptz not null
);
alter table public.google_auth_notice_versions enable row level security;
alter table public.user_google_auth_consent_events enable row level security;
alter table private.google_auth_consent_barriers enable row level security;
revoke all on public.google_auth_notice_versions,
  public.user_google_auth_consent_events, private.google_auth_consent_barriers
  from public, anon, authenticated, service_role;
revoke all on sequence public.user_google_auth_consent_events_event_id_seq
  from public, anon, authenticated, service_role;
grant select on public.user_google_auth_consent_events to authenticated;
-- El aviso público sólo sale por current_google_auth_notice(), que selecciona
-- columnas expresamente. La referencia interna de aprobación no sale por API.
create policy google_auth_consent_read_own
  on public.user_google_auth_consent_events for select to authenticated
  using (user_id = (select auth.uid()));

create function public.current_google_auth_notice()
returns jsonb language sql volatile security definer set search_path = '' as $$
  select jsonb_build_object(
    'provider', n.provider, 'version', n.version,
    'content_hash', n.content_hash, 'content_hash_algorithm', n.content_hash_algorithm,
    'content_snapshot', n.content_snapshot, 'effective_at', n.effective_at,
    'issued_at', clock_timestamp()
  ) from public.google_auth_notice_versions n
  where n.provider = 'google' and n.is_current and n.approved_at is not null
    and n.approved_at <= clock_timestamp() and n.effective_at <= clock_timestamp()
    and n.superseded_at is null;
$$;

create function public.my_google_auth_consent()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_notice public.google_auth_notice_versions%rowtype;
  v_latest public.user_google_auth_consent_events%rowtype;
  v_accepted_at timestamptz;
  v_withdrawn_at timestamptz;
  v_status text;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  select n.* into v_notice from public.google_auth_notice_versions n
  where n.provider = 'google' and n.is_current and n.approved_at is not null
    and n.approved_at <= statement_timestamp() and n.effective_at <= statement_timestamp()
    and n.superseded_at is null;
  select c.* into v_latest from public.user_google_auth_consent_events c
  where c.user_id = v_user order by c.event_id desc limit 1;
  select c.recorded_at into v_accepted_at from public.user_google_auth_consent_events c
  where c.user_id = v_user and c.decision = 'accepted' order by c.event_id desc limit 1;
  select b.last_withdrawn_at into v_withdrawn_at
  from private.google_auth_consent_barriers b where b.user_id = v_user;
  v_status := case
    when v_latest.decision = 'withdrawn' then 'withdrawn'
    when v_notice.version is null then 'unavailable'
    when v_latest.event_id is null then 'missing'
    when v_latest.decision = 'accepted' and v_latest.notice_version = v_notice.version
      and v_latest.notice_hash = v_notice.content_hash then 'accepted'
    else 'outdated'
  end;
  return jsonb_build_object(
    'provider', 'google', 'status', v_status,
    'current_version', v_notice.version, 'current_content_hash', v_notice.content_hash,
    'notice_version', v_latest.notice_version, 'notice_hash', v_latest.notice_hash,
    'accepted_at', v_accepted_at,
    'withdrawn_at', case when v_latest.decision = 'withdrawn' then v_latest.recorded_at else null end,
    'last_withdrawn_at', v_withdrawn_at, 'locale', v_latest.locale
  );
end;
$$;

create function public.grant_google_auth_consent(
  p_version text, p_content_hash text, p_locale text,
  p_expressly_accepted boolean, p_started_at timestamptz
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz;
  v_notice public.google_auth_notice_versions%rowtype;
  v_latest public.user_google_auth_consent_events%rowtype;
  v_withdrawn_at timestamptz;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  if p_expressly_accepted is distinct from true or p_locale is null
    or p_locale not in ('es', 'en') or p_version is null or p_content_hash is null then
    raise exception 'AGORBIS_GOOGLE_CONSENT_REQUIRED' using errcode = 'check_violation';
  end if;
  -- Misma fila/bloqueo en grant y withdraw: una devolución OAuth no puede
  -- intercalarse con el retiro y sobrescribir su barrera temporal.
  perform 1 from public.profiles where id = v_user for update;
  if not found then
    raise exception 'GEOUNITY_AUTH_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  v_now := clock_timestamp();
  if p_started_at is null or not isfinite(p_started_at)
    or p_started_at > v_now or p_started_at < v_now - interval '10 minutes' then
    raise exception 'AGORBIS_GOOGLE_CONSENT_EXPIRED' using errcode = 'check_violation';
  end if;
  select b.last_withdrawn_at into v_withdrawn_at
  from private.google_auth_consent_barriers b where b.user_id = v_user;
  if v_withdrawn_at is not null and p_started_at <= v_withdrawn_at then
    raise exception 'AGORBIS_GOOGLE_CONSENT_WITHDRAWN' using errcode = 'check_violation';
  end if;
  select n.* into v_notice from public.google_auth_notice_versions n
  where n.provider = 'google' and n.version = p_version and n.content_hash = p_content_hash
    and n.is_current and n.approved_at is not null and n.approved_at <= v_now
    and n.effective_at <= v_now and n.superseded_at is null for share;
  if not found then
    raise exception 'AGORBIS_GOOGLE_NOTICE_NOT_CURRENT' using errcode = 'object_not_in_prerequisite_state';
  end if;
  select c.* into v_latest from public.user_google_auth_consent_events c
  where c.user_id = v_user order by c.event_id desc limit 1;
  if v_latest.decision is distinct from 'accepted'
    or v_latest.notice_version is distinct from v_notice.version
    or v_latest.notice_hash is distinct from v_notice.content_hash then
    -- Impide crecimiento ilimitado alternando aceptar/retirar. Las repeticiones
    -- idempotentes no consumen cupo y el retiro permanece siempre disponible.
    perform private.consume_window_limit('google-auth-consent-grant', v_user, 30, interval '1 hour');
    insert into public.user_google_auth_consent_events(user_id, notice_version, notice_hash, decision, locale)
    values (v_user, v_notice.version, v_notice.content_hash, 'accepted', p_locale);
  end if;
  return public.my_google_auth_consent();
end;
$$;

create function public.withdraw_google_auth_consent()
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_latest public.user_google_auth_consent_events%rowtype;
  v_at timestamptz;
begin
  if v_user is null then
    raise exception 'GEOUNITY_AUTH_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  perform 1 from public.profiles where id = v_user for update;
  if not found then
    raise exception 'GEOUNITY_AUTH_REQUIRED' using errcode = 'insufficient_privilege';
  end if;
  v_at := clock_timestamp();
  insert into private.google_auth_consent_barriers(user_id, last_withdrawn_at)
  values (v_user, v_at)
  on conflict (user_id) do update set last_withdrawn_at = greatest(
    excluded.last_withdrawn_at, private.google_auth_consent_barriers.last_withdrawn_at
  );
  select c.* into v_latest from public.user_google_auth_consent_events c
  where c.user_id = v_user order by c.event_id desc limit 1;
  if v_latest.decision is distinct from 'withdrawn' then
    insert into public.user_google_auth_consent_events(user_id, notice_version, notice_hash, decision, recorded_at)
    values (v_user, v_latest.notice_version, v_latest.notice_hash, 'withdrawn', v_at);
  end if;
  return public.my_google_auth_consent();
end;
$$;

revoke all on function public.current_google_auth_notice(), public.my_google_auth_consent(),
  public.grant_google_auth_consent(text, text, text, boolean, timestamptz),
  public.withdraw_google_auth_consent() from public, anon, authenticated, service_role;
grant execute on function public.current_google_auth_notice() to anon, authenticated;
grant execute on function public.my_google_auth_consent(),
  public.grant_google_auth_consent(text, text, text, boolean, timestamptz),
  public.withdraw_google_auth_consent() to authenticated;

comment on table public.google_auth_notice_versions is
  'Avisos opcionales Google: snapshots ES/EN con hash DB, aprobación explícita y como máximo uno vigente. La migración 0066 no inserta ninguno.';
comment on table public.user_google_auth_consent_events is
  'Prueba de decisión propia append-only por RPC: sin tokens, IP, email ni user_id aportado por cliente. Se borra en cascada con el perfil.';
comment on function public.grant_google_auth_consent(text, text, text, boolean, timestamptz) is
  'p_started_at debe ser issued_at obtenido al POST OAuth y ligado a nonce/cookie del servidor; no es una fecha de aceptación aportada por el cliente. Retiro posterior invalida la ceremonia.';

commit;
