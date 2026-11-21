-- Orden global, paginación estable y límites de la lectura pública.
-- Fixtures propias, sin depender de fechas o relevancias del seed.
begin;

create function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then raise exception 'FALLÓ · %', p_what; end if;
  raise notice '  ok   · %', p_what;
end;
$$;
grant execute on function pg_temp.ok(boolean, text) to anon, authenticated;

do $$
declare
  v_scope uuid := gen_random_uuid();
  v_ids uuid[];
  v_expected uuid[];
  v_recent uuid[];
  v_relevance uuid[];
  v_sort text;
  v_role text;
begin
  insert into public.communities(id, slug, name, level, path)
  values(v_scope, 'search-order-fixture', 'Scope', 0, 'search-order-fixture');
  -- 65 resultados: cuatro páginas, títulos/fechas empatados y los resultados
  -- de menor relevancia más nuevos que todos los de relevancia alta.
  insert into public.communities(slug, name, description, level, parent_id, path, created_at)
  select 'search-order-' || n,
    case when n <= 40 then 'zzsearchordercheck' else 'Resultado' end,
    'zzsearchordercheck', 1, v_scope, 'search-order-fixture.search-order-' || n,
    timestamptz '2020-01-01 00:00:00+00' + (n / 10) * interval '1 day'
  from generate_series(1, 65) n;

  insert into public.claims(community_id, title, description, category, status)
  values(v_scope, 'zzsearchordercheck', 'Contenido retirado de la búsqueda', 'otro', 'removed');

  foreach v_sort in array array['relevancia', 'recientes'] loop
    select array_agg(c.id order by
      case when v_sort = 'recientes' then c.created_at end desc nulls last,
      case when c.name = 'zzsearchordercheck' then 100 else 10 end desc,
      c.created_at desc, c.name collate "C", c.id)
    into v_expected from public.communities c where c.parent_id = v_scope;

    foreach v_role in array array['anon', 'authenticated'] loop
      perform set_config('role', v_role, true);
      perform set_config('request.jwt.claims',
        case when v_role = 'authenticated'
          then '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}'
          else '' end, true);
      select array_agg(r.id order by p.offset_value, r.ordinality)
      into v_ids
      from (values(0), (20), (40), (60)) p(offset_value)
      cross join lateral public.global_search(
        'zzsearchordercheck', null, v_scope, null, 20, p.offset_value, v_sort
      ) with ordinality r;
      perform pg_temp.ok(v_ids = v_expected,
        v_role || ': cuatro páginas ordenadas globalmente por ' || v_sort || ', con desempates estables');
      perform pg_temp.ok(cardinality(v_ids) = 65 and
        (select count(distinct id) from unnest(v_ids) id) = 65,
        v_role || ': sin duplicados, omisiones ni contenido retirado');
      perform pg_temp.ok((select bool_and(total_count = 65)
        from public.global_search('zzsearchordercheck', null, v_scope, null, 20, 40, v_sort)),
        v_role || ': total exacto en páginas posteriores');
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
    end loop;
    if v_sort = 'recientes' then v_recent := v_ids; else v_relevance := v_ids; end if;
  end loop;
  perform pg_temp.ok(v_recent[1] <> v_relevance[1], 'recientes cambia el conjunto de la primera página');

  perform set_config('role', 'anon', true);
  select array_agg(r.id order by r.ordinality) into v_ids
  from public.global_search('zzsearchordercheck', null, v_scope, null, 20, 0) with ordinality r;
  perform pg_temp.ok(v_ids = v_relevance[1:20], 'la firma anterior conserva relevancia y paginación');
  perform pg_temp.ok((select count(*) = 50 from public.global_search(
    'zzsearchordercheck', null, v_scope, null, 999, -1, 'recientes')), 'el límite público sigue siendo 50');
  perform pg_temp.ok((select count(*) = 0 from public.global_search(
    'zzsearchordercheck', 'claim', v_scope, null, 20, 0, 'recientes')), 'el filtro de tipo no revela retirados');
  perform pg_temp.ok((select count(*) = 0 from public.global_search(
    'zzsearchordercheck', null, v_scope, 'closed', 20, 0, 'recientes')), 'el estado se filtra antes de contar');
  perform pg_temp.ok((select count(*) = 0 from public.global_search(
    'zzsearchordercheck', null, null, null, 20, 0, 'invalid')), 'rechaza un orden no permitido');
  perform pg_temp.ok((select count(*) = 0 from public.global_search(
    '%%%', null, null, null, 20, 0, 'recientes')), 'el orden nuevo conserva el escape de comodines');
  perform set_config('role', 'postgres', true);
  perform pg_temp.ok(not has_function_privilege('anon',
    'private.global_search_ordered(text,text,uuid,text,integer,integer,text)', 'EXECUTE')
    and not has_function_privilege('authenticated',
    'private.global_search_ordered(text,text,uuid,text,integer,integer,text)', 'EXECUTE'),
    'el motor no se puede invocar saltando los límites públicos');
end;
$$;

rollback;
