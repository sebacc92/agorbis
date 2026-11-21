/**
 * Genera una migración con las divisiones administrativas de primer nivel de
 * todos los países de Agorbis: estados, provincias, departamentos, regiones,
 * gobernaciones o su equivalente.
 *
 * Fuentes:
 * - GeoNames admin1CodesASCII para la lista y los nombres actuales.
 * - geoBoundaries gbOpen ADM1 para coordenadas cuando las unidades coinciden.
 * - mledoze/countries para traducir ISO 3166-1 alpha-2 a alpha-3.
 *
 * La migración resultante es estática: desplegarla no requiere red. Los datos
 * que ya existen se preservan comparando país + nombre y usando ON CONFLICT.
 *
 * Uso:
 *   node scripts/gen-world-subdivisions.mjs \
 *     supabase/migrations/0016_world_subdivisions.sql
 */
import { readFileSync, writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output) throw new Error("Indicá el archivo SQL de salida.");

const GEOBOUNDARIES_API =
  "https://www.geoboundaries.org/api/current/gbOpen/ALL/ADM1/";
const GEONAMES_ADMIN1 =
  "https://download.geonames.org/export/dump/admin1CodesASCII.txt";
const COUNTRIES_API =
  "https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json";
const CONCURRENCY = 8;

const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const cleanName = (value) => {
  let result = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  for (let attempt = 0; attempt < 2 && /[ÃÂ]/.test(result); attempt++) {
    const decoded = Buffer.from(result, "latin1").toString("utf8");
    if (decoded.includes("�")) break;
    result = decoded;
  }
  return result;
};

const sql = (value) =>
  value === null || value === undefined
    ? "NULL"
    : `'${String(value).replaceAll("'", "''")}'`;

function iso2FromFlag(flag) {
  const points = [...flag].map((character) => character.codePointAt(0));
  if (
    points.length !== 2 ||
    points.some((point) => point < 0x1f1e6 || point > 0x1f1ff)
  ) {
    throw new Error(`Bandera inválida en el seed: ${flag}`);
  }
  return points
    .map((point) => String.fromCharCode(65 + point - 0x1f1e6))
    .join("");
}

function countriesFromSeed() {
  const seed = readFileSync("supabase/seed.sql", "utf8");
  const start = seed.indexOf("-- Nivel 2 · 195 países");
  const end = seed.indexOf("-- Nivel 3 · subdivisiones de Argentina");
  if (start < 0 || end < 0)
    throw new Error("No se encontró el bloque de países en seed.sql.");

  const block = seed.slice(start, end);
  const pattern =
    /^\s*\('([^']+)', '((?:''|[^'])+)', 2, '([^']+)', '([^']+)', '([^']+)'/gm;
  const countries = [...block.matchAll(pattern)].map((match) => ({
    slug: match[1],
    name: match[2].replaceAll("''", "'"),
    continentSlug: match[3],
    path: match[4],
    iso2: iso2FromFlag(match[5]),
  }));

  if (countries.length !== 195) {
    throw new Error(
      `Se esperaban 195 países en el seed y se encontraron ${countries.length}.`,
    );
  }
  return countries;
}

function legacyAdm1Rows() {
  const files = [
    "supabase/seed.sql",
    "supabase/migrations/0014_geography_south_america.sql",
  ];
  const rows = [];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const fields = line.match(
        /^\s*\('([^']+)', '((?:''|[^'])+)', 3, '([^']+)'/,
      );
      if (!fields) continue;
      rows.push({
        slug: fields[1],
        name: fields[2].replaceAll("''", "'"),
        parentSlug: fields[3],
      });
    }
  }
  return [...new Map(rows.map((row) => [row.slug, row])).values()];
}

const ADMIN_STOP_WORDS = new Set(
  "region regions de del la el los las do da dos das departamento departamentos department departments provincia provincias province provinces estado estados state states distrito distritos district districts municipio municipios municipality municipalities gobernacion governorate county prefecture capital autonomous autonoma metropolitana metropolitan federal".split(
    " ",
  ),
);
const compactName = (value) => slugify(value).replaceAll("-", "");
const semanticName = (value) =>
  slugify(value)
    .split("-")
    .filter((word) => word && !ADMIN_STOP_WORDS.has(word))
    .sort()
    .join("");

