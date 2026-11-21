-- 0071: búsqueda global entre miembros con opt-in, antes de LIMIT y cursor.
-- Fixtures propias y rollback; no cambia residencias ni preferencias del seed.
begin;

create function pg_temp.member_ok(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'FALLÓ · %', p_message; end if;
  raise notice '  ok · %', p_message;
end;
$$;
grant execute on function pg_temp.member_ok(boolean, text) to anon, authenticated;

do $$
declare
  v_scope uuid := gen_random_uuid();
  v_other_scope uuid := gen_random_uuid();
  v_user uuid;
  v_role text;
  v_ids text[];
  v_expected text[];
  v_old text[];
  v_first text[];
  v_next text[];
begin
  insert into public.communities(id, slug, name, level, path) values
    (v_scope, 'member-search-fixture', 'Fixture', 0, 'member-search-fixture'),
    (v_other_scope, 'member-search-outside', 'Otra fixture', 0, 'member-search-outside');
  insert into auth.users(instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
    'authenticated', 'authenticated', 'msearch-' || n || '@agorbis.test', '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', 'msearch_' || lpad(n::text, 4, '0'),
      'display_name', case when n > 100 then 'Coincidencia final' else 'Persona inicial' end),
    now(), now()
  from generate_series(1, 111) n;
  insert into private.avatar_uploads(path, owner_id, upload_completed_at)
  select id::text || '/33333333-3333-4333-8333-333333333333.png', id, now()
  from public.profiles where username like 'msearch\_%' escape '\'
    and right(username, 4)::integer % 2 = 0;
  insert into storage.objects(bucket_id, name, owner_id)
  select 'avatars', path, owner_id::text from private.avatar_uploads
  where path like '%/33333333-3333-4333-8333-333333333333.png';
  update public.profiles set home_community_id = case
    when username = 'msearch_0111' then v_other_scope else v_scope end,
    avatar_url = case when right(username, 4)::integer % 2 = 0
      then '/media/avatares/' || id::text || '/33333333-3333-4333-8333-333333333333.png'
      else null end
  where username like 'msearch\_%' escape '\';
  insert into public.community_visibility(user_id, community_id, is_anonymous)
  select id, v_scope, username = 'msearch_0110'
  from public.profiles where username like 'msearch\_%' escape '\'
    and username <> 'msearch_0109';
  select id into v_user from public.profiles where username = 'msearch_0001';
  select array_agg(username order by username) into v_expected
  from public.profiles where username between 'msearch_0101' and 'msearch_0108';

  foreach v_role in array array['anon', 'authenticated'] loop
    perform set_config('role', v_role, true);
    perform set_config('request.jwt.claims', case when v_role = 'authenticated'
      then jsonb_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text
      else '' end, true);
    select array_agg(username order by username) into v_ids
      from public.community_public_members(v_scope, null, 100, 'coincidencia', false);
    perform pg_temp.member_ok(v_ids = v_expected,
      v_role || ': encuentra coincidencias posteriores a la primera página de 100');
    select array_agg(username order by username) into v_first
      from public.community_public_members(v_scope, null, 3, '  COINCIDENCIA  ', false);
    select array_agg(username order by username) into v_next
      from public.community_public_members(v_scope, v_first[3], 3, 'coincidencia', false);
    perform pg_temp.member_ok(v_first = v_expected[1:3] and v_next = v_expected[4:6],
      v_role || ': consulta normalizada y cursor conservan el orden sin saltar coincidencias');
    perform pg_temp.member_ok((select count(*) = 4 and bool_and(avatar_url is not null)
      from public.community_public_members(v_scope, null, 100, 'coincidencia', true)),
      v_role || ': foto y término se combinan antes de paginar');
    perform pg_temp.member_ok((select count(*) = 0
      from public.community_public_members(v_scope, null, 100, 'msearch_0109', false))
      and (select count(*) = 0
      from public.community_public_members(v_scope, null, 100, 'msearch_0110', false))
      and (select count(*) = 0
      from public.community_public_members(v_scope, null, 100, 'msearch_0111', false)),
      v_role || ': no revela identidad sin opt-in, anónima explícita ni residencia externa');
    perform pg_temp.member_ok((select count(*) = 0
      from public.community_public_members(v_scope, null, 100, '%', false)),
      v_role || ': comodines del término se buscan como texto literal');
    select array_agg(username order by username) into v_old
      from public.community_public_members(v_scope, null, 100);
    select array_agg(username order by username) into v_ids
      from public.community_public_members(v_scope, null, 100, '', false);
    perform pg_temp.member_ok(v_old = v_ids and cardinality(v_ids) = 100,
      v_role || ': la firma anterior mantiene compatibilidad y el mismo primer bloque');
    perform pg_temp.member_ok((select public_count = 108 and anonymous_count = -1
      from public.community_member_visibility_counts(v_scope)),
      v_role || ': conteo de anonimato conserva umbral y no depende de la búsqueda');
    perform pg_temp.member_ok((select array_agg(k order by k) =
      array['avatar_url', 'display_name', 'user_id', 'username']
      from public.community_public_members(v_scope, null, 1, null, false) r,
      lateral jsonb_object_keys(to_jsonb(r)) k),
      v_role || ': la respuesta conserva sólo las cuatro propiedades públicas');
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
  end loop;
  update public.community_visibility set is_anonymous = true
    where community_id = v_scope and user_id = v_user;
  perform set_config('role', 'anon', true);
  perform pg_temp.member_ok((select count(*) = 0
    from public.community_public_members(v_scope, null, 100, 'msearch_0001', false)),
    'revocar opt-in quita inmediatamente la identidad de los resultados');
  perform set_config('role', 'postgres', true);
end;
$$;

rollback;
