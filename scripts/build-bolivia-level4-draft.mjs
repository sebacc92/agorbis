// Genera supabase/sql-drafts/0080_bolivia_local_governments.sql desde el
// COD-AB de Bolivia en HDX (D132). Se corre a mano:
//   node scripts/build-bolivia-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPARTMENTS,
  buildBoliviaLevel4Rows,
  renderBoliviaDraftSql,
} from "./bolivia-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/67333305-5479-4936-a7a3-1713ec3b7398/resource/027e8de1-52ae-4c58-8ea8-74d2d5019574/download/bol_admin_boundaries.xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0080_bolivia_local_governments.sql",
);

const response = await fetch(COD_AB, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

const municipalities = readXlsxSheet(book, "bol_admin3");
const points = readXlsxSheet(book, "bol_adminpoints");

// Una capa recortada dejaría departamentos vacíos sin avisar.
const present = new Set(municipalities.map((row) => row.adm1_pcode));
const absent = [...DEPARTMENTS.keys()].filter((code) => !present.has(code));
if (absent.length) {
  throw new Error(`Departamentos sin municipios: ${absent.join(", ")}`);
}

const rows = buildBoliviaLevel4Rows(
  municipalities.map(({ adm1_pcode, adm1_name, adm3_pcode, adm3_name }) => ({
    adm1_pcode,
    adm1_name,
    adm3_pcode,
    adm3_name,
  })),
  points.map(({ admin_level, adm3_pcode, y_coord, x_coord }) => ({
    admin_level,
    adm3_pcode,
    y_coord,
    x_coord,
  })),
);
const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderBoliviaDraftSql(rows, { fetchedAt }));

const perDepartment = new Map();
for (const row of rows) {
  perDepartment.set(
    row.parentSlug,
    (perDepartment.get(row.parentSlug) ?? 0) + 1,
  );
}
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n` +
    [...perDepartment].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
