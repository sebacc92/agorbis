// Genera supabase/sql-drafts/0082_peru_local_governments.sql desde el COD-AB
// de Perú en HDX (fuente IGN), con las tildes de Wikidata (D134). Se corre a
// mano: `node scripts/build-peru-level4-draft.mjs`. No lo usa la app ni el
// Worker. A Wikidata sólo se le piden etiquetas públicas; no se envía nada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REGIONS,
  buildPeruLevel4Rows,
  renderPeruDraftSql,
} from "./peru-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const COD_AB =
  "https://data.humdata.org/dataset/54fc7f4d-f4c0-4892-91f6-2fe7c1ecf363/resource/475e2f92-53c3-4fed-a610-5fcae7a1b5ff/download/per_admin_boundaries.xlsx";
const WIKIDATA = "https://query.wikidata.org/sparql";
// Q509686: provincia del Perú; Q2179958: distrito del Perú.
const CLASSES = { provinces: "Q509686", districts: "Q2179958" };
const USER_AGENT = "agorbis-level4-generator/1.0";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0082_peru_local_governments.sql",
);

/** Etiquetas en español de una clase, con las de sus unidades contenedoras. */
async function labels(/** @type {string} */ classId) {
  const query = `SELECT ?item ?label ?parentLabel WHERE {
    ?item wdt:P31 wd:${classId} ; rdfs:label ?label . FILTER(LANG(?label) = "es")
    OPTIONAL { ?item wdt:P131 ?parent . ?parent rdfs:label ?parentLabel .
      FILTER(LANG(?parentLabel) = "es") }
  }`;
  const url = new URL(WIKIDATA);
  url.searchParams.set("query", query);
  const response = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`Wikidata respondió ${response.status}`);
  const body = await response.json();
  /** @type {Map<string, { name: string, parents: string[] }>} */
  const items = new Map();
  for (const binding of body.results.bindings) {
    const entry = items.get(binding.item.value) ?? {
      name: binding.label.value,
      parents: [],
    };
    if (binding.parentLabel) entry.parents.push(binding.parentLabel.value);
    items.set(binding.item.value, entry);
  }
  return [...items.values()];
}

const response = await fetch(COD_AB, { signal: AbortSignal.timeout(180_000) });
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

const provinces = readXlsxSheet(book, "per_admin2");
const districts = readXlsxSheet(book, "per_admin3");
const points = readXlsxSheet(book, "per_adminpoints");
const accents = {
  provinces: await labels(CLASSES.provinces),
  districts: await labels(CLASSES.districts),
};

const rows = buildPeruLevel4Rows({
  provinces: provinces.map(
    ({ adm1_pcode, adm1_name, adm2_pcode, adm2_name }) => ({
      adm1_pcode,
      adm1_name,
      adm2_pcode,
      adm2_name,
    }),
  ),
  districts: districts.map(({ adm2_pcode, adm3_pcode, adm3_name }) => ({
    adm2_pcode,
    adm3_pcode,
    adm3_name,
  })),
  points: points.map(
    ({ admin_level, adm2_pcode, adm3_pcode, y_coord, x_coord }) => ({
      admin_level,
      adm2_pcode,
      adm3_pcode,
      y_coord,
      x_coord,
    }),
  ),
  accents,
});

// Cada departamento con filas, y el total que dice la capa: provincias menos
// El Callao y Lima, más sus distritos.
const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...REGIONS.values()].filter((r) => !present.has(r.slug));
if (absent.length) {
  throw new Error(
    `Departamentos sin filas: ${absent.map((r) => r.name).join(", ")}`,
  );
}
const expected =
  provinces.length -
  2 +
  districts.filter(
    (d) => d.adm2_pcode === "PE0701" || d.adm2_pcode === "PE1501",
  ).length;
if (rows.length !== expected) {
  throw new Error(`Se esperaban ${expected} filas y hay ${rows.length}`);
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderPeruDraftSql(rows, { fetchedAt }));

const sourceName = new Map([
  ...provinces.map((p) => [p.adm2_pcode, p.adm2_name]),
  ...districts.map((d) => [d.adm3_pcode, d.adm3_name]),
]);
const accented = rows.filter(
  (row) => row.name !== sourceName.get(row.code)?.trim(),
);
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}; ${accented.length} con tildes de Wikidata\n`,
);
