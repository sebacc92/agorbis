// Genera supabase/migrations/0076_argentina_local_governments.sql desde la API
// Georef (D127). Se corre a mano: `node scripts/build-argentina-level4-migration.mjs`.
// No lo usa la app ni el Worker; sólo lo corre quien regenera la migración.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLevel4Rows,
  renderMigrationSql,
  slugify,
  PROVINCES,
} from "./argentina-level4-lib.mjs";

const GEOREF = "https://apis.datos.gob.ar/georef/api";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/migrations/0076_argentina_local_governments.sql",
);

/** @param {string} resource @param {Record<string, string>} params */
async function georef(resource, params) {
  const url = new URL(`${GEOREF}/${resource}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Georef ${resource} respondió ${response.status}`);
  }
  return response.json();
}

const FIELDS = "id,nombre,provincia.id,centroide.lat,centroide.lon";

/** @param {"municipios" | "departamentos"} resource */
async function fetchAll(resource) {
  const body = await georef(resource, { max: "5000", campos: FIELDS });
  const items = body[resource];
  // Una respuesta truncada dejaría jurisdicciones a medias sin avisar.
  if (!Array.isArray(items) || items.length !== body.total) {
    throw new Error(`Georef ${resource}: ${items?.length} de ${body.total}`);
  }
  return items;
}

/** Departamento de cada homónimo, según el punto de su centroide. */
async function departmentsForHomonyms(municipios) {
  const byKey = new Map();
  for (const item of municipios) {
    const key = `${item.provincia.id}:${slugify(item.nombre)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const homonyms = [...byKey.values()]
    .filter((group) => group.length > 1)
    .flat();
  const departmentOf = new Map();
  for (const item of homonyms) {
    const body = await georef("ubicacion", {
      lat: String(item.centroide.lat),
      lon: String(item.centroide.lon),
      campos: "departamento.nombre",
    });
    const name = body.ubicacion?.departamento?.nombre;
    if (name) departmentOf.set(item.id, name);
  }
  return departmentOf;
}

const municipios = await fetchAll("municipios");
const departamentos = (await fetchAll("departamentos")).filter(
  (item) => PROVINCES.get(item.provincia.id)?.source === "departamentos",
);
const departmentOf = await departmentsForHomonyms(municipios);
const rows = buildLevel4Rows({ municipios, departamentos, departmentOf });
const fetchedAt = new Date().toISOString().slice(0, 10);

fs.writeFileSync(output, renderMigrationSql(rows, { fetchedAt }));

const perProvince = new Map();
for (const row of rows) {
  perProvince.set(row.parentSlug, (perProvince.get(row.parentSlug) ?? 0) + 1);
}
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n` +
    [...perProvince].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
