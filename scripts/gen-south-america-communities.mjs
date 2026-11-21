/**
 * Genera una migración idempotente con las unidades administrativas de primer
 * orden de América del Sur y los 135 partidos/municipios bonaerenses.
 *
 * Fuentes:
 * - geoBoundaries gbOpen ADM1 (CC BY 4.0), para las subdivisiones nacionales.
 * - API Georef de Argentina, para los municipios de la Provincia de Buenos Aires.
 *
 * Uso: node scripts/gen-south-america-communities.mjs supabase/migrations/0014_geography.sql
 */
import { writeFileSync } from "node:fs";

const output = process.argv[2];
if (!output) throw new Error("Indicá el archivo SQL de salida.");

const countries = [
  ["BOL", "bolivia"],
  ["BRA", "brasil"],
  ["CHL", "chile"],
  ["COL", "colombia"],
  ["ECU", "ecuador"],
  ["GUY", "guyana"],
  ["PRY", "paraguay"],
  ["PER", "peru"],
  ["SUR", "surinam"],
  ["URY", "uruguay"],
  ["VEN", "venezuela"],
];

const slugify = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Algunas publicaciones históricas de la fuente traen UTF-8 interpretado como
// Latin-1. Se corrige sólo cuando aparece la señal inequívoca de mojibake.
const cleanName = (value) => {
  let result = value.trim();
  while (/[ÃÂ]/.test(result))
    result = Buffer.from(result, "latin1").toString("utf8");
  return result.replace(/\s+/g, " ");
};

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;

const bboxCenter = (geometry) => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  const visit = (value) => {
    if (typeof value[0] === "number") {
      const [lng, lat] = value;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      return;
    }
    for (const nested of value) visit(nested);
  };
  visit(geometry.coordinates);
  return [
    Number(((minLat + maxLat) / 2).toFixed(6)),
    Number(((minLng + maxLng) / 2).toFixed(6)),
  ];
};

async function geoBoundariesRows() {
  const rows = [];
  for (const [iso3, countrySlug] of countries) {
    const metadata = await (
      await fetch(
        `https://www.geoboundaries.org/api/current/gbOpen/${iso3}/ADM1/`,
      )
    ).json();
    const collection = await (
      await fetch(metadata.simplifiedGeometryGeoJSON)
    ).json();
    for (const feature of collection.features) {
      const name = cleanName(feature.properties.shapeName);
      const [lat, lng] = bboxCenter(feature.geometry);
      rows.push({
        slug: `${countrySlug}-${slugify(name)}`,
        name,
        level: 3,
        parentSlug: countrySlug,
        path: `earth.south-america.${countrySlug}.${countrySlug}-${slugify(name)}`,
        description: `División administrativa de primer nivel de ${countrySlug === "uruguay" ? "Uruguay" : name}`,
        lat,
        lng,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.parentSlug.localeCompare(b.parentSlug) ||
      a.name.localeCompare(b.name, "es"),
  );
}

async function buenosAiresRows() {
  const response = await fetch(
    "https://apis.datos.gob.ar/georef/api/municipios?provincia=06&max=5000&campos=id,nombre,centroide",
  );
  const data = await response.json();
  if (data.total !== 135)
    throw new Error(
      `Se esperaban 135 municipios bonaerenses y llegaron ${data.total}.`,
    );

  // Estas comunidades ya existían desde el primer seed y coinciden con el
  // nombre del partido/municipio. Las ciudades de Mar del Plata y Miramar se
  // preservan como comunidades locales; por eso también se agregan sus partidos.
  const existingMunicipalNames = new Set([
    "bahía blanca",
    "balcarce",
    "la plata",
    "mar chiquita",
    "necochea",
    "pinamar",
    "tandil",
    "villa gesell",
  ]);

  return data.municipios
    .map((municipality) => ({
      name: cleanName(municipality.nombre),
      lat: Number(municipality.centroide.lat.toFixed(6)),
      lng: Number(municipality.centroide.lon.toFixed(6)),
    }))
    .filter(
      (municipality) =>
        !existingMunicipalNames.has(municipality.name.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((municipality) => ({
      slug: `ba-${slugify(municipality.name)}`,
      name: municipality.name,
      level: 4,
      parentSlug: "buenos-aires",
      path: `earth.south-america.argentina.buenos-aires.ba-${slugify(municipality.name)}`,
      description: `Partido o municipio de la Provincia de Buenos Aires`,
      lat: municipality.lat,
      lng: municipality.lng,
    }));
}

const renderRows = (rows) =>
  rows
    .map(
      (row) =>
        `  (${sql(row.slug)}, ${sql(row.name)}, ${row.level}, ${sql(row.parentSlug)}, ${sql(row.path)}, '🗺️', ${sql(row.description)}, ${row.lat}, ${row.lng})`,
    )
    .join(",\n");

const southAmerica = await geoBoundariesRows();
const buenosAires = await buenosAiresRows();

if (southAmerica.length < 200)
  throw new Error(
    `Sólo se obtuvieron ${southAmerica.length} subdivisiones sudamericanas.`,
  );
if (buenosAires.length !== 127)
  throw new Error(
    `Se esperaban 127 municipios nuevos de Buenos Aires y llegaron ${buenosAires.length}.`,
  );

const insert = (title, rows) => `-- ${title}
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji, i.description, i.lat, i.lng
from (values
${renderRows(rows)}
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;`;

writeFileSync(
  output,
  `-- =============================================================================
-- Agorbis · 0014 · Cobertura inicial de América del Sur
-- -----------------------------------------------------------------------------
-- Fuente de subdivisiones: geoBoundaries gbOpen ADM1 (CC BY 4.0), consultada
-- el 2026-08-09. Para Buenos Aires: API Georef de Argentina (135 municipios).
-- Argentina ya contaba con sus 23 provincias y CABA desde el seed original.
-- Los slugs nuevos llevan prefijo del país para no romper la unicidad global
-- de communities.slug cuando distintos países tienen una región homónima.
-- =============================================================================

begin;

${insert(`217 subdivisiones de primer nivel de 11 países sudamericanos (incluye 19 departamentos uruguayos)`, southAmerica)}

${insert("127 partidos/municipios bonaerenses que faltaban; 8 ya existían", buenosAires)}

commit;
`,
);

console.log(
  `OK · ${southAmerica.length} subdivisiones sudamericanas · ${buenosAires.length} municipios bonaerenses nuevos`,
);
