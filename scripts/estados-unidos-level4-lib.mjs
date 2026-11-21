// Lógica pura del borrador del nivel 4 de Estados Unidos (D149). No descarga
// nada: recibe el texto del Gazetteer de condados del Census Bureau, ya
// sacado del zip por el generador, y arma filas y SQL, para que el spec
// pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const US_PATH = "earth.north-america.estados-unidos";

/**
 * Sigla postal → estado de nivel 3 que ya existe en la base (0016). El
 * Distrito de Columbia no está: es un único equivalente de condado y queda
 * en su nivel 3, como el Distrito Federal de Brasil.
 */
export const STATES = new Map(
  /** @type {[string, string][]} */ ([
    ["AL", "Alabama"],
    ["AK", "Alaska"],
    ["AZ", "Arizona"],
    ["AR", "Arkansas"],
    ["CA", "California"],
    ["CO", "Colorado"],
    ["CT", "Connecticut"],
    ["DE", "Delaware"],
    ["FL", "Florida"],
    ["GA", "Georgia"],
    ["HI", "Hawaii"],
    ["ID", "Idaho"],
    ["IL", "Illinois"],
    ["IN", "Indiana"],
    ["IA", "Iowa"],
    ["KS", "Kansas"],
    ["KY", "Kentucky"],
    ["LA", "Louisiana"],
    ["ME", "Maine"],
    ["MD", "Maryland"],
    ["MA", "Massachusetts"],
    ["MI", "Michigan"],
    ["MN", "Minnesota"],
    ["MS", "Mississippi"],
    ["MO", "Missouri"],
    ["MT", "Montana"],
    ["NE", "Nebraska"],
    ["NV", "Nevada"],
    ["NH", "New Hampshire"],
    ["NJ", "New Jersey"],
    ["NM", "New Mexico"],
    ["NY", "New York"],
    ["NC", "North Carolina"],
    ["ND", "North Dakota"],
    ["OH", "Ohio"],
    ["OK", "Oklahoma"],
    ["OR", "Oregon"],
    ["PA", "Pennsylvania"],
    ["RI", "Rhode Island"],
    ["SC", "South Carolina"],
    ["SD", "South Dakota"],
    ["TN", "Tennessee"],
    ["TX", "Texas"],
    ["UT", "Utah"],
    ["VT", "Vermont"],
    ["VA", "Virginia"],
    ["WA", "Washington"],
    ["WV", "West Virginia"],
    ["WI", "Wisconsin"],
    ["WY", "Wyoming"],
  ]).map(([usps, name]) => [
    usps,
    { name, slug: `estados-unidos-${slugify(name)}` },
  ]),
);

/**
 * Fuera del nivel 4: el Distrito de Columbia (nivel 3), Puerto Rico y los
 * territorios (no son nivel 3 en la base), y Kalawao, que es condado sólo en
 * el papel: sin gobierno propio, lo administra el Departamento de Salud de
 * Hawái, como Fernando de Noronha en Brasil (D137).
 */
const OUTSIDE_STATES = new Set(["DC", "PR", "AS", "GU", "MP", "VI", "UM"]);
const WITHOUT_GOVERNMENT = new Set(["15005"]);

/**
 * Tipo de equivalente de condado, por el sufijo del nombre del Census. Lista
 * cerrada: un sufijo nuevo es un cambio que se revisa. El orden importa
 * ("City and Borough" antes que "Borough").
 */
const KINDS = /** @type {[RegExp, string][]} */ ([
  [/ County$/, "Condado"],
  [/ Parish$/, "Parroquia"],
  [/ City and Borough$/, "Borough"],
  [/ Borough$/, "Borough"],
  [/ Municipality$/, "Borough"],
  [/ Census Area$/, "Área censal"],
  [/ Planning Region$/, "Región de planificación"],
  [/ city$/, "Ciudad independiente"],
  [/^Carson City$/, "Ciudad independiente"],
]);

/** @param {string} name */
function kindOf(name) {
  const kind = KINDS.find(([pattern]) => pattern.test(name))?.[1];
  if (!kind) throw new Error(`Tipo de condado desconocido: ${name}`);
  return kind;
}

/**
 * @typedef {{ usps: string, geoid: string, name: string, lat: number, lng: number }} CountyRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string, lat: number, lng: number,
 * }} Level4Row
 */

/**
 * Filas del Gazetteer (texto separado por tabuladores, con espacios de
 * relleno al final de cada línea).
 *
 * @param {string} text
 * @returns {CountyRecord[]}
 */
export function parseGazetteer(text) {
  const [header, ...lines] = text
    .split(/\r?\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
  if (!header) throw new Error("El Gazetteer está vacío");
  const column = (/** @type {string} */ key) => {
    const index = header.indexOf(key);
    if (index < 0) throw new Error(`El Gazetteer no trae la columna ${key}`);
    return index;
  };
  const usps = column("USPS");
  const geoid = column("GEOID");
  const name = column("NAME");
  const lat = column("INTPTLAT");
  const lng = column("INTPTLONG");
  return lines.map((cells) => ({
    usps: cells[usps],
    geoid: cells[geoid],
    name: cells[name],
    lat: Number(cells[lat]),
    lng: Number(cells[lng]),
  }));
}

/** @param {number} value */
const round6 = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Una fila por condado o equivalente, con el punto interior que publica el
 * Census. El slug lleva la sigla del estado, como Brasil (D137), y el nombre
 * completo: Virginia tiene "Fairfax County" y "Fairfax city".
 *
 * @param {ReadonlyArray<CountyRecord>} counties
 * @returns {Level4Row[]}
 */
export function buildEstadosUnidosLevel4Rows(counties) {
  const codes = new Set();
  const slugs = new Set();
  const rows = [];
  for (const record of counties) {
    if (OUTSIDE_STATES.has(record.usps)) continue;
    if (WITHOUT_GOVERNMENT.has(record.geoid)) continue;
    const state = STATES.get(record.usps);
    if (!state) throw new Error(`Estado desconocido: ${record.usps}`);
    if (!/^\d{5}$/.test(record.geoid) || codes.has(record.geoid)) {
      throw new Error(`GEOID inválido o repetido: ${record.geoid}`);
    }
    codes.add(record.geoid);

    const name = record.name.trim().replace(/\s+/g, " ");
    const kind = kindOf(name);
    const slug = `estados-unidos-${record.usps.toLowerCase()}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: state.slug,
      path: `${US_PATH}.${state.slug}.${slug}`,
      description: `${kind} del estado de ${state.name}`,
      code: record.geoid,
      lat: round6(record.lat),
      lng: round6(record.lng),
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderEstadosUnidosDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0096",
    title: "Condados de Estados Unidos como nivel 4 (D149)",
    generator: "scripts/build-estados-unidos-level4-draft.mjs",
    countryPath: US_PATH,
    parentLabel: "STATE",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a España.",
      "",
      "Fuente: 2024 Gazetteer Files del U.S. Census Bureau (condados, dominio",
      `público), descargado el ${fetchedAt}. ${rows.length} condados y equivalentes`,
      "(parroquias, boroughs y áreas censales de Alaska, ciudades independientes,",
      "regiones de planificación de Connecticut) bajo los 50 estados, cada uno",
      "con su punto interior. El Distrito de Columbia queda en su nivel 3 y",
      "Kalawao, sin gobierno propio, en Hawái.",
    ],
  });
}
