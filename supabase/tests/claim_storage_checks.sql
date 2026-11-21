-- =============================================================================
-- Agorbis · Storage de evidencia de reclamos
-- -----------------------------------------------------------------------------
-- Test focal de 0041. Corre después de `supabase db reset` y revierte todo.
-- =============================================================================

begin;

create or replace function pg_temp.as_user(p_username text)
returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  select id into v_id from public.profiles where username = p_username;
  if v_id is null then raise exception 'Falta usuario seed %', p_username; end if;
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
  return v_id;
end;
$$;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_service()
returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
end;
$$;

create or replace function pg_temp.ok(p_value boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_value, false) then
    raise exception 'FALLÓ · %', p_message;
  end if;
  raise notice '  ok   · %', p_message;
end;
$$;

grant execute on function pg_temp.as_user(text), pg_temp.as_owner(),
  pg_temp.as_service(), pg_temp.ok(boolean, text)
  to anon, authenticated, service_role;

do $$
declare
  v_user uuid;
  v_community uuid;
  v_claim uuid;
  v_path text := 'pending/10000000-0000-4000-8000-000000000041.jpg';
  v_file text := '10000000-0000-4000-8000-000000000041.jpg';
  v_unreserved text := 'pending/20000000-0000-4000-8000-000000000041.jpg';
  v_rejected boolean := false;
  v_rows integer;
begin
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    (select not public from storage.buckets where id = 'claims'),
    'el bucket claims es privado'
  );
  perform pg_temp.ok(
    (select file_size_limit = 950 * 1024 from storage.buckets where id = 'claims'),
    'Storage aplica el mismo tope de archivo que el formulario'
  );
  perform pg_temp.ok(
    not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and policyname = 'geounity_public_read'
        and coalesce(qual, '') like '%claims%'
    ),
    'la lectura pública directa de Storage no incluye claims'
  );
  perform pg_temp.ok(
    not exists (
      select 1 from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd = 'DELETE'
        and roles @> array['authenticated']::name[]
    ),
    'ningún JWT puede borrar evidencia pendiente y competir con su publicación'
  );
  perform pg_temp.ok(
    has_function_privilege(
      'service_role',
      'public.reserve_claim_upload(uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.reserve_claim_upload(uuid,text)',
      'execute'
    )
    and has_function_privilege(
      'service_role',
      'public.finalize_claim_upload(uuid,text)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.finalize_claim_upload(uuid,text)',
      'execute'
    )
    and
    has_function_privilege(
      'service_role',
      'public.begin_claim_upload_cleanup(timestamptz,integer)',
      'execute'
    )
    and not has_function_privilege(
      'authenticated',
      'public.begin_claim_upload_cleanup(timestamptz,integer)',
      'execute'
    ),
    'sólo service_role puede reservar uploads y reclamar cleanup'
  );

  v_user := pg_temp.as_user('flor_tandil');
  select home_community_id into v_community
  from public.profiles where id = v_user;

  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('claims', v_unreserved, v_user::text);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'Storage rechaza un objeto sin reserva previa');

  perform pg_temp.as_service();
  perform public.reserve_claim_upload(v_user, v_path);
  perform pg_temp.ok(
    exists (
      select 1 from public.claim_uploads
      where owner_id = v_user and path = v_path
        and reservation_token is not null and claim_id is null
    ),
    'la RPC crea tracking rate-limited antes del objeto'
  );

  perform pg_temp.as_user('flor_tandil');
  v_rejected := false;
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('claims', v_path, v_user::text);
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'ni con reserva un JWT puede saltear el saneamiento server-side'
  );

  perform pg_temp.as_owner();
  insert into storage.objects (bucket_id, name, owner_id)
  values ('claims', v_path, v_user::text);

  perform pg_temp.as_service();
  perform pg_temp.ok(
    public.finalize_claim_upload(v_user, v_path),
    'la RPC sella que Storage completó la reserva'
  );

  perform pg_temp.as_user('flor_tandil');
  insert into public.claims (
    community_id, author_id, title, description, category,
    image_url, image_urls, image_paths
  ) values (
    v_community, v_user,
    'Reclamo temporal con evidencia privada',
    'Prueba transaccional del mapping público sin identidad del autor.',
    'otro',
    '/media/reclamos/pendientes/' || v_file,
    array['/media/reclamos/pendientes/' || v_file],
    array[v_path]
  ) returning id into v_claim;

  perform pg_temp.ok(
    (select image_paths = array[v_claim::text || '/' || v_file]
       and image_urls = array['/media/reclamos/' || v_claim::text || '/' || v_file]
       and image_url = '/media/reclamos/' || v_claim::text || '/' || v_file
     from public.claims where id = v_claim),
    'la publicación reemplaza el path privado por namespace del reclamo'
  );
  perform pg_temp.ok(
    (select claim_id = v_claim
       and public_path = v_claim::text || '/' || v_file
       and attached_at is not null
     from public.claim_uploads where path = v_path),
    'el mapping privado queda adjunto en la misma transacción'
  );
  perform pg_temp.ok(
    position(v_user::text in (select image_urls[1] from public.claims where id = v_claim)) = 0,
    'la URL publicada no correlaciona el UUID del autor'
  );

  -- Simula la parte de anonimización que ejecuta la FK al borrar el perfil.
  perform pg_temp.as_owner();
  update public.claims set author_id = null where id = v_claim;
  update public.claim_uploads set owner_id = null where claim_id = v_claim;
  perform pg_temp.ok(
    exists (
      select 1 from public.claim_uploads
      where claim_id = v_claim and public_path = v_claim::text || '/' || v_file
        and owner_id is null
    ),
    'anonimizar al autor conserva la evidencia y elimina su vínculo explícito'
  );

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  select count(*) into v_rows
  from public.claim_uploads where claim_id = v_claim;
  perform pg_temp.ok(v_rows = 0, 'anon nunca puede leer el path físico');
