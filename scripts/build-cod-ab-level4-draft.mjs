// Genera el borrador de nivel 4 de un país que sale de un COD-AB de HDX
// (D140, D141). Se corre a mano, con la clave del país:
//   node scripts/build-cod-ab-level4-draft.mjs honduras
// No lo usa la app ni el Worker. A Wikidata, cuando el país lo pide, sólo se
// le piden etiquetas públicas; no se envía nada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRIES } from "./cod-ab-level4-countries.mjs";
import {
  buildCodAbLevel4Rows,
  renderCodAbDraftSql,
} from "./cod-ab-level4-lib.mjs";
import { readXlsxSheet } from "./xlsx-sheet.mjs";

const WIKIDATA = "https://query.wikidata.org/sparql";
const USER_AGENT = "agorbis-level4-generator/1.0";

const key = process.argv[2];
const country = key ? COUNTRIES.get(key) : undefined;
if (!country) {
  throw new Error(
    `Uso: node scripts/build-cod-ab-level4-draft.mjs <${[...COUNTRIES.keys()].join("|")}>`,
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  `supabase/sql-drafts/${country.number}_${country.key.replace(/-/g, "_")}_local_governments.sql`,
);

/** Etiquetas en español de una clase de Wikidata, con sus contenedoras. */
async function wikidataLabels(
  /** @type {string} */ classId,
  /** @type {string} */ language,
) {
  const query = `SELECT ?item ?label ?parentLabel WHERE {
    ?item wdt:P31 wd:${classId} ; rdfs:label ?label . FILTER(LANG(?label) = "${language}")
    OPTIONAL { ?item wdt:P131 ?parent . ?parent rdfs:label ?parentLabel .
      FILTER(LANG(?parentLabel) = "${language}") }
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
  /** @type {Map<string, { name: string, parents: string[] }>} */
  const items = new Map();
  for (const binding of (await response.json()).results.bindings) {
    const entry = items.get(binding.item.value) ?? {
      name: binding.label.value,
      parents: [],
    };
    if (binding.parentLabel) entry.parents.push(binding.parentLabel.value);
    items.set(binding.item.value, entry);
  }
  return [...items.values()];
}

const response = await fetch(country.url, {
  signal: AbortSignal.timeout(180_000),
});
if (!response.ok) throw new Error(`HDX respondió ${response.status}`);
const book = Buffer.from(await response.arrayBuffer());

// Por defecto el padre es adm1 y la unidad adm2; algunos COD-AB tienen un
// nivel más (República Dominicana: regiones, provincias, municipios). Los
// nombres pueden traer un prefijo ("Municipio Arenoso") que no se muestra.
const { parent: up, unit: down } = country.levels ?? {
  parent: "adm1",
  unit: "adm2",
};
const clean = (/** @type {string} */ name) =>
  country.stripPrefix ? name.replace(country.stripPrefix, "") : name;
const unitLevel = down.replace("adm", "");

const rows = buildCodAbLevel4Rows(country, {
  units: readXlsxSheet(book, country.sheets.units).map((row) => ({
    adm1_pcode: row[`${up}_pcode`],
    adm1_name: clean(row[`${up}_name`]),
    adm2_pcode: row[`${down}_pcode`],
    adm2_name: clean(row[`${down}_name`]),
  })),
  // La librería lee los puntos del nivel de la unidad como si fueran adm2.
  points: readXlsxSheet(book, country.sheets.points)
    .filter((row) => row.admin_level === unitLevel)
    .map((row) => ({
      admin_level: "2",
      adm2_pcode: row[`${down}_pcode`],
      y_coord: row.y_coord,
      x_coord: row.x_coord,
    })),
  accents: country.wikidataClass
    ? await wikidataLabels(
        country.wikidataClass,
        country.wikidataLanguage ?? "es",
      )
    : [],
});

if (rows.length !== country.expected) {
  throw new Error(`Se esperaban ${country.expected} y hay ${rows.length}`);
}
const present = new Set(rows.map((row) => row.parentSlug));
const absent = country.parents.filter((p) => !present.has(p.slug));
if (absent.length) {
  throw new Error(`Sin hijos: ${absent.map((p) => p.name).join(", ")}`);
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderCodAbDraftSql(country, rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
