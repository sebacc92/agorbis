-- 0070: filtros previos al límite, cursor estable y privacidad del inicio.
-- Sólo fixtures transaccionales; no cambia residencia ni aceptaciones del seed.
begin;

create function pg_temp.feed_ok(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALLÓ · %', p_message;
  end if;
  raise notice '  ok · %', p_message;
end;
$$;
grant execute on function pg_temp.feed_ok(boolean, text) to authenticated;

do $$
declare
  v_user uuid;
  v_other uuid;
  v_home uuid;
  v_root uuid;
  v_home_slug text;
  v_root_slug text;
  v_first uuid[];
  v_second uuid[];
  v_expected uuid[];
  v_cursor uuid;
  v_cursor_time timestamptz;
  v_old uuid[];
  v_new uuid[];
begin
  select id, home_community_id into v_user, v_home
    from public.profiles where username = 'sofia_mdq';
  select id into v_other from public.profiles where username = 'bruno_lp';
  select slug into v_home_slug from public.communities where id = v_home;
  select id, slug into v_root, v_root_slug from public.communities where slug = 'earth';
  perform pg_temp.feed_ok(v_user is not null and v_other is not null
    and v_home is not null and v_root is not null, 'hay residencia y cuentas del seed local');

  -- 30 coincidencias con la misma fecha, detrás de 28 encuestas más nuevas de
  -- otra escala: filtrar después de LIMIT 24 devolvía un inicio falso vacío.
  insert into public.claims(community_id, title, description, category, created_at)
  select v_home, 'feed-filter-fixture-' || n, 'Fixture de paginación', 'otro',
    timestamptz '2090-01-01 00:00:00+00'
  from generate_series(1, 30) n;
  insert into public.claims(community_id, title, description, category, status, created_at)
  values(v_home, 'feed-filter-fixture-removed', 'No debe aparecer', 'otro', 'removed',
    timestamptz '2093-01-01 00:00:00+00');
  insert into public.polls(community_id, question, type, results_visibility, closes_at, created_at)
  select v_root, 'feed-poll-fixture-' || n, 'binary', 'after_close',
    timestamptz '2095-01-01 00:00:00+00', timestamptz '2091-01-01 00:00:00+00'
  from generate_series(1, 28) n;
  insert into public.polls(community_id, question, type, results_visibility, status, closes_at, created_at)
  values
    (v_root, 'feed-poll-fixture-expired', 'binary', 'after_close', 'active',
      timestamptz '2020-01-01 00:00:00+00', timestamptz '2091-01-01 00:00:00+00'),
    (v_root, 'feed-poll-fixture-closed', 'binary', 'after_close', 'closed',
      timestamptz '2020-01-01 00:00:00+00', timestamptz '2091-01-01 00:00:00+00');
  select array_agg(id order by created_at desc, id desc) into v_expected
  from public.claims where community_id = v_home
    and title like 'feed-filter-fixture-%' and status <> 'removed';

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_user, 'role', 'authenticated', 'aal', 'aal1')::text, true);

  select array_agg(r.id order by r.ordinality) into v_first
  from public.personalized_feed(v_user, 24, null, null, v_home_slug, 'claim')
    with ordinality r;
  perform pg_temp.feed_ok(v_first = v_expected[1:24],
    'comunidad y tipo se aplican antes del límite aunque las primeras 24 filas globales no coincidan');
  perform pg_temp.feed_ok((select count(*) = 24
    from public.personalized_feed(v_user, 24, null, null, null, 'claim') r
    where r.title like 'feed-filter-fixture-%'), 'tipo por sí solo filtra antes de paginar');
  perform pg_temp.feed_ok((select count(*) = 24
    from public.personalized_feed(v_user, 24, null, null, v_home_slug, null) r
    where r.title like 'feed-filter-fixture-%'), 'comunidad por sí sola filtra antes de paginar');

  select id, created_at into v_cursor, v_cursor_time
  from public.personalized_feed(v_user, 24, null, null, v_home_slug, 'claim')
  order by created_at, id limit 1;
  select array_agg(r.id order by r.created_at desc, r.id desc) into v_second
  from public.personalized_feed(v_user, 24, v_cursor_time, v_cursor, v_home_slug, 'claim') r
  where r.title like 'feed-filter-fixture-%';
  perform pg_temp.feed_ok(v_second = v_expected[25:30]
    and cardinality(v_first || v_second) = 30
    and (select count(distinct id) from unnest(v_first || v_second) id) = 30,
    'la segunda página conserva filtros sin omitir ni repetir fechas empatadas');

  perform pg_temp.feed_ok((select count(*) = 0
    from public.personalized_feed(v_user, 24, null, null, 'cordoba', 'claim')),
    'el filtro no agrega comunidades externas a la cadena de residencia');
  perform pg_temp.feed_ok((select count(*) = 0
    from public.personalized_feed(v_other, 24, null, null, null, null)),
    'no se puede leer el inicio de otra cuenta');
  perform pg_temp.feed_ok((select count(*) = 0
    from public.personalized_feed(v_user, 24, null, null, null, 'invalid')),
    'un tipo inválido no amplía el conjunto');
  perform pg_temp.feed_ok((select bool_and(r.status = 'closed' and r.engagement = 0)
    from public.personalized_feed(v_user, 100, null, null, v_root_slug, 'poll') r
    where r.title in ('feed-poll-fixture-expired', 'feed-poll-fixture-closed')),
    'encuestas cerradas o vencidas no se anuncian abiertas y conservan resultados protegidos');
  perform pg_temp.feed_ok((select count(*) = 1
    from public.personalized_feed(v_user, 0, null, null, v_home_slug, 'claim')),
    'se conserva el límite mínimo de una fila');

  select array_agg(r.id order by r.ordinality) into v_old
    from public.personalized_feed(v_user, 24, null, null) with ordinality r;
  select array_agg(r.id order by r.ordinality) into v_new
    from public.personalized_feed(v_user, 24, null, null, null, null) with ordinality r;
  perform pg_temp.feed_ok(v_old = v_new,
    'la firma anterior sigue disponible y sin filtros conserva el orden y las filas');
  perform pg_temp.feed_ok(not has_function_privilege('anon',
    'public.personalized_feed(uuid,integer,timestamptz,uuid,text,text)', 'execute'),
    'el nuevo inicio no amplía el acceso anónimo');
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

rollback;
