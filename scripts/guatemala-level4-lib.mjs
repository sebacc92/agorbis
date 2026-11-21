// Lógica pura del borrador del nivel 4 de Guatemala (D139). No descarga nada:
// recibe las hojas gtm_admin2 y gtm_adminpoints del COD-AB de HDX (fuente
// CONRED) y arma filas y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const GUATEMALA_PATH = "earth.north-america.guatemala";

/**
 * P-code de departamento → comunidad de nivel 3 que ya existe en la base
 * (0016). Tres quedaron mal en 0016 ("Izabal Department", "Santa Rosa
 * Department", "Suchitepeque"): el padre se busca por ese slug, pero el slug
 * de los municipios usa el nombre correcto para no heredar el error.
 */
export const DEPARTMENTS = new Map(
  /** @type {[string, string, string?][]} */ ([
    ["GT01", "Guatemala"],
    ["GT02", "El Progreso"],
    ["GT03", "Sacatepéquez"],
    ["GT04", "Chimaltenango"],
    ["GT05", "Escuintla"],
    ["GT06", "Santa Rosa", "guatemala-santa-rosa-department"],
    ["GT07", "Sololá"],
    ["GT08", "Totonicapán"],
    ["GT09", "Quetzaltenango"],
    ["GT10", "Suchitepéquez", "guatemala-suchitepeque"],
    ["GT11", "Retalhuleu"],
    ["GT12", "San Marcos"],
    ["GT13", "Huehuetenango"],
    ["GT14", "Quiché"],
    ["GT15", "Baja Verapaz"],
    ["GT16", "Alta Verapaz"],
    ["GT17", "Petén"],
    ["GT18", "Izabal", "guatemala-izabal-department"],
    ["GT19", "Zacapa"],
    ["GT20", "Chiquimula"],
    ["GT21", "Jalapa"],
    ["GT22", "Jutiapa"],
  ]).map(([code, name, slug]) => {
    const prefix = `guatemala-${slugify(name)}`;
    return [code, { name, slug: slug ?? prefix, prefix }];
  }),
);

/**
 * Los lagos de Amatitlán y Atitlán vienen como unidades propias, con código
 * terminado en 00. No son municipios: sin ellos quedan los 340 oficiales.
 */
const LAKES = new Set(["GT0100", "GT0700"]);

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * @typedef {{ adm1_pcode: string, adm1_name: string, adm2_pcode: string, adm2_name: string }} MunicipioRecord
 * @typedef {{ admin_level: string, adm2_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio, con su punto. El slug lleva el departamento porque
 * hay homónimos entre departamentos (San Pedro Sacatepéquez).
 *
 * @param {ReadonlyArray<MunicipioRecord>} municipios
 * @param {ReadonlyArray<PointRecord>} points
 * @returns {Level4Row[]}
 */
export function buildGuatemalaLevel4Rows(municipios, points) {
  const pointOf = new Map(
    points
      .filter((item) => item.admin_level === "2")
      .map((item) => [item.adm2_pcode, item]),
  );
  const slugs = new Set();
  const rows = [];
  for (const record of municipios) {
    if (LAKES.has(record.adm2_pcode)) continue;
    const department = DEPARTMENTS.get(record.adm1_pcode);
    if (!department) {
      throw new Error(`Departamento desconocido: ${record.adm1_pcode}`);
    }
    if (record.adm1_name.trim() !== department.name) {
      throw new Error(
        `El departamento ${record.adm1_pcode} no coincide: ${record.adm1_name}`,
      );
    }
    const name = record.adm2_name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error(`Municipio sin nombre: ${record.adm2_pcode}`);

    const located = pointOf.get(record.adm2_pcode);
    const lat = located ? coordinate(located.y_coord) : null;
    const lng = located ? coordinate(located.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Municipio sin punto: ${record.adm2_pcode} (${name})`);
    }

    const slug = `${department.prefix}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: department.slug,
      path: `${GUATEMALA_PATH}.${department.slug}.${slug}`,
      description: `Municipio del departamento de ${department.name}`,
      lat,
      lng,
      code: record.adm2_pcode,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderGuatemalaDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0087",
    title: "Municipios de Guatemala como nivel 4 (D139)",
    generator: "scripts/build-guatemala-level4-draft.mjs",
    countryPath: GUATEMALA_PATH,
    parentLabel: "DEPARTMENT",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a México.",
      "",
      "Fuente: Guatemala - Subnational Administrative Boundaries (COD-AB) de HDX,",
      "con datos de la CONRED, licencia CC BY-IGO, hojas gtm_admin2 y",
      `gtm_adminpoints, descargadas el ${fetchedAt}. ${rows.length} municipios bajo sus 22`,
      "departamentos; los lagos de Amatitlán y Atitlán, que la capa trae como",
      "unidades, quedan afuera.",
    ],
  });
}
