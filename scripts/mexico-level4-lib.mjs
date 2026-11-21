// Lógica pura del borrador del nivel 4 de México (D138). No descarga nada:
// recibe el catálogo de municipios del INEGI y arma filas y SQL, para que el
// spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const MEXICO_PATH = "earth.north-america.mexico";

/**
 * Clave INEGI de entidad → comunidad de nivel 3 que ya existe en la base
 * (0016), con el nombre corto que se muestra y el oficial del INEGI, que se
 * compara con el catálogo. La Ciudad de México quedó en 0016 como "Mexico
 * City"; su slug se usa tal como está.
 */
export const ENTITIES = new Map(
  /** @type {[string, string, string, string?][]} */ ([
    ["01", "Aguascalientes", "Aguascalientes"],
    ["02", "Baja California", "Baja California"],
    ["03", "Baja California Sur", "Baja California Sur"],
    ["04", "Campeche", "Campeche"],
    ["05", "Coahuila", "Coahuila de Zaragoza"],
    ["06", "Colima", "Colima"],
    ["07", "Chiapas", "Chiapas"],
    ["08", "Chihuahua", "Chihuahua"],
    ["09", "Ciudad de México", "Ciudad de México", "mexico-mexico-city"],
    ["10", "Durango", "Durango"],
    ["11", "Guanajuato", "Guanajuato"],
    ["12", "Guerrero", "Guerrero"],
    ["13", "Hidalgo", "Hidalgo"],
    ["14", "Jalisco", "Jalisco"],
    ["15", "México", "México"],
    ["16", "Michoacán", "Michoacán de Ocampo"],
    ["17", "Morelos", "Morelos"],
    ["18", "Nayarit", "Nayarit"],
    ["19", "Nuevo León", "Nuevo León"],
    ["20", "Oaxaca", "Oaxaca"],
    ["21", "Puebla", "Puebla"],
    ["22", "Querétaro", "Querétaro"],
    ["23", "Quintana Roo", "Quintana Roo"],
    ["24", "San Luis Potosí", "San Luis Potosí"],
    ["25", "Sinaloa", "Sinaloa"],
    ["26", "Sonora", "Sonora"],
    ["27", "Tabasco", "Tabasco"],
    ["28", "Tamaulipas", "Tamaulipas"],
    ["29", "Tlaxcala", "Tlaxcala"],
    ["30", "Veracruz", "Veracruz de Ignacio de la Llave"],
    ["31", "Yucatán", "Yucatán"],
    ["32", "Zacatecas", "Zacatecas"],
  ]).map(([code, name, official, slug]) => [
    code,
    { slug: slug ?? `mexico-${slugify(name)}`, name, official },
  ]),
);

const CAPITAL = "09";

/**
 * @typedef {{ cvegeo: string, cve_ent: string, cve_mun: string, nomgeo: string }} MunicipioRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio y por alcaldía de la Ciudad de México, que también
 * se elige por voto (como las comunas de CABA en D127). El slug lleva la
 * entidad porque hay homónimos entre entidades. Dentro de Oaxaca hay dos
 * pares con el mismo nombre y el catálogo no trae el distrito que los
 * distingue: llevan su clave INEGI en el nombre y el slug. Sin coordenadas.
 *
 * @param {ReadonlyArray<MunicipioRecord>} municipios
 * @param {ReadonlyMap<string, string>} entityNames clave → nombre del INEGI
 * @returns {Level4Row[]}
 */
export function buildMexicoLevel4Rows(municipios, entityNames) {
  const repeated = new Map();
  for (const item of municipios) {
    const key = `${item.cve_ent}|${item.nomgeo.trim()}`;
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }

  const slugs = new Set();
  const rows = municipios.map((item) => {
    const entity = ENTITIES.get(item.cve_ent);
    if (!entity) throw new Error(`Entidad desconocida: ${item.cve_ent}`);
    const official = entityNames.get(item.cve_ent);
    if (official !== entity.official) {
      throw new Error(`La entidad ${item.cve_ent} no coincide: ${official}`);
    }
    const source = item.nomgeo.trim().replace(/\s+/g, " ");
    if (!source) throw new Error(`Municipio sin nombre: ${item.cvegeo}`);

    const homonym = repeated.get(`${item.cve_ent}|${item.nomgeo.trim()}`) > 1;
    const name = homonym ? `${source} (clave INEGI ${item.cvegeo})` : source;
    const slug = homonym
      ? `${entity.slug}-${slugify(source)}-${item.cvegeo}`
      : `${entity.slug}-${slugify(source)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    return {
      slug,
      name,
      parentSlug: entity.slug,
      path: `${MEXICO_PATH}.${entity.slug}.${slug}`,
      description:
        item.cve_ent === CAPITAL
          ? "Alcaldía de la Ciudad de México"
          : `Municipio del estado de ${entity.name}`,
      code: item.cvegeo,
    };
  });
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderMexicoDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0086",
    title: "Municipios y alcaldías de México como nivel 4 (D138)",
    generator: "scripts/build-mexico-level4-draft.mjs",
    countryPath: MEXICO_PATH,
    parentLabel: "STATE",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Brasil.",
      "",
      "Fuente: catálogo geoestadístico del INEGI (gaia.inegi.org.mx/wscatgeo,",
      "Términos de Libre Uso de la Información del INEGI, con atribución),",
      `consultado el ${fetchedAt}. ${rows.length} filas: los municipios de los 31`,
      "estados y las 16 alcaldías de la Ciudad de México. Sin coordenadas: el",
      "GPS del onboarding sugiere la entidad.",
    ],
  });
}
