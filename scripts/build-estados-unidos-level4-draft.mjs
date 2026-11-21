// Genera supabase/sql-drafts/0096_estados_unidos_local_governments.sql desde
// el Gazetteer 2024 de condados del U.S. Census Bureau (D149). Se corre a mano:
//   node scripts/build-estados-unidos-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATES,
  buildEstadosUnidosLevel4Rows,
  parseGazetteer,
  renderEstadosUnidosDraftSql,
} from "./estados-unidos-level4-lib.mjs";
import { readZipEntry } from "./zip-entry.mjs";

const GAZETTEER =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip";
const ENTRY = "2024_Gaz_counties_national.txt";
// 3.143 equivalentes de condado en los estados y DC, más los 78 municipios de
// Puerto Rico. Otro número es un cambio que se revisa.
const EXPECTED_ENTRIES = 3222;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0096_estados_unidos_local_governments.sql",
);

const response = await fetch(GAZETTEER, {
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) throw new Error(`El Census respondió ${response.status}`);
const zip = Buffer.from(await response.arrayBuffer());
const counties = parseGazetteer(readZipEntry(zip, ENTRY).toString("utf8"));
if (counties.length !== EXPECTED_ENTRIES) {
  throw new Error(
    `El Gazetteer trae ${counties.length} condados; se esperaban ${EXPECTED_ENTRIES}`,
  );
}

const rows = buildEstadosUnidosLevel4Rows(counties);

const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...STATES.values()].filter((s) => !present.has(s.slug));
if (absent.length) {
  throw new Error(
    `Estados sin condados: ${absent.map((s) => s.name).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderEstadosUnidosDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
