-- =============================================================================
-- Agorbis · 0005 · Storage (avatares y fotos de reclamos)
-- -----------------------------------------------------------------------------
-- Convención de rutas: `<user_id>/<archivo>`. La policy compara el primer
-- segmento del nombre con `auth.uid()`, así cada quien sólo escribe en su carpeta.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('claims', 'claims', true, 5 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- --- Lectura pública -----------------------------------------------------------
drop policy if exists "geounity_public_read" on storage.objects;
create policy "geounity_public_read" on storage.objects
  for select using (bucket_id in ('avatars', 'claims'));

-- --- Escritura en la carpeta propia -------------------------------------------
drop policy if exists "geounity_own_folder_insert" on storage.objects;
create policy "geounity_own_folder_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'claims')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "geounity_own_folder_update" on storage.objects;
create policy "geounity_own_folder_update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'claims')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'claims')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "geounity_own_folder_delete" on storage.objects;
create policy "geounity_own_folder_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'claims')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator(auth.uid()))
  );
