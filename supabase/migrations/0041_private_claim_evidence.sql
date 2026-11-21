-- =============================================================================
-- Agorbis · 0041 · Evidencia privada hasta publicar
-- -----------------------------------------------------------------------------
-- El bucket `claims` era público. Eso hacía pública una foto apenas se subía
-- para la vista previa, antes de que la persona confirmara el reclamo. Además,
-- la policy de Storage permitía crear un objeto antes de registrarlo en
-- `claim_uploads`: un cliente que omitiera ese segundo paso dejaba huérfanos
-- que el cron no podía descubrir.
--
-- Desde acá:
--   * todo el bucket es privado;
--   * cada upload necesita una reserva DB previa, con cuota y rate limit;
--   * los borradores usan paths opacos (`pending/<uuid>.<ext>`), sin UUID de
--     usuario;
--   * al publicar, la DB cambia la referencia visible a
--     `<claim_uuid>/<archivo>` y conserva el path físico sólo en la tabla de
--     tracking protegida por RLS;
--   * una ruta server-side sirve evidencia publicada sólo si sigue ligada a
--     un reclamo visible, y sirve previews sólo a su dueño;
--   * el cron reclama filas con un tombstone transaccional antes de tocar
--     Storage, cerrando la carrera entre publicar y limpiar.
-- =============================================================================

-- Un bucket privado nunca entrega `/object/public/...`, aun conociendo el path.
update storage.buckets
set public = false,
    -- AVIF queda fuera hasta tener un decoder/encoder seguro en el runtime.
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'claims';

-- `geounity_public_read` venía de 0005 e incluía ambos buckets. Avatares siguen
-- siendo públicos; evidencia de reclamos sólo sale por la ruta mediadora.
drop policy if exists "geounity_public_read" on storage.objects;
create policy "geounity_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- El vínculo de una evidencia publicada debe sobrevivir a la anonimización de
-- su autor. El path físico ya no incluye ese UUID para uploads nuevos, y la FK
-- borra el último vínculo explícito sin borrar la evidencia ni su mapping.
alter table public.claim_uploads
  drop constraint if exists claim_uploads_owner_id_fkey;
alter table public.claim_uploads
  alter column owner_id drop not null;
alter table public.claim_uploads
  add constraint claim_uploads_owner_id_fkey
  foreign key (owner_id) references public.profiles (id) on delete set null;

alter table public.claim_uploads
  add column if not exists public_path text,
  add column if not exists reservation_token uuid,
  add column if not exists cleanup_started_at timestamptz;

-- Se reemplazan temporalmente los triggers: la migración normaliza referencias
-- históricas antes de instalar el contrato nuevo.
drop trigger if exists claims_validate_images on public.claims;
drop trigger if exists claims_attach_uploads on public.claims;
drop trigger if exists ab_claim_uploads_validate on public.claim_uploads;

alter table public.claim_uploads
  drop constraint if exists claim_uploads_path_chk;
alter table public.claim_uploads
  add constraint claim_uploads_path_chk check (
    path ~ '^pending/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
    or path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$'
  );

alter table public.claim_uploads
  drop constraint if exists claim_uploads_public_path_chk;
