-- =============================================================================
-- Agorbis · 0045 · Cierre adversarial de privilegios y media
-- -----------------------------------------------------------------------------
-- Cierra tres bypasses encontrados antes del corte:
--   * una sesión moderadora suspendida, sin contrato vigente o en proceso de
--     baja ya no conserva ningún poder privilegiado;
--   * los JWT de usuario no pueden escribir ni borrar objetos de Storage;
--   * avatares y evidencia pendiente sólo salen de acciones server-side que
--     validan bytes, dimensiones y ownership antes de usar service_role.
-- =============================================================================

begin;

-- Toda política/RPC que llama is_moderator() hereda este único fail-closed.
-- current_session_uses_approved_factor() queda separado: una persona suspendida
-- todavía debe poder acreditar su identidad para exportar o borrar su cuenta.
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
    and private.raw_is_moderator(p_user)
    and public.current_session_uses_approved_factor()
    and not private.account_deletion_is_pending(p_user)
    and not private.active_suspension(p_user)
    and private.has_current_legal_acceptance(p_user),
    false
  );
$$;

-- El bucket deja de ser una publicación paralela. El proxy del propio origen
-- sólo entrega el path que siga referenciado por el perfil.
update storage.buckets
set public = false,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists "geounity_public_read" on storage.objects;
drop policy if exists "geounity_own_folder_insert" on storage.objects;
drop policy if exists "geounity_own_folder_update" on storage.objects;
drop policy if exists "geounity_own_folder_delete" on storage.objects;
drop policy if exists "geounity_avatar_insert" on storage.objects;
drop policy if exists "geounity_avatar_update" on storage.objects;
drop policy if exists "geounity_avatar_delete" on storage.objects;
drop policy if exists "geounity_claim_insert" on storage.objects;
drop policy if exists "geounity_claim_delete_pending" on storage.objects;

drop function if exists public.can_upload_avatar_object();

-- Se pausa el guard anterior mientras se traducen referencias históricas del
-- endpoint público de Supabase al proxy de Agorbis.
drop trigger if exists ab_profiles_avatar_guard on public.profiles;

update public.profiles p
set avatar_url = '/media/avatares/' || substring(
  p.avatar_url from '/storage/v1/object/public/avatars/([^?#]+)$'
)
where p.avatar_url ~ '^https?://[^/?#]+/storage/v1/object/public/avatars/[^?#]+$'
  and substring(
    p.avatar_url from '/storage/v1/object/public/avatars/([^?#]+)$'
  ) ~ (
    '^' || p.id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '[.](jpg|png|webp)$'
  )
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'avatars'
      and o.name = substring(
        p.avatar_url from '/storage/v1/object/public/avatars/([^?#]+)$'
      )
  );

-- No se conserva una referencia externa o AVIF que nunca pasó por el contrato
-- actual. El objeto queda privado y el barrido de huérfanos lo retira.
update public.profiles p
set avatar_url = null
where p.avatar_url is not null
  and not (
    p.avatar_url ~ (
      '^/media/avatares/' || p.id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '[.](jpg|png|webp)$'
    )
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars'
        and o.name = substring(p.avatar_url from '^/media/avatares/(.+)$')
    )
  );

create table if not exists private.avatar_uploads (
  path text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  reserved_at timestamptz not null default statement_timestamp(),
  upload_completed_at timestamptz,
  referenced_at timestamptz,
  constraint avatar_upload_path_chk check (
    path ~ (
      '^' || owner_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '[.](jpg|png|webp)$'
    )
  ),
  constraint avatar_upload_reference_chk check (
    referenced_at is null or upload_completed_at is not null
  )
);

create index if not exists avatar_uploads_owner_idx
  on private.avatar_uploads(owner_id, reserved_at desc);
revoke all on private.avatar_uploads
from public, anon, authenticated, service_role;

insert into private.avatar_uploads (
  path, owner_id, upload_completed_at, referenced_at
)
select
  substring(p.avatar_url from '^/media/avatares/(.+)$'),
  p.id,
  coalesce(o.created_at, statement_timestamp()),
  statement_timestamp()
from public.profiles p
join storage.objects o
  on o.bucket_id = 'avatars'
 and o.name = substring(p.avatar_url from '^/media/avatares/(.+)$')
where p.avatar_url is not null
on conflict (path) do update set
  owner_id = excluded.owner_id,
  upload_completed_at = excluded.upload_completed_at,
  referenced_at = excluded.referenced_at;

