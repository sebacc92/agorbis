// Genera supabase/sql-drafts/0087_guatemala_local_governments.sql desde el
// COD-AB de Guatemala en HDX (fuente CONRED, D139). Se corre a mano:
//   node scripts/build-guatemala-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPARTMENTS,
  buildGuatemalaLevel4Rows,
  renderGuatemalaDraftSql,
} from "./guatemala-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/0b20f310-7d22-479c-b7e2-e1bb9737fa72/resource/ff1d625b-b657-4a70-8b26-40ebbc2fd983/download/gtm_admin_boundaries.xlsx";
// Guatemala tiene 340 municipios; otro número es un cambio que se revisa.
const EXPECTED_MUNICIPALITIES = 340;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0087_guatemala_local_governments.sql",
);

const response = await fetch(COD_AB, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

const rows = buildGuatemalaLevel4Rows(
  readXlsxSheet(book, "gtm_admin2").map(
    ({ adm1_pcode, adm1_name, adm2_pcode, adm2_name }) => ({
      adm1_pcode,
      adm1_name,
      adm2_pcode,
      adm2_name,
    }),
  ),
  readXlsxSheet(book, "gtm_adminpoints").map(
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
const absent = [...DEPARTMENTS.values()].filter((d) => !present.has(d.slug));
if (absent.length) {
  throw new Error(
    `Departamentos sin municipios: ${absent.map((d) => d.name).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderGuatemalaDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