alter table public.claim_uploads
  add constraint claim_uploads_public_path_chk check (
    (claim_id is null and public_path is null and attached_at is null)
    or
    (claim_id is not null
      and public_path ~ ('^' || claim_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$')
      and attached_at is not null
      and cleanup_started_at is null)
  ) not valid;

create unique index if not exists claim_uploads_public_path_uidx
  on public.claim_uploads (public_path)
  where public_path is not null;
create index if not exists claim_uploads_cleanup_idx
  on public.claim_uploads (cleanup_started_at, created_at, id)
  where claim_id is null;

-- 0013 podía heredar una URL de una instalación anterior sin completar
-- `image_paths`. Recuperamos únicamente URLs canónicas del bucket propio.
with recovered as (
  select array_agg(
    substring(url from '/storage/v1/object/public/claims/([^?#]+)')
    order by ord
  ) as paths,
  bool_and(url ~ '/storage/v1/object/public/claims/[^?#]+([?#].*)?$') as valid,
  c.id
  from public.claims c
  cross join lateral unnest(c.image_urls) with ordinality as images(url, ord)
  where cardinality(c.image_paths) = 0
    and cardinality(c.image_urls) > 0
  group by c.id
)
update public.claims c
set image_paths = recovered.paths
from recovered
where c.id = recovered.id and recovered.valid;

-- Todo objeto histórico queda rastreado, incluso si su perfil ya se eliminó.
-- En una instalación nueva no hay filas que backfillear, pero esto evita dejar
-- bytes invisibles al cron al aplicar la migración sobre una base existente.
insert into public.claim_uploads (
  owner_id, path, claim_id, created_at, attached_at, public_path
)
select
  coalesce(linked.author_id, owner_profile.id),
  object.name,
  linked.id,
  coalesce(object.created_at, statement_timestamp()),
  case when linked.id is null then null else coalesce(linked.created_at, statement_timestamp()) end,
  case when linked.id is null then null
       else linked.id::text || '/' || regexp_replace(object.name, '^.*/', '') end
from storage.objects object
left join lateral (
  select c.id, c.author_id, c.created_at
  from public.claims c
  where object.name = any(c.image_paths)
  order by c.created_at asc, c.id asc
  limit 1
) linked on true
left join public.profiles owner_profile
  on owner_profile.id::text = split_part(object.name, '/', 1)
where object.bucket_id = 'claims'
  and not exists (
    select 1 from public.claim_uploads tracked where tracked.path = object.name
  )
on conflict (path) do nothing;

-- Normaliza el mapping de filas ya ligadas antes de ocultar los paths físicos.
update public.claim_uploads u
set public_path = u.claim_id::text || '/' || regexp_replace(u.path, '^.*/', ''),
    attached_at = coalesce(u.attached_at, statement_timestamp()),
    cleanup_started_at = null
where u.claim_id is not null;

alter table public.claim_uploads
  validate constraint claim_uploads_public_path_chk;

-- Lo visible y exportable deja de incluir el UUID de autor. Las rutas son
-- relativas a propósito: no dependen del Host enviado por el cliente ni del
-- dominio elegido para producción.
with normalized as (
  select
    c.id,
    array_agg(
      c.id::text || '/' || regexp_replace(original_path, '^.*/', '')
      order by ord
    ) as paths,
    array_agg(
      '/media/reclamos/' || c.id::text || '/' || regexp_replace(original_path, '^.*/', '')
      order by ord
    ) as urls
  from public.claims c
  cross join lateral unnest(c.image_paths)
    with ordinality as originals(original_path, ord)
  where cardinality(c.image_paths) > 0
  group by c.id
)
update public.claims c
set image_paths = normalized.paths,
    image_urls = normalized.urls,
    image_url = normalized.urls[1]
from normalized
where c.id = normalized.id;

-- INSERT directo se conserva sólo como compatibilidad defensiva de SQL: el
-- cliente no puede escribir `reservation_token` por privilegios de columna.
-- Los paths nuevos, por lo tanto, sólo nacen mediante reserve_claim_upload().
create or replace function private.guard_claim_upload_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_pending integer;
begin
  if v_actor is null then return new; end if;
  if new.owner_id is distinct from v_actor then
    raise exception 'GEOUNITY_INVALID_UPLOAD_OWNER'
      using errcode = 'insufficient_privilege';
  end if;

  if new.reservation_token is not null then
    if new.path !~ '^pending/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|avif)$' then
      raise exception 'GEOUNITY_INVALID_UPLOAD_PATH'
        using errcode = 'check_violation';
    end if;
  else
    -- La escritura directa antigua no sirve para reservar: exige un objeto que
    -- la policy nueva, a su vez, no deja crear sin una reserva real.
    if split_part(new.path, '/', 1) <> v_actor::text then
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
  end if;

  perform pg_advisory_xact_lock(hashtextextended('claim-uploads:' || v_actor::text, 0));
  select count(*) into v_pending
  from public.claim_uploads u
  where u.owner_id = v_actor
    and u.claim_id is null
    and u.cleanup_started_at is null;
  if v_pending >= 12 then
    raise exception 'GEOUNITY_TOO_MANY_PENDING_UPLOADS'
      using errcode = 'program_limit_exceeded';
  end if;
  perform private.consume_window_limit(
    'claim-uploads-hour', v_actor, 20, interval '1 hour'
  );
  new.created_at := statement_timestamp();
  new.claim_id := null;
  new.public_path := null;
  new.attached_at := null;
  new.cleanup_started_at := null;
  return new;
end;
$$;

create trigger ab_claim_uploads_validate
  before insert on public.claim_uploads
  for each row execute function private.guard_claim_upload_insert();

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
  -- Sólo service_role ejecuta esta RPC. El owner explícito proviene de la
  -- sesión que la action server-side ya verificó.
  perform private.assert_can_participate(p_owner);
  if p_path !~ '^pending/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    raise exception 'GEOUNITY_INVALID_UPLOAD_PATH'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('claim-uploads:' || p_owner::text, 0));
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
    owner_id, path, reservation_token
  ) values (
    p_owner, p_path, gen_random_uuid()
  ) returning id into v_id;
  return v_id;
end;
$$;

-- Libera una reserva únicamente después de comprobar que Storage ya no tiene
-- el objeto. Así un error de red jamás convierte un archivo real en huérfano.
create or replace function public.release_claim_upload(
  p_owner uuid,
  p_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.claim_uploads u
  where u.owner_id = p_owner
    and u.path = p_path
    and u.claim_id is null
    and u.cleanup_started_at is null
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'claims' and o.name = u.path
    );
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

