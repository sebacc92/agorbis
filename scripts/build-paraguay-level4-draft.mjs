// Genera supabase/sql-drafts/0079_paraguay_local_governments.sql desde el
// COD-AB de Paraguay en HDX (fuente INE) y lo contrasta con las intendencias
// electas de 2026 (D131). Se corre a mano:
//   node scripts/build-paraguay-level4-draft.mjs
// No lo usa la app ni el Worker. Del archivo del TSJE sólo se leen los códigos
// de departamento y distrito; trae nombres y cédulas que no se guardan.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildParaguayLevel4Rows,
  compareWithElection,
  renderParaguayDraftSql,
} from "./paraguay-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/212cd82f-bcb8-445f-8b32-aa194387f6c3/resource/c5abdc40-3f21-49b4-bc38-c2dee5dfc787/download/pry_admin_boundaries.xlsx";
const ELECTED =
  "https://www.tsje.gov.py/resultados/candidatos-electos-intendentes-2026.xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0079_paraguay_local_governments.sql",
);

/** @param {string} url */
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const codAb = await download(COD_AB);
const districts = readXlsxSheet(codAb, "pry_admin2");
const points = readXlsxSheet(codAb, "pry_adminpoints");
const rows = buildParaguayLevel4Rows(
  districts.map(({ adm1_pcode, adm2_pcode, adm2_name }) => ({
    adm1_pcode,
    adm2_pcode,
    adm2_name,
  })),
  points.map(({ admin_level, adm2_pcode, y_coord, x_coord }) => ({
    admin_level,
    adm2_pcode,
    y_coord,
    x_coord,
  })),
);

// Sólo los códigos: el resto del archivo son datos de personas.
const election = readXlsxSheet(await download(ELECTED), null).map(
  ({ COD_DEPARTAMENTO, COD_DISTRITO }) => ({ COD_DEPARTAMENTO, COD_DISTRITO }),
);
const differences = compareWithElection(rows, election);
if (differences.length) {
  throw new Error(
    `La capa no coincide con las intendencias electas:\n  ${differences.join("\n  ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderParaguayDraftSql(rows, { fetchedAt }));

const perDepartment = new Map();
for (const row of rows) {
  perDepartment.set(
    row.parentSlug,
    (perDepartment.get(row.parentSlug) ?? 0) + 1,
  );
}
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}; ${election.length} intendencias electas (con Asunción)\n` +
    [...perDepartment].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
