-- Agorbis · distribución geográfica del baseline: 0058 más los gobiernos
-- locales de Argentina de 0076 (D127).
begin;

do $$
declare
  v_total bigint;
  v_by_level jsonb;
begin
  select count(*)
  into v_total
  from public.communities;

  select coalesce(
    jsonb_object_agg(level::text, total order by level),
    '{}'::jsonb
  )
  into v_by_level
  from (
    select level, count(*)::bigint as total
    from public.communities
    group by level
  ) counts;

  -- 3901 de 0058 más las 1981 de 0076.
  if v_total <> 5882 then
    raise exception
      'FALLÓ · baseline 0076: se esperaban 5882 comunidades y hay %',
      v_total;
  end if;

  if v_by_level <> '{"0":1,"1":6,"2":195,"3":3559,"4":2116,"5":5}'::jsonb then
    raise exception
      'FALLÓ · distribución geográfica inesperada: %',
      v_by_level;
  end if;

  raise notice '  ok   · baseline 0076 contiene 5882 comunidades';
  raise notice '  ok   · distribución 0:1, 1:6, 2:195, 3:3559, 4:2116, 5:5';
end;
$$;

-- D127: ninguna jurisdicción argentina queda sin nivel 4.
do $$
declare
  v_empty text;
begin
  select string_agg(p.slug, ', ' order by p.slug)
  into v_empty
  from public.communities p
  where p.level = 3
    and p.path like 'earth.south-america.argentina.%'
    and not exists (
      select 1 from public.communities c where c.parent_id = p.id
    );

  if v_empty is not null then
    raise exception 'FALLÓ · jurisdicciones sin nivel 4: %', v_empty;
  end if;

  raise notice '  ok   · las 24 jurisdicciones argentinas tienen nivel 4';
end;
$$;

-- D127: las localidades bonaerenses cuelgan de su partido, no de la provincia.
do $$
declare
  v_wrong text;
begin
  select string_agg(e.slug, ', ' order by e.slug)
  into v_wrong
  from (values
    ('mar-del-plata', 'ba-general-pueyrredon'),
    ('miramar', 'ba-general-alvarado'),
    ('mar-del-sud', 'ba-general-alvarado'),
    ('mechongue', 'ba-general-alvarado'),
    ('otamendi', 'ba-general-alvarado')
  ) as e (slug, parent_slug)
  where not exists (
    select 1
    from public.communities c
    join public.communities p on p.id = c.parent_id
    where c.slug = e.slug
      and c.level = 5
      and p.slug = e.parent_slug
      and c.path = p.path || '.' || c.slug
  );

  if v_wrong is not null then
    raise exception 'FALLÓ · localidades fuera de su partido: %', v_wrong;
  end if;

  raise notice '  ok   · las 5 localidades bonaerenses son nivel 5 bajo su partido';
end;
$$;

-- D127: dos gobiernos locales de una provincia no comparten nombre visible.
do $$
declare
  v_repeated text;
begin
  select string_agg(r.label, ', ' order by r.label)
  into v_repeated
  from (
    select p.slug || '/' || c.name as label
    from public.communities c
    join public.communities p on p.id = c.parent_id
    where c.level = 4
      and c.path like 'earth.south-america.argentina.%'
    group by p.slug, c.name
    having count(*) > 1
  ) r;

  if v_repeated is not null then
    raise exception 'FALLÓ · nombres repetidos en una provincia: %', v_repeated;
  end if;

  raise notice '  ok   · ningún nombre de nivel 4 se repite dentro de su provincia';
end;
$$;

rollback;
