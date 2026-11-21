// Genera supabase/sql-drafts/0077_uruguay_local_governments.sql desde el plan
// circuital 2025 de la Corte Electoral (D129). Se corre a mano:
// `node scripts/build-uruguay-level4-draft.mjs`. No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPARTMENTS,
  buildUruguayLevel4Rows,
  parseCsv,
  renderUruguayDraftSql,
} from "./uruguay-level4-lib.mjs";

// Recurso "Plan Circuital CSV" del dataset
// corte-electoral-elecciones_departamentales_y_municipales_2025.
const PLAN_CIRCUITAL =
  "https://catalogodatos.gub.uy/dataset/2d5eb299-0d95-478b-9271-c62f601e7bc1/resource/6eb3c940-4db8-4023-8944-3d44700ed282/download/plan-circuital.csv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0077_uruguay_local_governments.sql",
);

const response = await fetch(PLAN_CIRCUITAL, {
  signal: AbortSignal.timeout(60_000),
});
if (!response.ok) {
  throw new Error(`Corte Electoral respondió ${response.status}`);
}
const circuits = parseCsv(await response.text());

// Un CSV con otra forma o recortado dejaría departamentos vacíos sin avisar.
if (
  !circuits.length ||
  !("Departamento" in circuits[0]) ||
  !("Municipio" in circuits[0])
) {
  throw new Error(
    "El plan circuital no trae las columnas Departamento y Municipio",
  );
}
const present = new Set(circuits.map((row) => row.Departamento.trim()));
const absent = [...DEPARTMENTS.keys()].filter((code) => !present.has(code));
if (absent.length) {
  throw new Error(`Departamentos sin circuitos: ${absent.join(", ")}`);
}

const rows = buildUruguayLevel4Rows(circuits);
const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderUruguayDraftSql(rows, { fetchedAt }));

const perDepartment = new Map();
for (const row of rows) {
  perDepartment.set(
    row.parentSlug,
    (perDepartment.get(row.parentSlug) ?? 0) + 1,
  );
}
process.stdout.write(
  `${rows.length} filas de ${circuits.length} circuitos en ${path.relative(root, output)}\n` +
    [...perDepartment].map(([slug, n]) => `  ${slug}: ${n}`).join("\n") +
    "\n",
);
