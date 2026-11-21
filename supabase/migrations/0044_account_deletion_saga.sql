-- =============================================================================
-- Agorbis · 0044 · Borrado de cuenta reintentable
-- -----------------------------------------------------------------------------
-- Auth, Postgres y Storage no comparten una transacción. La baja se registra
-- antes de borrar Auth, congela nuevas mutaciones y deja una outbox privada que
-- un worker puede retomar. Nunca se borra evidencia ya publicada: sólo avatar
-- y borradores de reclamo todavía no adjuntados.
-- =============================================================================

begin;

create table if not exists private.account_deletion_jobs (
  user_id uuid primary key,
  pending_claim_paths text[] not null default '{}',
  requested_at timestamptz not null default statement_timestamp(),
  auth_deleted_at timestamptz,
  cleanup_started_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  dead_lettered_at timestamptz,
  completed_at timestamptz,
  constraint account_deletion_paths_cap_chk
    check (cardinality(pending_claim_paths) <= 5000),
  constraint account_deletion_attempts_chk check (attempt_count >= 0),
  constraint account_deletion_error_length_chk
    check (last_error is null or char_length(last_error) <= 500),
  constraint account_deletion_timestamps_chk check (
    (auth_deleted_at is null or auth_deleted_at >= requested_at)
    and (completed_at is null or auth_deleted_at is not null)
  ),
  constraint account_deletion_terminal_state_chk check (
    completed_at is null or dead_lettered_at is null
  )
);

create index if not exists account_deletion_jobs_queue_idx
  on private.account_deletion_jobs (
    completed_at, cleanup_started_at, requested_at, user_id
  );

revoke all on private.account_deletion_jobs
from public, anon, authenticated, service_role;

-- La reserva DB ocurre antes de la llamada HTTP a Storage. Este sello completa
-- el handshake después de que el objeto existe; una baja concurrente impide el
-- finalize y obliga a la action a retirar ese objeto.
alter table public.claim_uploads
  add column if not exists upload_completed_at timestamptz;
update public.claim_uploads u
set upload_completed_at = coalesce(u.attached_at, u.created_at)
where u.upload_completed_at is null
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'claims' and o.name = u.path
  );
alter table public.claim_uploads
  add constraint claim_uploads_completed_before_attach_chk check (
    claim_id is null or upload_completed_at is not null
  ) not valid;
alter table public.claim_uploads
  validate constraint claim_uploads_completed_before_attach_chk;

