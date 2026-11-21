// Genera supabase/sql-drafts/0083_colombia_local_governments.sql desde la
// DIVIPOLA del DANE, con los nombres del COD-AB de HDX (D135). Se corre a mano:
//   node scripts/build-colombia-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPARTMENTS,
  buildColombiaLevel4Rows,
  renderColombiaDraftSql,
} from "./colombia-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const DIVIPOLA = "https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=5000";
const COD_AB =
  "https://data.humdata.org/dataset/50ea7fee-f9af-45a7-8a52-abb9c790a0b6/resource/2a98acd7-6a3f-4deb-9f1b-e00d8d4c709d/download/col_adminboundaries_tabulardata.xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0083_colombia_local_governments.sql",
);

/** @param {string} url */
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  return response;
}

const divipola = await (await download(DIVIPOLA)).json();
// Socrata corta en el $limit sin avisar: una lista exacta en el límite está
// recortada.
if (
  !Array.isArray(divipola) ||
  divipola.length === 0 ||
  divipola.length >= 5000
) {
  throw new Error(`DIVIPOLA devolvió ${divipola?.length} filas`);
}
const book = Buffer.from(await (await download(COD_AB)).arrayBuffer());
const codAbNames = new Map(
  readXlsxSheet(book, "ADM2").map((row) => [
    row.ADM2_PCODE.replace(/^CO/, ""),
    row.ADM2_ES.trim().replace(/\s+/g, " "),
  ]),
);

const rows = buildColombiaLevel4Rows(
  divipola.map(({ cod_dpto, dpto, cod_mpio, nom_mpio, tipo_municipio }) => ({
    cod_dpto,
    dpto,
    cod_mpio,
    nom_mpio,
    tipo_municipio,
  })),
  codAbNames,
);

// Todos los municipios de la DIVIPOLA menos Bogotá, y cada departamento con
// alguno.
const expected =
  divipola.filter((r) => r.tipo_municipio === "Municipio").length - 1;
if (rows.length !== expected) {
  throw new Error(`Se esperaban ${expected} municipios y hay ${rows.length}`);
}
const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...DEPARTMENTS.values()].filter((d) => !present.has(d.slug));
if (absent.length) {
  throw new Error(
    `Departamentos sin municipios: ${absent.map((d) => d.name).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderColombiaDraftSql(rows, { fetchedAt }));

const fromDivipola = rows.filter((row) => row.nameSource === "DIVIPOLA");
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}; nombre de la DIVIPOLA en ${fromDivipola.length}: ${fromDivipola.map((r) => r.name).join(", ")}\n`,
);