function levenshtein(left, right) {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = new Array(right.length + 1);
  for (let row = 1; row <= left.length; row++) {
    current[0] = row;
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function nameDistance(left, right) {
  const ratio = (a, b) => levenshtein(a, b) / Math.max(1, a.length, b.length);
  return (
    0.75 * ratio(semanticName(left), semanticName(right)) +
    0.25 * ratio(compactName(left), compactName(right))
  );
}

/** Asignación de costo mínimo para enlazar los ADM1 previos sin depender de nombres idénticos. */
function minimumAssignment(costs) {
  const size = costs.length;
  const u = new Array(size + 1).fill(0);
  const v = new Array(size + 1).fill(0);
  const selectedRow = new Array(size + 1).fill(0);
  const previousColumn = new Array(size + 1).fill(0);

  for (let row = 1; row <= size; row++) {
    selectedRow[0] = row;
    let column = 0;
    const minimum = new Array(size + 1).fill(Infinity);
    const used = new Array(size + 1).fill(false);
    do {
      used[column] = true;
      const activeRow = selectedRow[column];
      let delta = Infinity;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate++) {
        if (used[candidate]) continue;
        const cost =
          costs[activeRow - 1][candidate - 1] - u[activeRow] - v[candidate];
        if (cost < minimum[candidate]) {
          minimum[candidate] = cost;
          previousColumn[candidate] = column;
        }
        if (minimum[candidate] < delta) {
          delta = minimum[candidate];
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate++) {
        if (used[candidate]) {
          u[selectedRow[candidate]] += delta;
          v[candidate] -= delta;
        } else {
          minimum[candidate] -= delta;
        }
      }
      column = nextColumn;
    } while (selectedRow[column] !== 0);

    do {
      const nextColumn = previousColumn[column];
      selectedRow[column] = selectedRow[nextColumn];
      column = nextColumn;
    } while (column !== 0);
  }

  const assignment = new Array(size);
  for (let column = 1; column <= size; column++) {
    assignment[selectedRow[column] - 1] = column - 1;
  }
  return assignment;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

function bboxCenter(geometryOrGeometries) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  const visit = (coordinates) => {
    if (typeof coordinates?.[0] === "number") {
      const [lng, lat] = coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
      return;
    }
    for (const nested of coordinates ?? []) visit(nested);
  };
  const geometries = Array.isArray(geometryOrGeometries)
    ? geometryOrGeometries
    : [geometryOrGeometries];
  for (const geometry of geometries) visit(geometry?.coordinates);

  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite))
    return [null, null];
  return [
    Number(((minLat + maxLat) / 2).toFixed(6)),
    Number(((minLng + maxLng) / 2).toFixed(6)),
  ];
}

async function mapLimit(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, worker),
  );
  return results;
}

const countries = countriesFromSeed();
const [countryReference, boundaryMetadata, geonamesText] = await Promise.all([
  fetchJson(COUNTRIES_API),
  fetchJson(GEOBOUNDARIES_API),
  fetchText(GEONAMES_ADMIN1),
]);

const iso3ByIso2 = new Map(
  countryReference.map((country) => [country.cca2, country.cca3]),
);
const metadataByIso3 = new Map();
for (const metadata of boundaryMetadata) {
  if (metadata.boundaryType !== "ADM1") continue;
  const current = metadataByIso3.get(metadata.boundaryISO);
  if (
    !current ||
    Number(metadata.admUnitCount) > Number(current.admUnitCount)
  ) {
    metadataByIso3.set(metadata.boundaryISO, metadata);
  }
}

const geonamesRows = geonamesText
  .trim()
  .split(/\r?\n/)
  .map((line) => line.split("\t"))
  .filter((columns) => columns.length >= 4)
  .map(([code, name, asciiName, geonameId]) => ({
    iso2: code.slice(0, 2),
    code,
    name: cleanName(name),
    asciiName: cleanName(asciiName),
    geonameId,
  }));
const geonamesByIso2 = Map.groupBy(geonamesRows, (row) => row.iso2);

const missingIso = countries.filter((country) => !iso3ByIso2.get(country.iso2));
if (missingIso.length) {
  throw new Error(
    `Falta ISO alpha-3 para: ${missingIso.map((country) => country.name).join(", ")}`,
  );
}

