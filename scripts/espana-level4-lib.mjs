// Lógica pura del borrador del nivel 4 de España (D148). No descarga nada:
// recibe las filas de la Relación de municipios del INE, ya leídas por el
// generador, y arma filas y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const ESPANA_PATH = "earth.europe.espana";

/**
 * Código de comunidad autónoma del INE → comunidad de nivel 3 que ya existe
 * en la base (0016), con su slug en inglés tal como está: corregirlo cambia
 * el path de comunidades que ya existen y es otra decisión. Ceuta (18) y
 * Melilla (19) no están: cada una es un solo municipio y ya es nivel 3.
 */
export const COMMUNITIES = new Map(
  /** @type {[string, string, string[]][]} */ ([
    [
      "01",
      "espana-andalusia",
      ["04", "11", "14", "18", "21", "23", "29", "41"],
    ],
    ["02", "espana-aragon", ["22", "44", "50"]],
    ["03", "espana-asturias", ["33"]],
    ["04", "espana-balearic-islands", ["07"]],
    ["05", "espana-canary-islands", ["35", "38"]],
    ["06", "espana-cantabria", ["39"]],
    [
      "07",
      "espana-castille-and-leon",
      ["05", "09", "24", "34", "37", "40", "42", "47", "49"],
    ],
    ["08", "espana-castille-la-mancha", ["02", "13", "16", "19", "45"]],
    ["09", "espana-catalonia", ["08", "17", "25", "43"]],
    ["10", "espana-valencia", ["03", "12", "46"]],
    ["11", "espana-extremadura", ["06", "10"]],
    ["12", "espana-galicia", ["15", "27", "32", "36"]],
    ["13", "espana-madrid", ["28"]],
    ["14", "espana-murcia", ["30"]],
    ["15", "espana-navarre", ["31"]],
    ["16", "espana-basque-country", ["01", "20", "48"]],
    ["17", "espana-la-rioja", ["26"]],
  ]).map(([code, slug, provinces]) => [code, { slug, provinces }]),
);

const OUTSIDE_LEVEL4 = new Set(["18", "19"]);

/**
 * Código de provincia del INE → nombre (con el artículo adelante) y la parte
 * del slug. La parte va corta y sin la forma cooficial, para que los slugs
 * de los municipios no se alarguen ("alicante", no "alicante-alacant").
 */
export const PROVINCES = new Map(
  /** @type {[string, string, string][]} */ ([
    ["01", "Araba/Álava", "alava"],
    ["02", "Albacete", "albacete"],
    ["03", "Alicante/Alacant", "alicante"],
    ["04", "Almería", "almeria"],
    ["05", "Ávila", "avila"],
    ["06", "Badajoz", "badajoz"],
    ["07", "Illes Balears", "illes-balears"],
    ["08", "Barcelona", "barcelona"],
    ["09", "Burgos", "burgos"],
    ["10", "Cáceres", "caceres"],
    ["11", "Cádiz", "cadiz"],
    ["12", "Castellón/Castelló", "castellon"],
    ["13", "Ciudad Real", "ciudad-real"],
    ["14", "Córdoba", "cordoba"],
    ["15", "A Coruña", "a-coruna"],
    ["16", "Cuenca", "cuenca"],
    ["17", "Girona", "girona"],
    ["18", "Granada", "granada"],
    ["19", "Guadalajara", "guadalajara"],
    ["20", "Gipuzkoa", "gipuzkoa"],
    ["21", "Huelva", "huelva"],
    ["22", "Huesca", "huesca"],
    ["23", "Jaén", "jaen"],
    ["24", "León", "leon"],
    ["25", "Lleida", "lleida"],
    ["26", "La Rioja", "la-rioja"],
    ["27", "Lugo", "lugo"],
    ["28", "Madrid", "madrid"],
    ["29", "Málaga", "malaga"],
    ["30", "Murcia", "murcia"],
    ["31", "Navarra", "navarra"],
    ["32", "Ourense", "ourense"],
    ["33", "Asturias", "asturias"],
    ["34", "Palencia", "palencia"],
    ["35", "Las Palmas", "las-palmas"],
    ["36", "Pontevedra", "pontevedra"],
    ["37", "Salamanca", "salamanca"],
    ["38", "Santa Cruz de Tenerife", "santa-cruz-de-tenerife"],
    ["39", "Cantabria", "cantabria"],
    ["40", "Segovia", "segovia"],
    ["41", "Sevilla", "sevilla"],
    ["42", "Soria", "soria"],
    ["43", "Tarragona", "tarragona"],
    ["44", "Teruel", "teruel"],
    ["45", "Toledo", "toledo"],
    ["46", "Valencia/València", "valencia"],
    ["47", "Valladolid", "valladolid"],
    ["48", "Bizkaia", "bizkaia"],
    ["49", "Zamora", "zamora"],
    ["50", "Zaragoza", "zaragoza"],
  ]).map(([code, name, slug]) => [code, { name, slug }]),
);

