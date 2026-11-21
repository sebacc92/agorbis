-- =============================================================================
-- 0040 · Los reclamos sólo conservan una ubicación pública aproximada
-- =============================================================================
-- Las coordenadas de `claims` son legibles desde Internet. Guardar el punto que
-- entrega el GPS (aunque la UI lo llamara "aproximado") permitía inferir una
-- vivienda o rutina. Tres decimales forman una cuadrícula de ~110 m en latitud
-- y de hasta ~110 m en longitud: conserva utilidad cívica sin retener el dato
-- exacto. La app redondea antes de la vista previa, pero esta garantía vive en
-- la base para cubrir PostgREST, scripts, importaciones y clientes viejos.
-- =============================================================================

begin;

create or replace function private.quantize_claim_public_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.lat is null and new.lng is null then
    return new;
  end if;

  if new.lat is null or new.lng is null then
    raise check_violation using
      constraint = 'claims_coords_pair_chk',
      message = 'claim latitude and longitude must be provided together';
  end if;

  -- PostgreSQL ordena NaN por encima de los números finitos; por eso estas
  -- comparaciones también rechazan NaN e infinitos antes del cast a numeric.
  if new.lat < -90 or new.lat > 90
     or new.lng < -180 or new.lng > 180 then
    raise check_violation using
      constraint = 'claims_coords_range_chk',
      message = 'claim coordinates are outside the valid geographic range';
  end if;

  new.lat := round(new.lat::numeric, 3)::double precision;
  new.lng := round(new.lng::numeric, 3)::double precision;
  return new;
end;
$$;

revoke all on function private.quantize_claim_public_location() from public;
revoke all on function private.quantize_claim_public_location() from anon, authenticated;

drop trigger if exists claims_quantize_public_location on public.claims;
create trigger claims_quantize_public_location
  before insert or update of lat, lng on public.claims
  for each row execute function private.quantize_claim_public_location();

-- El trigger ya protege escrituras concurrentes mientras se degrada la
-- precisión histórica. El WHERE evita reescribir filas ya conformes.
update public.claims
set lat = round(lat::numeric, 3)::double precision,
    lng = round(lng::numeric, 3)::double precision
where lat is not null
  and (
    lat::numeric <> round(lat::numeric, 3)
    or lng::numeric <> round(lng::numeric, 3)
  );

-- Defensa adicional: incluso si alguien deshabilita o reemplaza el trigger,
-- una fila con más precisión no puede quedar persistida sin retirar primero el
-- constraint de forma explícita y auditable.
alter table public.claims
  drop constraint if exists claims_coords_public_precision_chk;
alter table public.claims
  add constraint claims_coords_public_precision_chk check (
    lat is null
    or (
      lat::numeric = round(lat::numeric, 3)
      and lng::numeric = round(lng::numeric, 3)
    )
  );

comment on column public.claims.lat is
  'Latitud pública aproximada del reclamo, opcional, cuantizada a 3 decimales (~110 m) y siempre junto con lng.';
comment on column public.claims.lng is
  'Longitud pública aproximada del reclamo, opcional, cuantizada a 3 decimales (hasta ~110 m) y siempre junto con lat.';
comment on constraint claims_coords_public_precision_chk on public.claims is
  'Impide conservar o publicar coordenadas de reclamos con más de 3 decimales.';

commit;
