// Genera supabase/sql-drafts/0078_chile_local_governments.sql desde la capa
// COMUNAS de la DPA 2023 (D130). Se corre a mano:
//   node scripts/build-chile-level4-draft.mjs [ruta-al-zip]
// Sin ruta, descarga el zip del geoportal (~310 MB). Sólo lee la tabla de
// atributos (.dbf); los polígonos no se usan. No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGIONS,
  buildChileLevel4Rows,
  parseDbf,
  renderChileDraftSql,
} from "./chile-level4-lib.mjs";
import { readZipEntry } from "./zip-entry.mjs";

// "Límites y fronteras" del geoportal de la IDE Chile: DPA 2023 de SUBDERE.
const DPA_ZIP =
  "https://www.geoportal.cl/geoportal/catalog/download/912598ad-ac92-35f6-8045-098f214bd9c2";
const DBF_ENTRY = "COMUNAS/COMUNAS_v1.dbf";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0078_chile_local_governments.sql",
);

async function loadZip() {
  const local = process.argv[2];
  if (local) {
    return {
      zip: fs.readFileSync(local),
      fetchedAt: fs.statSync(local).mtime.toISOString().slice(0, 10),
    };
  }
  const response = await fetch(DPA_ZIP, {
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok) throw new Error(`Geoportal respondió ${response.status}`);
  return {
    zip: Buffer.from(await response.arrayBuffer()),
    fetchedAt: new Date().toISOString().slice(0, 10),
  };
}

const { zip, fetchedAt } = await loadZip();
const records = parseDbf(readZipEntry(zip, DBF_ENTRY));

// Una capa recortada dejaría regiones vacías sin avisar.
const present = new Set(records.map((record) => record.CUT_REG));
const absent = [...REGIONS.keys()].filter((code) => !present.has(code));
if (absent.length)
  throw new Error(`Regiones sin comunas: ${absent.join(", ")}`);

const rows = buildChileLevel4Rows(
  records.map(({ CUT_REG, CUT_COM, COMUNA }) => ({ CUT_REG, CUT_COM, COMUNA })),
);
fs.writeFileSync(output, renderChileDraftSql(rows, { fetchedAt }));

const perRegion = new Map();
for (const row of rows) {
  perRegion.set(row.parentSlug, (perRegion.get(row.parentSlug) ?? 0) + 1);
}
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)} (fuente del ${fetchedAt})\n` +
    [...perRegion].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
