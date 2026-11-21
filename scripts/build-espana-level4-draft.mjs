// Genera supabase/sql-drafts/0095_espana_local_governments.sql desde la
// Relación de municipios del INE a 1 de enero de 2025 (D148). Se corre a mano:
//   node scripts/build-espana-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  COMMUNITIES,
  buildEspanaLevel4Rows,
  renderEspanaDraftSql,
} from "./espana-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const INE = "https://www.ine.es/daco/daco42/codmun/diccionario25.xlsx";
// 8.132 municipios, Ceuta y Melilla incluidas. Otro número es un cambio que
// se revisa: el INE publica una relación nueva cada 1 de enero.
const EXPECTED_ENTRIES = 8132;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0095_espana_local_governments.sql",
);

const response = await fetch(INE, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`El INE respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());
// La primera fila es el título de la planilla; el encabezado va en la segunda.
const entries = readXlsxSheet(book, "dic25", { skipRows: 1 });
if (entries.length !== EXPECTED_ENTRIES) {
  throw new Error(
    `El INE trae ${entries.length} municipios; se esperaban ${EXPECTED_ENTRIES}`,
  );
}

const rows = buildEspanaLevel4Rows(
  entries.map((entry) => ({
    codauto: entry.CODAUTO,
    cpro: entry.CPRO,
    cmun: entry.CMUN,
    nombre: entry.NOMBRE,
  })),
);

const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...COMMUNITIES.values()].filter((c) => !present.has(c.slug));
if (absent.length) {
  throw new Error(
    `Comunidades sin municipios: ${absent.map((c) => c.slug).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderEspanaDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
