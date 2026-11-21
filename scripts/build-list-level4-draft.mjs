// Genera el borrador de nivel 4 de un país que sale de una lista (D142–D144).
// Se corre a mano, con la clave del país:
//   node scripts/build-list-level4-draft.mjs nicaragua
// No lo usa la app ni el Worker. A Wikidata y a la ANATI sólo se les piden
// datos públicos; no se envía nada.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIST_COUNTRIES } from "./list-level4-countries.mjs";
import { buildListLevel4Rows, renderListDraftSql } from "./list-level4-lib.mjs";

const WIKIDATA = "https://query.wikidata.org/sparql";
const USER_AGENT = "agorbis-level4-generator/1.0";

const key = process.argv[2];
const country = key ? LIST_COUNTRIES.get(key) : undefined;
if (!country) {
  throw new Error(
    `Uso: node scripts/build-list-level4-draft.mjs <${[...LIST_COUNTRIES.keys()].join("|")}>`,
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  `supabase/sql-drafts/${country.number}_${country.key.replace(/-/g, "_")}_local_governments.sql`,
);

/** @param {string} value */
const round = (value) => Math.round(Number(value) * 1e6) / 1e6;

/**
 * Unidades vigentes de una clase de Wikidata, con su padre y su punto. Una
 * unidad con más de un padre o sin padre corta la generación en la librería.
 * @param {string} classId
 */
async function fromWikidata(classId) {
  const query = `SELECT ?item ?label ?parentLabel ?coord WHERE {
    ?item wdt:P31 wd:${classId} ; rdfs:label ?label . FILTER(LANG(?label) = "es")
    FILTER NOT EXISTS { ?item wdt:P576 ?fin }
    OPTIONAL { ?item wdt:P131 ?parent . ?parent rdfs:label ?parentLabel .
      FILTER(LANG(?parentLabel) = "es") }
    OPTIONAL { ?item wdt:P625 ?coord }
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
  /** @type {Map<string, { code: string, name: string, parents: Set<string>, lat?: number, lng?: number }>} */
  const items = new Map();
  for (const b of (await response.json()).results.bindings) {
    const code = b.item.value.split("/").pop();
    const entry = items.get(code) ?? {
      code,
      name: b.label.value,
      parents: new Set(),
    };
    if (b.parentLabel) entry.parents.add(b.parentLabel.value);
    const point = b.coord?.value.match(/^Point\(([-\d.]+) ([-\d.]+)\)$/);
    if (point) {
      entry.lng = round(point[1]);
      entry.lat = round(point[2]);
    }
    items.set(code, entry);
  }
  return [...items.values()].map(({ parents, ...item }) => {
    if (parents.size > 1) {
      throw new Error(`${item.code} tiene varios padres: ${[...parents]}`);
    }
    return { ...item, parent: [...parents][0] ?? "" };
  });
}

/**
 * Distritos de la ANATI: un registro por distrito y por uso (tierra, lago,
 * río), así que se toma uno por código.
 * @param {string} base
 */
async function fromAnati(base) {
  const url = new URL(base);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "cod_prov,nomb_prov,cod_dist,nomb_dist");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`ANATI respondió ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.features) || body.exceededTransferLimit) {
    throw new Error("La ANATI no devolvió la capa completa");
  }
  /** @type {Map<string, { code: string, name: string, parent: string }>} */
  const byCode = new Map();
  for (const { attributes: a } of body.features) {
    byCode.set(a.cod_dist, {
      code: a.cod_dist,
      name: a.nomb_dist,
      parent: a.nomb_prov,
    });
  }
  return [...byCode.values()];
}

const items =
  country.source.kind === "wikidata"
    ? await fromWikidata(country.source.classId)
    : await fromAnati(country.source.url);
const rows = buildListLevel4Rows(country, items);

if (rows.length !== country.expected) {
  throw new Error(`Se esperaban ${country.expected} y hay ${rows.length}`);
}
const present = new Set(rows.map((row) => row.parentSlug));
const absent = country.parents.filter((p) => !present.has(p.slug));
if (absent.length) {
  throw new Error(`Sin hijos: ${absent.map((p) => p.name).join(", ")}`);
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderListDraftSql(country, rows, { fetchedAt }));
const withPoint = rows.filter((row) => row.lat !== undefined).length;
process.stdout.write(
  `${rows.length} filas (${withPoint} con punto) en ${path.relative(root, output)}\n`,
);
