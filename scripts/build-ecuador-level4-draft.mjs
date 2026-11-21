// Genera supabase/sql-drafts/0081_ecuador_local_governments.sql desde el
// COD-AB de Ecuador en HDX (fuente INEC, D133). Se corre a mano:
//   node scripts/build-ecuador-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROVINCES,
  buildEcuadorLevel4Rows,
  renderEcuadorDraftSql,
} from "./ecuador-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/ab3c7592-3b0c-41cd-999a-2919a6b243f2/resource/e59b7aaf-755d-47e5-95e4-a98f9bfa5856/download/ecu_admgz.xlsx";
// El INEC reconoce 221 cantones; un número distinto es un cambio que se revisa.
const EXPECTED_CANTONS = 221;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0081_ecuador_local_governments.sql",
);

const response = await fetch(COD_AB, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

const cantons = readXlsxSheet(book, "ecu_admgz_adm2");
const rows = buildEcuadorLevel4Rows(
  cantons.map(({ ADM1_PCODE, ADM1_ES, ADM2_PCODE, ADM2_ES }) => ({
    ADM1_PCODE,
    ADM1_ES,
    ADM2_PCODE,
    ADM2_ES,
  })),
);

const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...PROVINCES.values()].filter((p) => !present.has(p.slug));
if (absent.length) {
  throw new Error(
    `Provincias sin cantones: ${absent.map((p) => p.name).join(", ")}`,
  );
}
if (rows.length !== EXPECTED_CANTONS) {
  throw new Error(
    `Se esperaban ${EXPECTED_CANTONS} cantones y hay ${rows.length}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderEcuadorDraftSql(rows, { fetchedAt }));

const perProvince = new Map();
for (const row of rows) {
  perProvince.set(row.parentSlug, (perProvince.get(row.parentSlug) ?? 0) + 1);
}
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n` +
    [...perProvince].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
