// Lógica pura del borrador del nivel 4 de Bolivia (D132). No descarga nada:
// recibe las hojas bol_admin3 y bol_adminpoints del COD-AB de HDX y arma filas
// y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const BOLIVIA_PATH = "earth.south-america.bolivia";

/**
 * P-code de departamento → comunidad de nivel 3 que ya existe en la base
 * (0016). El nombre se compara con el de cada fila para que un código mal
 * asignado falle en vez de colgar municipios del departamento equivocado.
 */
export const DEPARTMENTS = new Map([
  ["BO01", { slug: "bolivia-chuquisaca", name: "Chuquisaca" }],
  ["BO02", { slug: "bolivia-la-paz", name: "La Paz" }],
  ["BO03", { slug: "bolivia-cochabamba", name: "Cochabamba" }],
  ["BO04", { slug: "bolivia-oruro", name: "Oruro" }],
  ["BO05", { slug: "bolivia-potosi", name: "Potosí" }],
  ["BO06", { slug: "bolivia-tarija", name: "Tarija" }],
  ["BO07", { slug: "bolivia-santa-cruz", name: "Santa Cruz" }],
  ["BO08", { slug: "bolivia-beni", name: "Beni" }],
  ["BO09", { slug: "bolivia-pando", name: "Pando" }],
]);

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * @typedef {{ adm1_pcode: string, adm1_name: string, adm3_pcode: string, adm3_name: string }} MunicipalityRecord
 * @typedef {{ admin_level: string, adm3_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio (adm3), colgada del departamento: la provincia
 * (adm2) no tiene gobierno propio y se saltea, como los departamentos en
 * Argentina (D127). El slug lleva el departamento porque hay homónimos
 * entre departamentos (Totora, San Pedro, Santa Rosa).
 *
 * @param {ReadonlyArray<MunicipalityRecord>} municipalities
 * @param {ReadonlyArray<PointRecord>} points
 * @returns {Level4Row[]}
 */
export function buildBoliviaLevel4Rows(municipalities, points) {
  const pointOf = new Map(
    points
      .filter((item) => item.admin_level === "3")
      .map((item) => [item.adm3_pcode, item]),
  );
  const slugs = new Set();
  const rows = municipalities.map((record) => {
    const department = DEPARTMENTS.get(record.adm1_pcode);
    if (!department) {
      throw new Error(`Departamento desconocido: ${record.adm1_pcode}`);
    }
    if (record.adm1_name.trim() !== department.name) {
      throw new Error(
        `El departamento ${record.adm1_pcode} no coincide: ${record.adm1_name}`,
      );
    }
    const name = record.adm3_name.trim();
    if (!name) throw new Error(`Municipio sin nombre: ${record.adm3_pcode}`);

    const located = pointOf.get(record.adm3_pcode);
    const lat = located ? coordinate(located.y_coord) : null;
    const lng = located ? coordinate(located.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Municipio sin punto: ${record.adm3_pcode} (${name})`);
    }

    const slug = `${department.slug}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    return {
      slug,
      name,
      parentSlug: department.slug,
      path: `${BOLIVIA_PATH}.${department.slug}.${slug}`,
      description: `Municipio del departamento de ${department.name}`,
      lat,
      lng,
      code: record.adm3_pcode,
    };
  });
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderBoliviaDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0080",
    title: "Municipios de Bolivia como nivel 4 (D132)",
    generator: "scripts/build-bolivia-level4-draft.mjs",
    countryPath: BOLIVIA_PATH,
    parentLabel: "DEPARTMENT",
    header: [
      "Va después de 0076 y de los borradores de Uruguay, Chile y Paraguay.",
      "",
      "Fuente: Bolivia - Subnational Administrative Boundaries (COD-AB) de HDX,",
      "con datos del Ministerio de Desarrollo Rural y Tierras, licencia CC BY-IGO,",
      `hojas bol_admin3 y bol_adminpoints, descargadas el ${fetchedAt}.`,
      `${rows.length} municipios bajo sus 9 departamentos, sin la provincia intermedia.`,
      "",
      "Pendiente antes de promover: las elecciones subnacionales de 2026 se",
      "hicieron en 340 municipios y la capa trae uno menos; hay que identificarlo.",
      "La capa usa nombres anteriores a algunas autonomías indígenas (Charagua,",
      "Gutiérrez, Chipaya).",
    ],
  });
}
