// Lógica pura de la migración 0076, que completa el nivel 4 de Argentina (D127). No
// descarga nada: recibe lo que devolvió la API Georef y arma filas y SQL, para
// que el spec pruebe todo sin red y la descarga quede en el script de al lado.

const ARGENTINA_PATH = "earth.south-america.argentina";

/**
 * Jurisdicción de Georef → comunidad de nivel 3 que ya existe en la base.
 * `source` dice de dónde sale su nivel 4: Buenos Aires ya tiene sus 135
 * partidos (0014) y en Santa Cruz y Santiago del Estero Georef no trae
 * municipios, así que ahí se usan departamentos para no dejarlas vacías.
 */
export const PROVINCES = new Map([
  [
    "02",
    {
      slug: "caba",
      name: "Ciudad Autónoma de Buenos Aires",
      source: "municipios",
    },
  ],
  ["06", { slug: "buenos-aires", name: "Buenos Aires", source: "existing" }],
  ["10", { slug: "catamarca", name: "Catamarca", source: "municipios" }],
  ["14", { slug: "cordoba", name: "Córdoba", source: "municipios" }],
  ["18", { slug: "corrientes", name: "Corrientes", source: "municipios" }],
  ["22", { slug: "chaco", name: "Chaco", source: "municipios" }],
  ["26", { slug: "chubut", name: "Chubut", source: "municipios" }],
  ["30", { slug: "entre-rios", name: "Entre Ríos", source: "municipios" }],
  ["34", { slug: "formosa", name: "Formosa", source: "municipios" }],
  ["38", { slug: "jujuy", name: "Jujuy", source: "municipios" }],
  ["42", { slug: "la-pampa", name: "La Pampa", source: "municipios" }],
  ["46", { slug: "la-rioja", name: "La Rioja", source: "municipios" }],
  ["50", { slug: "mendoza", name: "Mendoza", source: "municipios" }],
  ["54", { slug: "misiones", name: "Misiones", source: "municipios" }],
  ["58", { slug: "neuquen", name: "Neuquén", source: "municipios" }],
  ["62", { slug: "rio-negro", name: "Río Negro", source: "municipios" }],
  ["66", { slug: "salta", name: "Salta", source: "municipios" }],
  ["70", { slug: "san-juan", name: "San Juan", source: "municipios" }],
  ["74", { slug: "san-luis", name: "San Luis", source: "municipios" }],
  ["78", { slug: "santa-cruz", name: "Santa Cruz", source: "departamentos" }],
  ["82", { slug: "santa-fe", name: "Santa Fe", source: "municipios" }],
  [
    "86",
    {
      slug: "santiago-del-estero",
      name: "Santiago del Estero",
      source: "departamentos",
    },
  ],
  ["90", { slug: "tucuman", name: "Tucumán", source: "municipios" }],
  [
    "94",
    {
      slug: "tierra-del-fuego",
      name: "Tierra del Fuego",
      source: "municipios",
    },
  ],
]);

/** Partidos bonaerenses que ya existen y siguen siendo nivel 4. */
export const EXISTING_BUENOS_AIRES_LEVEL4 = 135;

/**
 * Localidades cargadas como nivel 4 al lado de su propio partido (seed y
 * 0017). Pasan a nivel 5 bajo el partido para que una misma ciudad no tenga
 * dos comunidades hermanas que partan la participación.
 */
export const LOCALITY_MOVES = Object.freeze([
  { slug: "mar-del-plata", parentSlug: "ba-general-pueyrredon" },
  { slug: "miramar", parentSlug: "ba-general-alvarado" },
  { slug: "mar-del-sud", parentSlug: "ba-general-alvarado" },
  { slug: "mechongue", parentSlug: "ba-general-alvarado" },
  { slug: "otamendi", parentSlug: "ba-general-alvarado" },
]);

/** @param {string} text */
export function slugify(text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @param {{ slug: string, name: string }} province @param {string} source */
function describe(province, source) {
  if (province.slug === "caba") {
    return "Comuna de la Ciudad Autónoma de Buenos Aires";
  }
  return source === "departamentos"
    ? `Departamento de ${province.name}`
    : `Gobierno local de ${province.name}`;
}

/** @param {unknown} value */
function coordinate(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 1e6) / 1e6
    : null;
}

/**
 * @param {{ id: string, nombre: string, provincia: { id: string }, centroide?: { lat?: number, lon?: number } }} entity
 * @param {string} source
 */
function toCandidate(entity, source) {
  const province = PROVINCES.get(entity.provincia?.id);
  if (!province) {
    throw new Error(
      `Provincia de Georef desconocida: ${entity.provincia?.id} (${entity.id})`,
    );
  }
  const lat = coordinate(entity.centroide?.lat);
  const lng = coordinate(entity.centroide?.lon);
  if (lat === null || lng === null) {
    throw new Error(`Centroide inválido en ${entity.id} (${entity.nombre})`);
  }
  return { entity, province, source, lat, lng };
}

/**
 * Arma las filas de nivel 4. Los homónimos de una misma provincia llevan su
 * departamento en el nombre y en el slug: el buscador muestra la provincia
 * como contenedora y, sin eso, serían indistinguibles.
 *
 * @param {{
 *   municipios: ReadonlyArray<any>,
 *   departamentos: ReadonlyArray<any>,
 *   departmentOf: ReadonlyMap<string, string>,
 * }} input
 */
