-- =============================================================================
-- Agorbis · privacidad de geolocalización de reclamos (0040)
-- Ejecutar después de `supabase db reset`. Todo termina en ROLLBACK.
-- =============================================================================

begin;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if coalesce(p_condition, false) then
    raise notice '  ok   · %', p_what;
  else
    raise exception 'FALLÓ · %', p_what;
  end if;
end $$;

do $$
declare
  v_author uuid;
  v_community uuid;
  v_claim uuid;
  v_lat double precision;
  v_lng double precision;
  v_rejected boolean;
begin
  select id, home_community_id
    into v_author, v_community
  from public.profiles
  where username = 'sofia_mdq';

  perform pg_temp.ok(v_author is not null and v_community is not null,
    'el fixture geográfico existe');

  insert into public.claims (
    community_id, author_id, title, description, category, lat, lng
  ) values (
    v_community, v_author, 'Privacidad de ubicación',
    'La base no debe conservar el punto GPS.', 'otro',
    -38.0055274, -57.5426107
  ) returning id, lat, lng into v_claim, v_lat, v_lng;

  perform pg_temp.ok(v_lat = -38.006 and v_lng = -57.543,
    'INSERT cuantiza el punto antes de persistirlo');

  update public.claims
  set lat = -34.603722, lng = -58.381592
  where id = v_claim
  returning lat, lng into v_lat, v_lng;

  perform pg_temp.ok(v_lat = -34.604 and v_lng = -58.382,
    'UPDATE tampoco puede restaurar precisión exacta');

  update public.claims
  set lat = -1.2345, lng = 1.2345
  where id = v_claim
  returning lat, lng into v_lat, v_lng;

  perform pg_temp.ok(v_lat = -1.235 and v_lng = 1.235,
    'el desempate es simétrico y se aleja de cero');

  begin
    insert into public.claims (
      community_id, author_id, title, description, category, lat, lng
    ) values (
      v_community, v_author, 'Media coordenada', 'Debe fallar.', 'otro', 10, null
    );
    v_rejected := false;
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el trigger rechaza un par incompleto');

  begin
    insert into public.claims (
      community_id, author_id, title, description, category, lat, lng
    ) values (
      v_community, v_author, 'Coordenada infinita', 'Debe fallar.', 'otro',
      'Infinity'::double precision, 0
    );
    v_rejected := false;
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el trigger rechaza coordenadas no finitas');

  perform pg_temp.ok(
    not exists (
      select 1 from public.claims
      where lat is not null
        and (
          lat::numeric <> round(lat::numeric, 3)
          or lng::numeric <> round(lng::numeric, 3)
        )
    ),
    'ningún reclamo existente conserva más de tres decimales'
  );

  perform pg_temp.ok(
    exists (
      select 1
      from pg_trigger
      where tgrelid = 'public.claims'::regclass
        and tgname = 'claims_quantize_public_location'
        and tgenabled <> 'D'
    ),
    'la cuantización autoritativa está activa en claims'
  );
end $$;

rollback;