-- Compatibilidad del helper inspeccionado por la suite y gate barato para la
-- UI. La autorización real de cada objeto verifica la reserva exacta abajo.
create or replace function public.can_upload_claim_object()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and public.can_participate()
    and (
      select count(*) < 12
      from public.claim_uploads u
      where u.owner_id = auth.uid()
        and u.claim_id is null
        and u.cleanup_started_at is null
    ),
    false
  );
$$;

drop policy if exists "geounity_claim_insert" on storage.objects;
create policy "geounity_claim_insert" on storage.objects
  for insert to authenticated with check (
    -- La action server-side sanea/reconstruye bytes y escribe con service_role.
    -- Un JWT de usuario nunca puede saltear ese paso hablando directo con la
    -- API de Storage, aun si antes obtuvo o adivinó un path reservado.
    bucket_id = 'claims' and false
  );

drop policy if exists "geounity_claim_delete_pending" on storage.objects;
create policy "geounity_claim_delete_pending" on storage.objects
  for delete to authenticated using (
    bucket_id = 'claims'
    and exists (
      select 1 from public.claim_uploads u
      where u.path = name
        and u.owner_id = auth.uid()
        and u.claim_id is null
    )
  );

-- La DB adjunta y reescribe referencias en la misma transacción que crea el
-- reclamo. Si otra transacción ya reservó la fila para limpieza, el INSERT se
-- rechaza; si ésta la bloquea primero, el cleanup la saltea con SKIP LOCKED.
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

  -- El lock es la barrera con begin_claim_upload_cleanup().
  perform 1
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.cleanup_started_at is null
    and u.path = any(new.image_paths)
  for update;

  select count(*) into v_tracked
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.cleanup_started_at is null
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

create trigger claims_validate_images
  before insert or update of image_url, image_urls, image_paths on public.claims
  for each row execute function public.validate_claim_images();

-- La FK a `claims` sólo puede completarse después del INSERT. Los locks que
-- tomó el BEFORE trigger siguen retenidos dentro de esta misma transacción.
create or replace function public.attach_claim_uploads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_attached integer;
begin
  if cardinality(new.image_paths) = 0 then return new; end if;

  update public.claim_uploads u
  set claim_id = new.id,
      attached_at = statement_timestamp(),
      public_path = new.id::text || '/' || regexp_replace(u.path, '^.*/', ''),
      cleanup_started_at = null
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.cleanup_started_at is null
    and (new.id::text || '/' || regexp_replace(u.path, '^.*/', ''))
        = any(new.image_paths);
  get diagnostics v_attached = row_count;
  if v_attached <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger claims_attach_uploads
  after insert on public.claims
  for each row execute function public.attach_claim_uploads();

-- Reserva atómica para cleanup. El tombstone se confirma antes de hacer la
-- llamada HTTP a Storage; publicar una fila reclamada ya no puede competir con
-- el DELETE. Un lease vencido permite reintentar una caída del cron.
create or replace function public.begin_claim_upload_cleanup(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns table (id uuid, path text)
language sql
volatile
security definer
set search_path = ''
as $$
  with candidates as (
    select u.id
    from public.claim_uploads u
    where u.claim_id is null
      and (
        (u.cleanup_started_at is null and u.created_at < p_cutoff)
        or u.cleanup_started_at < statement_timestamp() - interval '15 minutes'
      )
    order by coalesce(u.cleanup_started_at, u.created_at), u.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.claim_uploads u
  set cleanup_started_at = statement_timestamp()
  from candidates c
  where u.id = c.id
  returning u.id, u.path;
$$;

create or replace function public.finish_claim_upload_cleanup(p_ids uuid[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.claim_uploads u
  where u.id = any(coalesce(p_ids, '{}'::uuid[]))
    and u.claim_id is null
    and u.cleanup_started_at is not null
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'claims' and o.name = u.path
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- Privilegios mínimos. `reservation_token` no se agrega al grant de INSERT:
-- eso es lo que impide fabricar reservas con DML directo.
revoke execute on function public.reserve_claim_upload(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_claim_upload(uuid, text) to service_role;
revoke execute on function public.release_claim_upload(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_claim_upload(uuid, text) to service_role;

revoke execute on function public.begin_claim_upload_cleanup(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.begin_claim_upload_cleanup(timestamptz, integer)
  to service_role;
revoke execute on function public.finish_claim_upload_cleanup(uuid[])
  from public, anon, authenticated;
grant execute on function public.finish_claim_upload_cleanup(uuid[])
  to service_role;

comment on column public.claim_uploads.path is
  'Path físico privado. No exponer: puede conservar el formato legacy con UUID de autor.';
comment on column public.claim_uploads.public_path is
  'Referencia pública opaca <claim_uuid>/<archivo>; nunca contiene el UUID de autor.';
comment on function public.reserve_claim_upload(uuid, text) is
  'RPC service-only: reserva rate-limited antes de que la action sanee y escriba en Storage.';
comment on function public.begin_claim_upload_cleanup(timestamptz, integer) is
  'Toma con SKIP LOCKED y tombstone uploads abandonados antes de borrar sus objetos.';
