// SQL común de los borradores de nivel 4 fuera de Argentina (D129-D131).
// Cada país arma sus filas con su propia fuente; esto sólo las escribe con las
// mismas guardas: transacción, falla cerrado y total verificado al final.

/**
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, description: string,
 *   lat?: number, lng?: number,
 * }} DraftRow
 * @typedef {{
 *   number: string,
 *   title: string,
 *   generator: string,
 *   countryPath: string,
 *   parentLabel: string,
 *   header: ReadonlyArray<string>,
 * }} DraftOptions
 */

/** @param {string} value */
function literal(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Coordenadas de la fila como SQL. Sin ninguna van vacías (el GPS del
 * onboarding ignora esas comunidades); con una sola o fuera de rango, falla.
 *
 * @param {DraftRow} row
 */
function point(row) {
  if (row.lat === undefined && row.lng === undefined) return "null, null";
  const valid =
    typeof row.lat === "number" &&
    typeof row.lng === "number" &&
    Math.abs(row.lat) <= 90 &&
    Math.abs(row.lng) <= 180;
  if (!valid) {
    throw new Error(
      `Coordenadas inválidas en ${row.slug}: ${row.lat}, ${row.lng}`,
    );
  }
  return `${row.lat}, ${row.lng}`;
}

/**
 * @param {ReadonlyArray<DraftRow>} rows
 * @param {DraftOptions} options
 * @returns {string}
 */
export function renderLevel4DraftSql(rows, options) {
  const { number, title, generator, countryPath, parentLabel, header } =
    options;
  // Van pegados al SQL y a los códigos de error: mejor fallar acá que
  // escribir un borrador que no corre.
  if (!/^\d{4}$/.test(number)) {
    throw new Error(`El número de migración debe tener 4 dígitos: ${number}`);
  }
  if (!/^[A-Z]+$/.test(parentLabel)) {
    throw new Error(`parentLabel va en mayúsculas sin tildes: ${parentLabel}`);
  }
  if (!/^[a-z0-9.-]+$/.test(countryPath)) {
    throw new Error(`Path de país inválido: ${countryPath}`);
  }
  if (!rows.length) throw new Error("No hay filas para el borrador");

  const code = `AGORBIS_${number}`;
  const values = rows
    .map(
      (row) =>
        `  (${literal(row.slug)}, ${literal(row.name)}, ${literal(row.parentSlug)}, ${literal(row.description)}, ${point(row)})`,
    )
    .join(",\n");
  const notes = header.map((line) => `-- ${line}`.trimEnd()).join("\n");

  return `-- =============================================================================
-- Agorbis · ${number} · ${title}
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por ${generator}; no se edita a mano.
--
${notes}
-- =============================================================================

begin;

set local search_path = '';

create temporary table level4_rows (
  slug text primary key,
  name text not null,
  parent_slug text not null,
  description text not null,
  lat double precision,
  lng double precision
) on commit drop;

insert into pg_temp.level4_rows (slug, name, parent_slug, description, lat, lng) values
${values};

-- Falla cerrado: si el esquema o los datos no son los que se revisaron, no
-- inserta nada en vez de dejar una carga a medias.
do $guard$
declare
  v_missing text;
begin
  select string_agg(distinct i.parent_slug, ', ') into v_missing
  from pg_temp.level4_rows i
  where not exists (
    select 1 from public.communities p
    where p.slug = i.parent_slug and p.level = 3
      and p.path = '${countryPath}.' || p.slug
  );
  if v_missing is not null then
    raise exception '${code}_MISSING_${parentLabel}: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception '${code}_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := ${rows.length};
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like '${countryPath}.%';
  if v_level4 <> v_expected_level4 then
    raise exception '${code}_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
`;
}