create or replace function public.reserve_claim_upload(
  p_owner uuid,
  p_path text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_pending integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if p_path !~ '^pending/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    raise exception 'GEOUNITY_INVALID_UPLOAD_PATH'
      using errcode = 'check_violation';
  end if;

  -- Mismo fence que prepare_account_deletion y, crucialmente, antes del
  -- assert: quien espere detrás de una baja vuelve a observar su outbox.
  perform pg_advisory_xact_lock(
    hashtextextended('claim-uploads:' || p_owner::text, 0)
  );
  perform private.assert_can_participate(p_owner);

  select count(*) into v_pending
  from public.claim_uploads u
  where u.owner_id = p_owner
    and u.claim_id is null
    and u.cleanup_started_at is null;
  if v_pending >= 12 then
    raise exception 'GEOUNITY_TOO_MANY_PENDING_UPLOADS'
      using errcode = 'program_limit_exceeded';
  end if;
  perform private.consume_window_limit(
    'claim-uploads-hour', p_owner, 20, interval '1 hour'
  );

  insert into public.claim_uploads (
    owner_id, path, reservation_token, upload_completed_at
  ) values (
    p_owner, p_path, gen_random_uuid(), null
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finalize_claim_upload(
  p_owner uuid,
  p_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_updated integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('claim-uploads:' || p_owner::text, 0)
  );
  perform private.assert_can_participate(p_owner);
  update public.claim_uploads u
  set upload_completed_at = statement_timestamp()
  where u.owner_id = p_owner
    and u.path = p_path
    and u.claim_id is null
    and u.cleanup_started_at is null
    and u.reservation_token is not null
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'claims' and o.name = u.path
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- El formulario conserva paths entre preview y confirmación, pero sólo el
-- handshake server-side demuestra que el objeto terminó de escribirse antes
-- de una posible baja. Se redefine el trigger existente para exigir el sello.
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
begin
  if tg_op = 'UPDATE' then
    if new.image_paths is distinct from old.image_paths
       or new.image_urls is distinct from old.image_urls
       or new.image_url is distinct from old.image_url then
      raise exception 'GEOUNITY_CLAIM_IMAGES_IMMUTABLE'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

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

  perform 1
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.cleanup_started_at is null
    and u.upload_completed_at is not null
    and u.path = any(new.image_paths)
  for update;

  select count(*) into v_tracked
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.cleanup_started_at is null
    and u.upload_completed_at is not null
    and u.path = any(new.image_paths);
  select count(*) into v_objects
  from storage.objects o
  where o.bucket_id = 'claims' and o.name = any(new.image_paths);
  if v_tracked <> cardinality(new.image_paths)
     or v_objects <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID'
      using errcode = 'check_violation';
  end if;

  select
    array_agg(
      new.id::text || '/' || regexp_replace(p, '^.*/', '') order by ord
    ),
    array_agg(
      '/media/reclamos/' || new.id::text || '/' || regexp_replace(p, '^.*/', '')
      order by ord
    )
  into new.image_paths, new.image_urls
  from unnest(new.image_paths) with ordinality as paths(p, ord);
  new.image_url := new.image_urls[1];
  return new;
end;
$$;

create or replace function private.account_deletion_is_pending(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from private.account_deletion_jobs j
    where j.user_id = p_user and j.completed_at is null
  ), false);
$$;

-- Congelar las mutaciones evita que una publicación concurrente aparezca entre
-- el inventario y deleteUser(). Un fallo del proveedor cancela la solicitud;
-- una caída del proceso queda segura y el mismo usuario puede reintentarla.
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
  if private.account_deletion_is_pending(p_user) then
    raise exception 'AGORBIS_ACCOUNT_DELETION_PENDING'
      using errcode = 'object_not_in_prerequisite_state';
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
    and not private.account_deletion_is_pending(auth.uid())
    and not private.active_suspension(auth.uid())
    and private.has_current_legal_acceptance(auth.uid());
$$;

create or replace function public.prepare_account_deletion(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_paths text[];
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('account-delete:' || p_user::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('claim-uploads:' || p_user::text, 0));
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return false;
  end if;

  select count(*), coalesce(array_agg(u.path order by u.path), '{}')
    into v_count, v_paths
  from public.claim_uploads u
  where u.owner_id = p_user and u.claim_id is null;
  if v_count > 5000 then
    raise exception 'AGORBIS_ACCOUNT_DELETION_INVENTORY_LIMIT'
      using errcode = 'program_limit_exceeded';
  end if;

  insert into private.account_deletion_jobs (
    user_id, pending_claim_paths, requested_at, auth_deleted_at,
    cleanup_started_at, last_error, dead_lettered_at, completed_at
  ) values (
    p_user, v_paths, statement_timestamp(), null, null, null, null, null
  )
  on conflict (user_id) do update
    set pending_claim_paths = (
          select coalesce(array_agg(distinct path order by path), '{}')
          from unnest(
            private.account_deletion_jobs.pending_claim_paths
            || excluded.pending_claim_paths
          ) paths(path)
        ),
        requested_at = statement_timestamp(),
        auth_deleted_at = null,
        cleanup_started_at = null,
        attempt_count = 0,
        last_error = null,
        dead_lettered_at = null,
        completed_at = null;
  return true;
end;
$$;

create or replace function public.cancel_account_deletion(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return false;
  end if;
  delete from private.account_deletion_jobs j
  where j.user_id = p_user and j.auth_deleted_at is null;
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.mark_account_auth_deleted(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_updated integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from auth.users u where u.id = p_user) then
    return false;
  end if;
  update private.account_deletion_jobs j
  set auth_deleted_at = coalesce(j.auth_deleted_at, statement_timestamp()),
      last_error = null
  where j.user_id = p_user and j.completed_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- Devuelve trabajos con lease. Los paths se vuelven a resolver contra Storage
-- y contra claim_uploads: si una carrera alcanzó a publicar una foto, deja de
-- ser candidata y nunca se elimina como parte de la baja.
create or replace function public.claim_account_deletion_jobs(
  p_user uuid default null,
  p_limit integer default 10
)
returns table (
  user_id uuid,
  avatar_paths text[],
  pending_claim_paths text[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job record;
  v_avatars text[];
  v_pending text[];
  v_all_pending text[];
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  delete from private.account_deletion_jobs j
  where j.completed_at < statement_timestamp() - interval '30 days';

  -- Si Auth sigue existiendo, la respuesta incierta del proveedor no puede
  -- congelar la cuenta para siempre. Repetir la baja refresca requested_at;
  -- si se abandona, el fence se libera automáticamente después de una hora.
  delete from private.account_deletion_jobs j
  where j.completed_at is null
    and j.auth_deleted_at is null
    and j.cleanup_started_at is null
    and j.requested_at < statement_timestamp() - interval '1 hour'
    and exists (select 1 from auth.users u where u.id = j.user_id);

  -- Veinte fallos requieren intervención humana. El job y sus paths se
  -- conservan; retry_account_deletion_job lo reactiva después de resolver la
  -- causa y las métricas del cron hacen visible el dead-letter.
  update private.account_deletion_jobs j
  set dead_lettered_at = coalesce(j.dead_lettered_at, statement_timestamp()),
      cleanup_started_at = null,
      last_error = coalesce(j.last_error, 'retry_limit_reached')
  where j.completed_at is null
    and j.dead_lettered_at is null
    and j.attempt_count >= 20
    and (
      j.cleanup_started_at is null
      or j.cleanup_started_at < statement_timestamp() - interval '15 minutes'
    );

  for v_job in
    select j.user_id, j.pending_claim_paths
    from private.account_deletion_jobs j
    where j.completed_at is null
      and j.dead_lettered_at is null
      and j.attempt_count < 20
      and (p_user is null or j.user_id = p_user)
      and not exists (select 1 from auth.users u where u.id = j.user_id)
      -- Una request de Storage que ya superó RLS puede terminar después del
      -- commit de deleteUser. La gracia cubre requests en vuelo y el listado
      -- dinámico recoge sus objetos antes de completar la outbox.
      and coalesce(j.auth_deleted_at, j.requested_at)
          < statement_timestamp() - interval '15 minutes'
      and (
        j.cleanup_started_at is null
        or j.cleanup_started_at < statement_timestamp() - interval '15 minutes'
      )
    order by j.requested_at, j.user_id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  loop
    select coalesce(array_agg(o.name order by o.name), '{}')
      into v_avatars
    from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name like v_job.user_id::text || '/%';

    select coalesce(array_agg(distinct candidate.path order by candidate.path), '{}')
      into v_all_pending
    from (
      select path from unnest(v_job.pending_claim_paths) paths(path)
      union
      select u.path
      from public.claim_uploads u
      join storage.objects o
        on o.bucket_id = 'claims' and o.name = u.path
      where u.claim_id is null
        and (
          u.owner_id = v_job.user_id
          or o.owner = v_job.user_id
          or o.owner_id = v_job.user_id::text
        )
    ) candidate;

    update private.account_deletion_jobs j
    set pending_claim_paths = v_all_pending,
        auth_deleted_at = coalesce(j.auth_deleted_at, statement_timestamp()),
        cleanup_started_at = statement_timestamp(),
        attempt_count = j.attempt_count + 1,
        last_error = null,
        dead_lettered_at = null
    where j.user_id = v_job.user_id;

    select coalesce(array_agg(path order by path), '{}')
      into v_pending
    from unnest(v_all_pending) paths(path)
    where exists (
      select 1
      from public.claim_uploads u
      join storage.objects o
        on o.bucket_id = 'claims' and o.name = u.path
      where u.path = paths.path and u.claim_id is null
    );

    user_id := v_job.user_id;
    avatar_paths := v_avatars;
    pending_claim_paths := v_pending;
    return next;
  end loop;
end;
$$;

create or replace function public.finish_account_deletion_job(
  p_user uuid,
  p_error text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_job private.account_deletion_jobs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_job
  from private.account_deletion_jobs j
  where j.user_id = p_user and j.completed_at is null
  for update;
  if not found then return false; end if;

  if p_error is not null then
    update private.account_deletion_jobs j
    set cleanup_started_at = null,
        last_error = left(p_error, 500),
        dead_lettered_at = case
          when j.attempt_count >= 20 then statement_timestamp()
          else null
        end
    where j.user_id = p_user;
    return false;
  end if;

  if exists (
       select 1 from storage.objects o
       where o.bucket_id = 'avatars'
         and o.name like p_user::text || '/%'
     )
     or exists (
       select 1
       from storage.objects o
       join public.claim_uploads u
         on u.path = o.name and u.claim_id is null
       where o.bucket_id = 'claims'
         and u.path = any(v_job.pending_claim_paths)
     ) then
    update private.account_deletion_jobs j
    set cleanup_started_at = null,
        last_error = 'storage_cleanup_incomplete',
        dead_lettered_at = case
          when j.attempt_count >= 20 then statement_timestamp()
          else null
        end
    where j.user_id = p_user;
    return false;
  end if;

  delete from public.claim_uploads u
  where u.claim_id is null
    and u.path = any(v_job.pending_claim_paths)
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'claims' and o.name = u.path
    );

  update private.account_deletion_jobs j
  set cleanup_started_at = null,
      last_error = null,
      dead_lettered_at = null,
      completed_at = statement_timestamp()
  where j.user_id = p_user;
  return true;
end;
$$;

-- Reactivación manual después de corregir la causa de un dead-letter. Nunca
-- se permite reintentar la limpieza mientras Auth todavía conserve al usuario.
create or replace function public.retry_account_deletion_job(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_updated integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from auth.users u where u.id = p_user) then
    return false;
  end if;
  update private.account_deletion_jobs j
  set auth_deleted_at = coalesce(j.auth_deleted_at, statement_timestamp()),
      cleanup_started_at = null,
      attempt_count = 0,
      last_error = null,
      dead_lettered_at = null
  where j.user_id = p_user and j.completed_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.account_deletion_job_stats()
returns table (
  pending_count bigint,
  dead_letter_count bigint,
  leased_count bigint,
  stale_active_account_count bigint,
  stale_lease_count bigint,
  oldest_pending_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    count(*) filter (
      where j.completed_at is null and j.dead_lettered_at is null
    ),
    count(*) filter (
      where j.completed_at is null and j.dead_lettered_at is not null
    ),
    count(*) filter (
      where j.completed_at is null and j.cleanup_started_at is not null
    ),
    count(*) filter (
      where j.completed_at is null
        and j.auth_deleted_at is null
        and j.requested_at < statement_timestamp() - interval '1 hour'
        and exists (select 1 from auth.users u where u.id = j.user_id)
    ),
    count(*) filter (
      where j.completed_at is null
        and j.cleanup_started_at
            < statement_timestamp() - interval '15 minutes'
    ),
    min(j.requested_at) filter (where j.completed_at is null)
  from private.account_deletion_jobs j;
end;
$$;

-- Defensa final para requests de Storage excepcionalmente lentas: si un
-- objeto aparece después de completar la outbox ya no tendrá tracking. El
-- cutoff amplio evita competir con uploads normales y el cron lo retira.
create or replace function public.list_orphan_claim_objects(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns table (path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  return query
  select o.name
  from storage.objects o
  where o.bucket_id = 'claims'
    and o.name ~ '^pending/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    and o.created_at < p_cutoff
    and not exists (
      select 1 from public.claim_uploads u where u.path = o.name
    )
  order by o.created_at, o.name
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

create or replace function public.list_orphan_avatar_objects(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns table (path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  return query
  select o.name
  from storage.objects o
  where o.bucket_id = 'avatars'
    and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
    and o.created_at < p_cutoff
    and not exists (
      select 1 from public.profiles p
      where p.id::text = split_part(o.name, '/', 1)
    )
  order by o.created_at, o.name
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

insert into public.data_retention_policies (
  dataset, retention_days, rationale, purge_on_account_deletion
) values (
  'account_deletion_jobs', 30,
  'Outbox de limpieza: treinta días después de completar la baja.', true
)
on conflict (dataset) do update set
  retention_days = excluded.retention_days,
  rationale = excluded.rationale,
  purge_on_account_deletion = excluded.purge_on_account_deletion,
  updated_at = statement_timestamp();

revoke execute on function private.account_deletion_is_pending(uuid)
from public, anon, authenticated, service_role;

revoke execute on function public.prepare_account_deletion(uuid),
  public.cancel_account_deletion(uuid),
  public.mark_account_auth_deleted(uuid),
  public.claim_account_deletion_jobs(uuid, integer),
  public.finish_account_deletion_job(uuid, text),
  public.retry_account_deletion_job(uuid),
  public.account_deletion_job_stats(),
  public.list_orphan_claim_objects(timestamptz, integer),
  public.list_orphan_avatar_objects(timestamptz, integer),
  public.finalize_claim_upload(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function public.prepare_account_deletion(uuid),
  public.cancel_account_deletion(uuid),
  public.mark_account_auth_deleted(uuid),
  public.claim_account_deletion_jobs(uuid, integer),
  public.finish_account_deletion_job(uuid, text),
  public.retry_account_deletion_job(uuid),
  public.account_deletion_job_stats(),
  public.list_orphan_claim_objects(timestamptz, integer),
  public.list_orphan_avatar_objects(timestamptz, integer),
  public.finalize_claim_upload(uuid, text)
to service_role;

comment on column public.claim_uploads.upload_completed_at is
  'Sello server-only posterior a Storage; un reclamo sólo puede adjuntar uploads completados.';
comment on function public.retry_account_deletion_job(uuid) is
  'Reintento operativo service-only de un job en dead-letter, únicamente si Auth ya no existe.';
comment on function public.account_deletion_job_stats() is
  'Métricas service-only para alertas de outbox, dead-letter y leases estancados.';

commit;