/**
 * Artículos que el INE pospone tras una coma ("Bonillo, El"), en castellano,
 * catalán, balear y gallego. Lista cerrada: una coma que no precede a uno de
 * estos es parte del nombre ("Castell d'Aro, Platja d'Aro i s'Agaró").
 */
const POSTPOSED_ARTICLE =
  /^(.+), (el|la|los|las|l'|les|els|es|sa|ses|a|o|as|os)$/i;

/** @param {string} part */
function frontArticle(part) {
  const match = part.match(POSTPOSED_ARTICLE);
  if (!match) return part;
  const [, rest, article] = match;
  const joined = article.endsWith("'")
    ? `${article}${rest}`
    : `${article} ${rest}`;
  return joined[0].toUpperCase() + joined.slice(1);
}

/**
 * Nombre del INE en el orden en que se lee: el artículo adelante en cada
 * parte de un nombre bilingüe ("Vila Joiosa, la/Villajoyosa" →
 * "La Vila Joiosa/Villajoyosa").
 *
 * @param {string} name
 */
export function ineName(name) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split("/")
    .map((part) => frontArticle(part.trim()))
    .join("/");
}

/**
 * @typedef {{ codauto: string, cpro: string, cmun: string, nombre: string }} MunicipioRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio, cada uno con su ayuntamiento. El slug lleva siempre
 * la provincia: hay 17 nombres repetidos entre provincias, "Madrid" y
 * "València" chocarían con el slug de su comunidad, y un homónimo nuevo no
 * obliga a cambiar URLs que ya existen. Sin coordenadas: la Relación del INE
 * no las trae.
 *
 * @param {ReadonlyArray<MunicipioRecord>} municipios
 * @returns {Level4Row[]}
 */
export function buildEspanaLevel4Rows(municipios) {
  const codes = new Set();
  const slugs = new Set();
  const rows = [];
  for (const record of municipios) {
    if (OUTSIDE_LEVEL4.has(record.codauto)) continue;
    const community = COMMUNITIES.get(record.codauto);
    if (!community) throw new Error(`Comunidad desconocida: ${record.codauto}`);
    const province = PROVINCES.get(record.cpro);
    if (!province || !community.provinces.includes(record.cpro)) {
      throw new Error(
        `La provincia ${record.cpro} no es de la comunidad ${record.codauto}`,
      );
    }
    const code = `${record.cpro}${record.cmun}`;
    if (!/^\d{5}$/.test(code)) throw new Error(`Código inválido: ${code}`);
    if (codes.has(code)) throw new Error(`Código repetido: ${code}`);
    codes.add(code);

    const name = ineName(record.nombre);
    if (!name) throw new Error(`Municipio sin nombre: ${code}`);
    const slug = `espana-${province.slug}-${slugify(name.replace(/·/g, ""))}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: community.slug,
      path: `${ESPANA_PATH}.${community.slug}.${slug}`,
      description: `Municipio de la provincia de ${province.name}`,
      code,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderEspanaDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0095",
    title: "Municipios de España como nivel 4 (D148)",
    generator: "scripts/build-espana-level4-draft.mjs",
    countryPath: ESPANA_PATH,
    parentLabel: "COMMUNITY",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Haití.",
      "",
      "Fuente: Relación de municipios y sus códigos del INE a 1 de enero de 2025",
      `(reutilización con atribución), descargada el ${fetchedAt}.`,
      `${rows.length} municipios bajo sus 17 comunidades autónomas; Ceuta y Melilla`,
      "son un municipio cada una y quedan en su nivel 3. El artículo que el INE",
      "pospone va adelante. Sin coordenadas: el GPS del onboarding sugiere la",
      "comunidad.",
    ],
  });
}
