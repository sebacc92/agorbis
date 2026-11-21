-- Alias públicos: privacidad, renombres, compatibilidad y borrado.
begin;

create function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'FALLÓ · %', p_what; end if;
  raise notice '  ok   · %', p_what;
end;
$$;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated;

create function pg_temp.create_handle_user(p_id uuid, p_username text)
returns void language sql as $$
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
    'authenticated', p_id::text || '@agorbis.test', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', p_username), now(), now()
  );
$$;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_signup uuid := gen_random_uuid();
  v_rejected boolean;
  v_keys text[];
  v_role text;
begin
  perform pg_temp.create_handle_user(v_owner, 'handle_before');
  perform pg_temp.create_handle_user(v_other, 'handle_other');
  update public.profiles set bio = 'BIO PRIVADA',
    home_community_id = (select id from public.communities where slug = 'earth')
  where id = v_owner;

  perform pg_temp.ok((select bool_and(h.user_id is not distinct from p.id)
    from public.profiles p left join private.public_profile_handles h
    on h.handle_hash = pg_catalog.sha256(pg_catalog.convert_to(p.username, 'UTF8'))),
    'todos los nombres existentes y nuevos tienen reserva');
  perform pg_temp.ok(not has_table_privilege('anon', 'private.public_profile_handles', 'SELECT')
    and not has_table_privilege('authenticated', 'private.public_profile_handles', 'SELECT')
    and not has_table_privilege('service_role', 'private.public_profile_handles', 'SELECT'),
    'el registro de aliases no se expone a los clientes');

  foreach v_role in array array['anon', 'authenticated'] loop
    perform set_config('role', v_role, true);
    perform set_config('request.jwt.claims', case when v_role = 'authenticated'
      then jsonb_build_object('sub', v_other, 'role', 'authenticated', 'aal', 'aal1')::text
      else '' end, true);
    perform pg_temp.ok((select count(*) = 0 from public.profiles where id = v_owner),
      v_role || ': la tabla de perfiles mantiene su RLS');
    perform pg_temp.ok((select id = v_owner from public.public_profile_by_username('HANDLE_BEFORE')),
      v_role || ': resuelve la identidad pública sin sesión del dueño');
    select array_agg(k order by k) into v_keys
    from public.public_profile_by_username('handle_before') p,
      lateral jsonb_object_keys(to_jsonb(p)) k;
    perform pg_temp.ok(v_keys = array['avatar_url', 'display_name', 'id', 'username'],
      v_role || ': no expone bio, residencia, votos ni fechas privadas');
    perform pg_temp.ok((select count(*) = 0 from public.public_profile_by_username('../perfil'))
      and (select count(*) = 0 from public.public_profile_by_username(repeat('a', 101)))
      and (select count(*) = 0 from public.public_profile_by_username('unknown_handle')),
      v_role || ': nombres inválidos y desconocidos no devuelven filas');
    v_rejected := false;
    begin
      perform 1 from private.public_profile_handles;
    exception when insufficient_privilege then v_rejected := true;
    end;
    perform pg_temp.ok(v_rejected, v_role || ': no puede consultar reservas directamente');
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
  end loop;

  -- El cambio real pasa por la misma escritura permitida al dueño del perfil.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select version from public.international_transfer_notice_versions
     where is_current and effective_at <= now()), true, 'es');
  update public.profiles set username = 'handle_after' where id = v_owner;
  perform pg_temp.ok((select id = v_owner and username = 'handle_after'
    from public.public_profile_by_username('handle_before')),
    'el enlace anterior sigue apuntando a la misma persona y devuelve su nombre actual');
  perform pg_temp.ok((select username = 'handle_after' from public.public_profile(v_owner)),
    'la resolución por UUID antigua conserva su contrato');
  update public.profiles set username = 'handle_before' where id = v_owner;
  perform pg_temp.ok((select username = 'handle_before' from public.public_profile_by_username('handle_after')),
    'la misma persona puede recuperar un alias propio sin crear un ciclo de resolución');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  v_rejected := false;
  begin
    update public.profiles set username = 'handle_after' where id = v_other;
  exception when unique_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'otra persona no puede apropiarse de un enlace histórico');
  perform pg_temp.create_handle_user(v_signup, 'handle_after');
  perform pg_temp.ok((select username ~ '^user_[0-9a-f]{12}$' from public.profiles where id = v_signup),
    'metadata con un alias reservado no bloquea el alta y conserva el placeholder del onboarding');

  delete from auth.users where id = v_owner;
  perform pg_temp.ok((select count(*) = 0 from public.public_profile_by_username('handle_before'))
    and (select count(*) = 0 from public.public_profile_by_username('handle_after'))
    and (select count(*) = 0 from public.public_profile(v_owner)),
    'al eliminar la cuenta, UUID y ambos aliases dejan de resolver');
  perform pg_temp.ok((select count(*) = 2 and bool_and(user_id is null)
    from private.public_profile_handles where handle_hash in (
      pg_catalog.sha256(pg_catalog.convert_to('handle_before', 'UTF8')),
      pg_catalog.sha256(pg_catalog.convert_to('handle_after', 'UTF8')))),
    'el borrado deja sólo reservas de alias sin vínculo a la cuenta');
  v_rejected := false;
  begin
    update public.profiles set username = 'handle_after' where id = v_other;
  exception when unique_violation then v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'un enlace de cuenta eliminada no se reasigna a otra cuenta');
end;
$$;

rollback;
