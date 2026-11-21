-- =============================================================================
-- Agorbis · 0013 · Varias imágenes en reclamos y limpieza de adjuntos
-- =============================================================================

-- La primera imagen conserva `image_url` como portada compatible con listados
-- existentes; las galerías nuevas usan `image_urls`.
alter table public.claims
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists image_paths text[] not null default '{}';

update public.claims
   set image_urls = array[image_url]
 where image_url is not null
   and cardinality(image_urls) = 0;

alter table public.claims
  drop constraint if exists claims_image_urls_limit_chk;
alter table public.claims
  add constraint claims_image_urls_limit_chk
  check (cardinality(image_urls) <= 4 and cardinality(image_paths) <= 4);

-- Cada archivo subido antes de confirmar se registra. El cron sólo borra filas
-- sin claim_id, por lo que nunca toca una imagen publicada.
create table if not exists public.claim_uploads (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  path        text not null unique,
  claim_id    uuid references public.claims (id) on delete cascade,
  created_at  timestamptz not null default now(),
  attached_at timestamptz,

  constraint claim_uploads_path_chk check (
    path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
  )
);

create index if not exists claim_uploads_pending_idx
  on public.claim_uploads (created_at asc)
  where claim_id is null;

alter table public.claim_uploads enable row level security;

create policy claim_uploads_select_own on public.claim_uploads
  for select to authenticated
  using (owner_id = auth.uid());

create policy claim_uploads_insert_own on public.claim_uploads
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and split_part(path, '/', 1) = auth.uid()::text
  );

-- La aplicación no necesita actualizar esta tabla: el trigger de abajo la
-- vincula al insertar el reclamo. Se deja sin UPDATE/DELETE para el cliente.

create or replace function public.validate_claim_images()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tracked int;
begin
  if cardinality(new.image_urls) <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID: URLs y archivos no coinciden'
      using errcode = 'check_violation';
  end if;

  if cardinality(new.image_urls) > 4 then
    raise exception 'GEOUNITY_CLAIM_IMAGES_LIMIT: máximo 4 imágenes'
      using errcode = 'check_violation';
  end if;

  if cardinality(new.image_paths) = 0 then
    new.image_url := null;
    return new;
  end if;

  select count(*) into v_tracked
  from public.claim_uploads u
  where u.owner_id = new.author_id
    and u.claim_id is null
    and u.path = any(new.image_paths);

  if v_tracked <> cardinality(new.image_paths) then
    raise exception 'GEOUNITY_CLAIM_IMAGES_INVALID: las imágenes deben ser tuyas y estar pendientes'
      using errcode = 'check_violation';
  end if;

  new.image_url := new.image_urls[1];
  return new;
end;
$$;

create or replace function public.attach_claim_uploads()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if cardinality(new.image_paths) > 0 then
    update public.claim_uploads
       set claim_id = new.id,
           attached_at = now()
     where owner_id = new.author_id
       and claim_id is null
       and path = any(new.image_paths);
  end if;
  return new;
end;
$$;

drop trigger if exists claims_validate_images on public.claims;
create trigger claims_validate_images
  before insert or update of image_urls, image_paths on public.claims
  for each row execute function public.validate_claim_images();

drop trigger if exists claims_attach_uploads on public.claims;
create trigger claims_attach_uploads
  after insert on public.claims
  for each row execute function public.attach_claim_uploads();