const withMetadata = countries.map((country) => ({
  ...country,
  iso3: iso3ByIso2.get(country.iso2),
  metadata: metadataByIso3.get(iso3ByIso2.get(country.iso2)),
}));

const downloaded = await mapLimit(
  withMetadata.filter((country) => country.metadata),
  CONCURRENCY,
  async (country, index) => {
    const collection = await fetchJson(
      country.metadata.simplifiedGeometryGeoJSON,
    );
    process.stdout.write(
      `\rDescargando coordenadas: ${String(index + 1).padStart(3)} / ${withMetadata.length}`,
    );
    return { country, features: collection.features ?? [] };
  },
);
process.stdout.write("\n");
const boundariesByIso3 = new Map(
  downloaded.map((item) => [item.country.iso3, item]),
);

const NAME_OVERRIDES = new Map([
  ["AR.07", "Ciudad Autónoma de Buenos Aires"],
  ["PE.08", "Cusco"],
  ["VE.26", "La Guaira"],
]);
const ADMIN_WORDS =
  /^(municipality|urban-municipality|region|province|state|county|district|department)-of-|-(municipality|region|province|state|county|district|department|governorate|prefecture|oblast)$/g;
const matchKey = (value) => slugify(value).replace(ADMIN_WORDS, "");

function boundaryGroups(features) {
  return [
    ...Map.groupBy(features, (feature) => {
      const code = cleanName(feature.properties?.shapeISO);
      const name = cleanName(feature.properties?.shapeName).toLocaleLowerCase();
      return `${code}|${name}`;
    }).values(),
  ].map((group) => {
    const feature = group[0];
    const name = cleanName(feature.properties?.shapeName);
    const [lat, lng] = bboxCenter(group.map((part) => part.geometry));
    return {
      name,
      key: matchKey(name),
      code: cleanName(feature.properties?.shapeISO) || null,
      id:
        group
          .map((part) => cleanName(part.properties?.shapeID))
          .filter(Boolean)
          .join(",") || null,
      lat,
      lng,
    };
  });
}

function indexBoundaries(groups) {
  const candidates = new Map();
  for (const group of groups) {
    if (!group.key) continue;
    const current = candidates.get(group.key);
    candidates.set(group.key, current === undefined ? group : null);
  }
  return candidates;
}

function adminType(name, metadata, primaryCount, boundaryCount) {
  const normalized = slugify(name);
  if (normalized.includes("municipality")) return "Municipality";
  if (normalized.includes("governorate")) return "Governorate";
  if (normalized.includes("province")) return "Province";
  if (normalized.includes("region")) return "Region";
  if (normalized.includes("department")) return "Department";
  if (normalized.includes("district")) return "District";
  if (normalized.includes("county")) return "County";

  const canonical = cleanName(metadata?.boundaryCanonical);
  const comparable =
    primaryCount > 0 &&
    Math.abs(primaryCount - boundaryCount) / primaryCount <= 0.15;
  return comparable && canonical && canonical !== "Unknown"
    ? canonical
    : "ADM1";
}