export function buildLevel4Rows({ municipios, departamentos, departmentOf }) {
  const candidates = [
    ...municipios.map((entity) => toCandidate(entity, "municipios")),
    ...departamentos.map((entity) => toCandidate(entity, "departamentos")),
  ].filter((candidate) => candidate.province.source === candidate.source);

  const baseKey = (/** @type {any} */ c) =>
    `${c.province.slug}-${slugify(c.entity.nombre)}`;
  const counts = new Map();
  for (const candidate of candidates) {
    const key = baseKey(candidate);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows = candidates.map((candidate) => {
    const base = baseKey(candidate);
    let slug = base;
    let name = candidate.entity.nombre;
    if (counts.get(base) > 1) {
      const department = departmentOf.get(candidate.entity.id);
      if (!department) {
        throw new Error(
          `Falta el departamento del homónimo ${candidate.entity.id} (${name})`,
        );
      }
      slug = `${base}-${slugify(department)}`;
      name = `${name} (${department})`;
    }
    return {
      slug,
      name,
      parentSlug: candidate.province.slug,
      path: `${ARGENTINA_PATH}.${candidate.province.slug}.${slug}`,
      description: describe(candidate.province, candidate.source),
      lat: candidate.lat,
      lng: candidate.lng,
      georefId: candidate.entity.id,
    };
  });

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.slug)) {
      throw new Error(`Slug repetido después de desambiguar: ${row.slug}`);
    }
    seen.add(row.slug);
  }

  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/** @param {string} value */
function literal(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * @param {ReadonlyArray<ReturnType<typeof buildLevel4Rows>[number]>} rows
 * @param {{ fetchedAt: string }} options
 */
export function renderMigrationSql(rows, { fetchedAt }) {
  const expected = EXISTING_BUENOS_AIRES_LEVEL4 + rows.length;
  const values = rows
    .map(
      (row) =>
        `  (${literal(row.slug)}, ${literal(row.name)}, ${literal(row.parentSlug)}, ${literal(row.description)}, ${row.lat}, ${row.lng})`,
    )
    .join(",\n");
  const moves = LOCALITY_MOVES.map(
    (move) => `  (${literal(move.slug)}, ${literal(move.parentSlug)})`,
  ).join(",\n");

  return `-- =============================================================================
-- Agorbis · 0076 · Gobiernos locales de Argentina como nivel 4 (D127)
-- -----------------------------------------------------------------------------
-- Generada por scripts/build-argentina-level4-migration.mjs; no se edita a
-- mano. Si Georef cambia, se regenera y el diff se revisa como cualquier otra
-- migración. Sus totales los verifica supabase/tests/geography_baseline_checks.sql.
--
-- Fuente: API Georef de Argentina (apis.datos.gob.ar/georef, datos abiertos),
-- consultada el ${fetchedAt}. Municipios en 22 jurisdicciones; departamentos en
-- Santa Cruz y Santiago del Estero, donde Georef no trae municipios. Buenos
-- Aires conserva sus ${EXISTING_BUENOS_AIRES_LEVEL4} partidos de 0014.
--
-- Además baja a nivel 5 cinco localidades bonaerenses que estaban como nivel 4
-- al lado de su propio partido. La membresía se calcula por prefijo de path
-- (private.raw_is_member), así que quien vive ahí suma su partido a la cadena.
-- =============================================================================

begin;

set local search_path = '';

create temporary table argentina_level4 (
  slug text primary key,
  name text not null,
  parent_slug text not null,
  description text not null,
  lat double precision not null,
  lng double precision not null
) on commit drop;

insert into pg_temp.argentina_level4 (slug, name, parent_slug, description, lat, lng) values
${values};

create temporary table locality_moves (
  slug text primary key,
  parent_slug text not null
) on commit drop;

insert into pg_temp.locality_moves (slug, parent_slug) values
${moves};

-- Falla cerrado: si el esquema o los datos no son los que se revisaron, no
-- inserta nada en vez de dejar una carga a medias.
do $guard$
declare
  v_missing text;
begin
  select string_agg(distinct i.parent_slug, ', ') into v_missing
  from pg_temp.argentina_level4 i
  where not exists (
    select 1 from public.communities p
    where p.slug = i.parent_slug and p.level = 3
      and p.path = '${ARGENTINA_PATH}.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0076_MISSING_PROVINCE: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.argentina_level4 i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0076_SLUG_TAKEN: %', v_missing;
  end if;

  select string_agg(m.slug, ', ') into v_missing
  from pg_temp.locality_moves m
  where not exists (
    select 1 from public.communities c
    where c.slug = m.slug and c.level = 4
      and c.path = '${ARGENTINA_PATH}.buenos-aires.' || c.slug
      and not exists (select 1 from public.communities h where h.parent_id = c.id)
  ) or not exists (
    select 1 from public.communities p
    where p.slug = m.parent_slug and p.level = 4
      and p.path = '${ARGENTINA_PATH}.buenos-aires.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0076_UNEXPECTED_LOCALITY: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.argentina_level4 i
join public.communities p on p.slug = i.parent_slug;

-- El trigger communities_hierarchy_guard exige que level, parent_id y path
-- cambien juntos y coincidan con el padre.
update public.communities c
set parent_id = p.id,
    level = 5,
    path = p.path || '.' || c.slug
from pg_temp.locality_moves m
join public.communities p on p.slug = m.parent_slug
where c.slug = m.slug;

do $check$
declare
  v_expected_level4 constant int := ${expected};
  v_level4 int;
  v_level5 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like '${ARGENTINA_PATH}.%';
  select count(*) into v_level5 from public.communities c
  join pg_temp.locality_moves m on m.slug = c.slug
  where c.level = 5;
  if v_level4 <> v_expected_level4 or v_level5 <> ${LOCALITY_MOVES.length} then
    raise exception 'AGORBIS_0076_UNEXPECTED_TOTALS: nivel 4 %, nivel 5 %',
      v_level4, v_level5;
  end if;
end;
$check$;

commit;
`;
}
