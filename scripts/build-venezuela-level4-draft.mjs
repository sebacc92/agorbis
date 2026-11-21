// Genera supabase/sql-drafts/0084_venezuela_local_governments.sql desde el
// COD-AB de Venezuela en HDX (fuente INE, D136). Se corre a mano:
//   node scripts/build-venezuela-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATES,
  buildVenezuelaLevel4Rows,
  renderVenezuelaDraftSql,
} from "./venezuela-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/5b141d29-534f-4f01-a0bc-41e2f375d925/resource/f232e893-f194-4f78-b615-c9547fa90af2/download/ven_admin_boundaries.xlsx";
// Venezuela tiene 335 municipios; otro número es un cambio que se revisa.
const EXPECTED_MUNICIPALITIES = 335;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0084_venezuela_local_governments.sql",
);

const response = await fetch(COD_AB, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

const rows = buildVenezuelaLevel4Rows(
  readXlsxSheet(book, "ven_admin2").map(
    ({ adm1_pcode, adm1_name, adm2_pcode, adm2_name }) => ({
      adm1_pcode,
      adm1_name,
      adm2_pcode,
      adm2_name,
    }),
  ),
  readXlsxSheet(book, "ven_adminpoints").map(
    ({ admin_level, adm2_pcode, y_coord, x_coord }) => ({
      admin_level,
      adm2_pcode,
      y_coord,
      x_coord,
    }),
  ),
);

if (rows.length !== EXPECTED_MUNICIPALITIES) {
  throw new Error(
    `Se esperaban ${EXPECTED_MUNICIPALITIES} municipios y hay ${rows.length}`,
  );
}
const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...STATES.values()].filter((s) => !present.has(s.slug));
if (absent.length) {
  throw new Error(
    `Estados sin municipios: ${absent.map((s) => s.name).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderVenezuelaDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