end;
$$;

do $$
declare
  v_user uuid;
  v_community uuid;
  v_path text := 'pending/30000000-0000-4000-8000-000000000041.webp';
  v_file text := '30000000-0000-4000-8000-000000000041.webp';
  v_ids uuid[];
  v_rejected boolean := false;
  v_finished integer;
begin
  v_user := pg_temp.as_user('flor_tandil');
  select home_community_id into v_community
  from public.profiles where id = v_user;
  perform pg_temp.as_service();
  perform public.reserve_claim_upload(v_user, v_path);
  perform pg_temp.as_owner();
  insert into storage.objects (bucket_id, name, owner_id)
  values ('claims', v_path, v_user::text);

  perform pg_temp.as_owner();
  update public.claim_uploads
  set created_at = statement_timestamp() - interval '25 hours'
  where path = v_path;
  perform pg_temp.as_service();
  select array_agg(id) into v_ids
  from public.begin_claim_upload_cleanup(
    statement_timestamp() - interval '24 hours', 100
  )
  where path = v_path;
  perform pg_temp.ok(cardinality(v_ids) = 1, 'cleanup toma y marca el pending viejo');

  perform pg_temp.as_user('flor_tandil');
  begin
    insert into public.claims (
      community_id, author_id, title, description, category,
      image_url, image_urls, image_paths
    ) values (
      v_community, v_user,
      'Publicación que perdió la carrera de cleanup',
      'No debe quedar apuntando a un objeto que ya fue reclamado.',
      'otro',
      '/media/reclamos/pendientes/' || v_file,
      array['/media/reclamos/pendientes/' || v_file],
      array[v_path]
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un tombstone impide publicar durante cleanup');

  perform pg_temp.as_owner();
  -- Las tablas de Storage prohíben DELETE SQL incluso a postgres (bien); mover
  -- el nombre dentro de esta transacción simula que la API ya retiró el path.
  update storage.objects
  set name = 'test-cleaned/' || regexp_replace(v_path, '^.*/', '')
  where bucket_id = 'claims' and name = v_path;
  perform pg_temp.as_service();
  v_finished := public.finish_claim_upload_cleanup(v_ids);
  perform pg_temp.ok(
    v_finished = 1
    and not exists (select 1 from public.claim_uploads where path = v_path),
    'cleanup finaliza sólo después de que el objeto desapareció'
  );
end;
$$;

rollback;