const rows = [];
const countryStats = [];
const countriesWithoutSource = [];
for (const country of withMetadata) {
  const boundaryData = boundariesByIso3.get(country.iso3);
  const groups = boundaryGroups(boundaryData?.features ?? []);
  const boundaryIndex = indexBoundaries(groups);
  const geonames = geonamesByIso2.get(country.iso2) ?? [];
  const primary =
    geonames.length > 0
      ? geonames.map((row) => ({
          name: NAME_OVERRIDES.get(row.code) ?? row.name,
          asciiName: row.asciiName,
          code: row.code,
          sourceId: `geonames:${row.geonameId}`,
          boundary:
            boundaryIndex.get(matchKey(row.name)) ??
            boundaryIndex.get(matchKey(row.asciiName)),
        }))
      : groups.map((group) => ({
          name: group.name,
          asciiName: group.name,
          code: group.code,
          sourceId: group.id ? `geoboundaries:${group.id}` : null,
          boundary: group,
        }));

  if (primary.length === 0) {
    countriesWithoutSource.push(country);
    continue;
  }

  const usedSlugs = new Set();
  let coordinateMatches = 0;
  for (const unit of primary) {
    const key =
      slugify(unit.asciiName || unit.name) ||
      slugify(unit.code || unit.sourceId);
    let slug = `${country.slug}-${key}`;
    let suffix = 2;
    const baseSlug = slug;
    while (usedSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
    usedSlugs.add(slug);
    if (unit.boundary) coordinateMatches++;

    rows.push({
      slug,
      name: unit.name,
      matchKey: compactName(unit.name),
      legacySlug: null,
      parentSlug: country.slug,
      path: `${country.path}.${slug}`,
      canonical: adminType(
        unit.name,
        country.metadata,
        primary.length,
        groups.length,
      ),
      countryName: country.name,
      sourceCode: unit.code,
      sourceId: unit.sourceId,
      lat: unit.boundary?.lat ?? null,
      lng: unit.boundary?.lng ?? null,
    });
  }
  countryStats.push({
    iso3: country.iso3,
    country: country.name,
    canonical: adminType("", country.metadata, primary.length, groups.length),
    generated: primary.length,
    coordinateMatches,
  });
}

const legacyRows = legacyAdm1Rows();
const legacyStats = [];
for (const parentSlug of new Set(legacyRows.map((row) => row.parentSlug))) {
  const existing = legacyRows.filter((row) => row.parentSlug === parentSlug);
  const imported = rows.filter((row) => row.parentSlug === parentSlug);
  if (existing.length !== imported.length) {
    throw new Error(
      `No se puede preservar ${parentSlug}: ${existing.length} ADM1 existentes y ${imported.length} importados.`,
    );
  }
  const costs = imported.map((incoming) =>
    existing.map((current) => nameDistance(incoming.name, current.name)),
  );
  const assignment = minimumAssignment(costs);
  let maximumCost = 0;
  for (let index = 0; index < imported.length; index++) {
    imported[index].legacySlug = existing[assignment[index]].slug;
    maximumCost = Math.max(maximumCost, costs[index][assignment[index]]);
  }
  legacyStats.push({ parentSlug, mapped: imported.length, maximumCost });
}

const duplicateSlugs = [...Map.groupBy(rows, (row) => row.slug)].filter(
  ([, values]) => values.length > 1,
);
const duplicatePaths = [...Map.groupBy(rows, (row) => row.path)].filter(
  ([, values]) => values.length > 1,
);
const duplicateMatchKeys = [
  ...Map.groupBy(rows, (row) => `${row.parentSlug}|${row.matchKey}`),
].filter(([, values]) => values.length > 1);
if (
  duplicateSlugs.length ||
  duplicatePaths.length ||
  duplicateMatchKeys.length
) {
  throw new Error(
    `Identificadores duplicados: ${duplicateSlugs.length} slugs, ${duplicatePaths.length} paths, ${duplicateMatchKeys.length} nombres por país.`,
  );
}

rows.sort(
  (a, b) =>
    a.parentSlug.localeCompare(b.parentSlug) ||
    a.name.localeCompare(b.name, "es"),
);

const values = rows
  .map(
    (row) =>
      `  (${sql(row.slug)}, ${sql(row.name)}, ${sql(row.matchKey)}, ${sql(row.legacySlug)}, ${sql(row.parentSlug)}, ${sql(row.path)}, ${sql(row.canonical)}, ${sql(row.countryName)}, ${sql(row.sourceCode)}, ${sql(row.sourceId)}, ${row.lat ?? "NULL"}, ${row.lng ?? "NULL"})`,
  )
  .join(",\n");

const generatedAt = new Date().toISOString().slice(0, 10);
const migration = `-- =============================================================================
-- Agorbis · 0016 · Divisiones administrativas de primer nivel del mundo
-- -----------------------------------------------------------------------------
-- Generado el ${generatedAt} con scripts/gen-world-subdivisions.mjs.
-- Fuente principal: GeoNames admin1CodesASCII (códigos y nombres actuales).
-- Coordenadas aproximadas: geoBoundaries gbOpen ADM1 cuando el nombre coincide.
-- Países del producto: ${countries.length}; con divisiones: ${countryStats.length};
-- sin división de primer nivel/no aplicable: ${countriesWithoutSource.length}; filas: ${rows.length}.
--
-- Los slugs llevan el país como prefijo porque communities.slug es globalmente
-- único. Se preservan las comunidades ya cargadas comparando padre + nombre
-- normalizado (sin tildes, espacios ni signos).
-- =============================================================================

begin;

alter table public.communities
  add column if not exists admin_type text,
  add column if not exists external_code text,
  add column if not exists external_source_id text;

comment on column public.communities.admin_type is
  'Nombre local/canónico del nivel administrativo según la fuente (State, Province, Region, etc.).';
comment on column public.communities.external_code is
  'Código de la unidad en la fuente geográfica, cuando existe.';
comment on column public.communities.external_source_id is
  'Fuente e identificador externo de la unidad administrativa.';

create temporary table world_adm1_import (
  slug text not null,
  name text not null,
  match_key text not null,
  legacy_slug text,
  parent_slug text not null,
  path text not null,
  admin_type text,
  country_name text not null,
  external_code text,
  external_source_id text,
  lat double precision,
  lng double precision
) on commit drop;

create function pg_temp.adm1_match_key(value text)
returns text
language sql
immutable
strict
as \$\$
  select regexp_replace(
    translate(
      lower(value),
      'áàäâãåéèëêíìïîóòöôõúùüûñçýÿ',
      'aaaaaaeeeeiiiiooooouuuuncyy'
    ),
    '[^a-z0-9]+',
    '',
    'g'
  )
\$\$;

insert into world_adm1_import (
  slug, name, match_key, legacy_slug, parent_slug, path, admin_type, country_name,
  external_code, external_source_id, lat, lng
)
values
${values}
;

-- Completa metadatos de las provincias sudamericanas y argentinas que ya
-- existían, conservando sus slugs, descripciones y coordenadas curadas.
update public.communities existing
set admin_type = i.admin_type,
    external_code = i.external_code,
    external_source_id = i.external_source_id,
    lat = coalesce(existing.lat, i.lat),
    lng = coalesce(existing.lng, i.lng)
from world_adm1_import i
join public.communities parent on parent.slug = i.parent_slug and parent.level = 2
where existing.parent_id = parent.id
  and (
    existing.slug = i.legacy_slug
    or pg_temp.adm1_match_key(existing.name) = i.match_key
  );

insert into public.communities (
  slug, name, level, parent_id, path, emoji, description,
  admin_type, external_code, external_source_id, lat, lng
)
select
  i.slug,
  i.name,
  3,
  parent.id,
  i.path,
  '🗺️',
  'División administrativa de primer nivel de ' || i.country_name,
  i.admin_type,
  i.external_code,
  i.external_source_id,
  i.lat,
  i.lng
from world_adm1_import i
join public.communities parent on parent.slug = i.parent_slug and parent.level = 2
where not exists (
  select 1
  from public.communities existing
  where existing.parent_id = parent.id
    and (
      existing.slug = i.legacy_slug
      or pg_temp.adm1_match_key(existing.name) = i.match_key
    )
)
on conflict (slug) do nothing;

-- Registro explícito de países que la fuente no modela en ADM1. No se crean
-- subdivisiones ficticias: un país sin ese nivel queda correctamente sin hijos.
comment on table public.communities is
  'Jerarquía geográfica. ADM1 mundial importado de GeoNames, con coordenadas aproximadas de geoBoundaries cuando están disponibles; no se crean unidades artificiales.';

-- Países sin dataset ADM1 al generar esta migración:
-- ${countriesWithoutSource.map((country) => `${country.iso3} ${country.name}`).join("; ") || "ninguno"}

commit;
`;

writeFileSync(output, migration);
writeFileSync(
  `${output}.audit.json`,
  `${JSON.stringify(
    {
      generatedAt,
      sources: {
        divisions: GEONAMES_ADMIN1,
        coordinates: GEOBOUNDARIES_API,
      },
      productCountries: countries.length,
      countriesWithSource: countryStats.length,
      countriesWithoutSource: countriesWithoutSource.map(
        ({ iso2, iso3, slug, name }) => ({
          iso2,
          iso3,
          slug,
          name,
        }),
      ),
      totalRows: rows.length,
      legacyMappings: legacyStats,
      byCountry: countryStats,
    },
    null,
    2,
  )}\n`,
);

console.log(
  `OK · ${rows.length} divisiones · ${countryStats.length}/${countries.length} países con fuente`,
);
if (countriesWithoutSource.length) {
  console.log(
    `Sin fuente ADM1: ${countriesWithoutSource.map((country) => `${country.iso3} ${country.name}`).join(", ")}`,
  );
}