create or replace function public.reserve_avatar_upload(
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
  v_id uuid := gen_random_uuid();
  v_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  if p_path !~ (
    '^' || p_owner::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '[.](jpg|png|webp)$'
  ) then
    raise exception 'AGORBIS_INVALID_AVATAR_PATH'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avatar-uploads:' || p_owner::text, 0)
  );
  perform private.assert_can_participate(p_owner);
  select count(*) into v_count
  from private.avatar_uploads u where u.owner_id = p_owner;
  if v_count >= 20 then
    raise exception 'AGORBIS_TOO_MANY_AVATAR_UPLOADS'
      using errcode = 'program_limit_exceeded';
  end if;
  perform private.consume_window_limit(
    'avatar-uploads-hour', p_owner, 10, interval '1 hour'
  );

  insert into private.avatar_uploads(path, owner_id)
  values (p_path, p_owner);
  return v_id;
end;
$$;

create or replace function public.finalize_avatar_upload(
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
    hashtextextended('avatar-uploads:' || p_owner::text, 0)
  );
  perform private.assert_can_participate(p_owner);
  update private.avatar_uploads u
  set upload_completed_at = statement_timestamp()
  where u.owner_id = p_owner
    and u.path = p_path
    and u.upload_completed_at is null
    and exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars' and o.name = u.path
    );
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

create or replace function public.release_avatar_upload(
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
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('avatar-uploads:' || p_owner::text, 0)
  );
  delete from private.avatar_uploads u
  where u.owner_id = p_owner
    and u.path = p_path
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars' and o.name = u.path
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = p_owner
        and p.avatar_url = '/media/avatares/' || u.path
    );
  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

create or replace function public.finish_avatar_upload_cleanup(p_paths text[])
returns integer
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
  if coalesce(cardinality(p_paths), 0) > 500 then
    raise exception 'AGORBIS_AVATAR_CLEANUP_BATCH_TOO_LARGE'
      using errcode = 'program_limit_exceeded';
  end if;
  delete from private.avatar_uploads u
  where u.path = any(coalesce(p_paths, '{}'))
    and not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'avatars' and o.name = u.path
    )
    and not exists (
      select 1 from public.profiles p
      where p.id = u.owner_id
        and p.avatar_url = '/media/avatares/' || u.path
    );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function private.guard_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_path text;
begin
  if new.avatar_url is not distinct from old.avatar_url then return new; end if;
  if new.avatar_url is null then return new; end if;
  if char_length(new.avatar_url) > 200
     or new.avatar_url !~ (
       '^/media/avatares/' || new.id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
       '[.](jpg|png|webp)$'
     ) then
    raise exception 'AGORBIS_AVATAR_URL_INVALID'
      using errcode = 'check_violation';
  end if;
  v_path := substring(new.avatar_url from '^/media/avatares/(.+)$');
  if not exists (
    select 1
    from private.avatar_uploads u
    join storage.objects o
      on o.bucket_id = 'avatars' and o.name = u.path
    where u.path = v_path
      and u.owner_id = new.id
      and u.upload_completed_at is not null
  ) then
    raise exception 'AGORBIS_AVATAR_UPLOAD_NOT_APPROVED'
      using errcode = 'foreign_key_violation';
  end if;
  update private.avatar_uploads u
  set referenced_at = statement_timestamp()
  where u.path = v_path and u.owner_id = new.id;
  return new;
end;
$$;

create trigger ab_profiles_avatar_guard
  before update of avatar_url on public.profiles
  for each row execute function private.guard_profile_avatar();

-- El barrido incluye objetos de perfiles existentes que nunca llegaron a ser
-- el avatar vigente; el listado anterior sólo detectaba cuentas ya borradas.
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
    and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|png|webp|avif)$'
    and o.created_at < p_cutoff
    and not exists (
      select 1 from public.profiles p
      where p.avatar_url = '/media/avatares/' || o.name
    )
  order by o.created_at, o.name
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke execute on function public.reserve_avatar_upload(uuid, text),
  public.finalize_avatar_upload(uuid, text),
  public.release_avatar_upload(uuid, text),
  public.finish_avatar_upload_cleanup(text[])
from public, anon, authenticated, service_role;
grant execute on function public.reserve_avatar_upload(uuid, text),
  public.finalize_avatar_upload(uuid, text),
  public.release_avatar_upload(uuid, text),
  public.finish_avatar_upload_cleanup(text[])
to service_role;

comment on table private.avatar_uploads is
  'Handshake privado de avatares saneados; una fila completada es requisito para referenciar el objeto.';
comment on function private.session_is_moderator(uuid) is
  'Autoridad privilegiada fail-closed: rol, identidad, MFA aprobado, cuenta activa, sin baja y contrato vigente.';

commit;
