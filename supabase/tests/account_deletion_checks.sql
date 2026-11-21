-- Agorbis · baja de cuenta: outbox, congelamiento y preservación de evidencia.
begin;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALLÓ · %', p_what;
  end if;
  raise notice '  ok   · %', p_what;
end;
$$;
grant execute on function pg_temp.ok(boolean, text)
to anon, authenticated, service_role;

do $$
declare
  v_user uuid := gen_random_uuid();
  v_community uuid;
  v_pending text := 'pending/' || gen_random_uuid()::text || '.jpg';
  v_published text := 'pending/' || gen_random_uuid()::text || '.jpg';
  v_unfinished text := 'pending/' || gen_random_uuid()::text || '.jpg';
  v_avatar text;
  v_orphan_claim text := 'pending/' || gen_random_uuid()::text || '.jpg';
  v_orphan_user uuid := gen_random_uuid();
  v_orphan_avatar text;
  v_dead_user uuid := gen_random_uuid();
  v_claim uuid;
  v_job record;
  v_dead_job record;
  v_stats record;
  v_count integer;
  v_rejected boolean := false;
  v_result boolean;
begin
  raise notice '── baja de cuenta reintentable ──';
  v_avatar := v_user::text || '/' || gen_random_uuid()::text || '.jpg';
  v_orphan_avatar := v_orphan_user::text || '/' || gen_random_uuid()::text || '.jpg';
  select id into v_community from public.communities where slug = 'earth';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, email_change_confirm_status,
    phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user, 'authenticated',
    'authenticated', 'account-deletion-probe@agorbis.test',
    extensions.crypt('AgorbisLocal-2026!', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'username', 'account_deletion_probe',
      'display_name', 'Account deletion probe'
    ),
    now(), now(), '', '', '', '', '', 0, '', '', '', false, false
  );
  update public.profiles set home_community_id = v_community where id = v_user;

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text,
    true
  );
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
  begin
    perform public.prepare_account_deletion(v_user);
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el navegador no puede crear su propia outbox');

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into public.claim_uploads (
    owner_id, path, reservation_token
  ) values
    (v_user, v_pending, gen_random_uuid()),
    (v_user, v_published, gen_random_uuid()),
    (v_user, v_unfinished, gen_random_uuid());
  insert into storage.objects (bucket_id, name, owner_id) values
    ('claims', v_pending, v_user::text),
    ('claims', v_published, v_user::text),
    ('claims', v_unfinished, v_user::text),
    ('avatars', v_avatar, v_user::text);

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.finalize_claim_upload(v_user, v_pending)
    and public.finalize_claim_upload(v_user, v_published),
    'Storage debe sellar cada reserva antes de que pueda publicarse'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  v_rejected := false;
  begin
    insert into public.claims (
      community_id, author_id, title, description, category,
      image_url, image_urls, image_paths
    ) values (
      v_community, v_user, 'Upload sin finalizar',
      'No puede publicarse aunque el objeto ya exista.', 'otro',
      '/media/reclamos/pendientes/' || regexp_replace(v_unfinished, '^.*/', ''),
      array['/media/reclamos/pendientes/' || regexp_replace(v_unfinished, '^.*/', '')],
      array[v_unfinished]
    );
  exception when check_violation then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'una reserva sin handshake completo nunca se adjunta a un reclamo'
  );

  insert into public.claims (
    community_id, author_id, title, description, category,
    image_url, image_urls, image_paths
  ) values (
    v_community, v_user, 'Evidencia que debe sobrevivir',
    'La publicación queda anónima y su evidencia no es un borrador.', 'otro',
    '/media/reclamos/pendientes/' || regexp_replace(v_published, '^.*/', ''),
    array['/media/reclamos/pendientes/' || regexp_replace(v_published, '^.*/', '')],
    array[v_published]
  ) returning id into v_claim;

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  v_result := public.prepare_account_deletion(v_user);
  perform pg_temp.ok(v_result, 'service_role prepara la outbox antes de tocar Auth');
  v_rejected := false;
  begin
    perform public.reserve_claim_upload(
      v_user, 'pending/' || gen_random_uuid()::text || '.jpg'
    );
  exception when object_not_in_prerequisite_state then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'el mismo fence impide reservar un upload después de preparar la baja'
  );

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_user::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text,
    true
  );
  perform pg_temp.ok(not public.can_participate(), 'la solicitud congela nuevas mutaciones');
  v_rejected := false;
  begin
    insert into public.follows (user_id, community_id)
    values (v_user, v_community);
  exception when object_not_in_prerequisite_state then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el gate DB rechaza una escritura concurrente');

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.cancel_account_deletion(v_user),
    'si Auth falla, cancelar deja la cuenta intacta y permite reintentar'
  );
  v_result := public.prepare_account_deletion(v_user);

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  delete from auth.users where id = v_user;
  perform pg_temp.ok(
    not exists (select 1 from public.profiles where id = v_user)
    and not exists (
      select 1 from public.user_international_transfer_consents
      where user_id = v_user
    )
    and exists (
      select 1 from private.account_deletion_jobs where user_id = v_user
    ),
    'la outbox sobrevive y el consentimiento se borra con la identidad Auth'
  );

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.mark_account_auth_deleted(v_user),
    'la baja de Auth queda sellada antes de limpiar Storage'
  );
  select count(*) into v_count
  from public.claim_account_deletion_jobs(v_user, 1);
  perform pg_temp.ok(
    v_count = 0,
    'la gracia impide cerrar la outbox mientras puede haber uploads en vuelo'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update private.account_deletion_jobs
  set requested_at = statement_timestamp() - interval '20 minutes',
      auth_deleted_at = statement_timestamp() - interval '20 minutes'
  where user_id = v_user;

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  select * into v_job
  from public.claim_account_deletion_jobs(v_user, 1);
  perform pg_temp.ok(
    v_job.user_id = v_user
    and v_avatar = any(v_job.avatar_paths)
    and v_pending = any(v_job.pending_claim_paths)
    and v_unfinished = any(v_job.pending_claim_paths)
    and not (v_published = any(v_job.pending_claim_paths)),
    'el worker reclama avatar y borrador, nunca evidencia publicada'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  -- El test simula la metadata que elimina la API de Storage; producción nunca
  -- borra esta tabla directamente.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects
  where (bucket_id = 'avatars' and name = any(v_job.avatar_paths))
     or (bucket_id = 'claims' and name = any(v_job.pending_claim_paths));

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    public.finish_account_deletion_job(v_user, null),
    'la limpieza se completa de forma idempotente después de Storage'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  perform pg_temp.ok(
    exists (
      select 1
      from public.claims c
      join public.claim_uploads u on u.claim_id = c.id
      join storage.objects o on o.bucket_id = 'claims' and o.name = u.path
      where c.id = v_claim and c.author_id is null and u.owner_id is null
    )
    and not exists (
      select 1 from public.claim_uploads u where u.path = v_pending
    )
    and not exists (
      select 1 from public.claim_uploads u where u.path = v_unfinished
    )
    and exists (
      select 1 from private.account_deletion_jobs j
      where j.user_id = v_user and j.completed_at is not null
    ),
    'la identidad y el borrador desaparecen; la evidencia cívica queda anónima'
  );

  -- Dead-letter observable, reactivación manual y barrido de objetos que
  -- terminaron de llegar después de perder su tracking.
  insert into private.account_deletion_jobs (
    user_id, requested_at, auth_deleted_at, attempt_count, last_error
  ) values (
    v_dead_user,
    statement_timestamp() - interval '30 minutes',
    statement_timestamp() - interval '30 minutes',
    20,
    'storage_remove_failed'
  );

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  select count(*) into v_count
  from public.claim_account_deletion_jobs(v_dead_user, 1);
  select * into v_stats from public.account_deletion_job_stats();
  perform pg_temp.ok(
    v_count = 0 and v_stats.dead_letter_count = 1,
    'veinte fallos detienen reintentos y disparan una métrica de dead-letter'
  );
  perform pg_temp.ok(
    public.retry_account_deletion_job(v_dead_user),
    'operaciones puede reactivar un dead-letter si Auth ya no existe'
  );
  select * into v_dead_job
  from public.claim_account_deletion_jobs(v_dead_user, 1);
  perform pg_temp.ok(
    v_dead_job.user_id = v_dead_user
    and public.finish_account_deletion_job(v_dead_user, null),
    'el job reactivado vuelve a ser procesable e idempotente'
  );

  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  insert into storage.objects (bucket_id, name, owner_id, created_at) values
    ('claims', v_orphan_claim, v_orphan_user::text,
     statement_timestamp() - interval '2 days'),
    ('avatars', v_orphan_avatar, v_orphan_user::text,
     statement_timestamp() - interval '2 days');

  perform set_config('role', 'service_role', true);
  perform set_config(
    'request.jwt.claims', json_build_object('role', 'service_role')::text, true
  );
  perform pg_temp.ok(
    exists (
      select 1 from public.list_orphan_claim_objects(
        statement_timestamp() - interval '1 day', 100
      ) o where o.path = v_orphan_claim
    )
    and exists (
      select 1 from public.list_orphan_avatar_objects(
        statement_timestamp() - interval '1 day', 100
      ) o where o.path = v_orphan_avatar
    ),
    'el barrido descubre objetos tardíos sin tracking ni perfil'
  );

  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_orphan_user::text, 'role', 'authenticated', 'aal', 'aal1'
    )::text,
    true
  );
  v_rejected := false;
  begin
    perform public.account_deletion_job_stats();
  exception when insufficient_privilege then v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'métricas, retry y barrido no se exponen al navegador'
  );
end;
$$;

rollback;
