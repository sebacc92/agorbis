// Lógica pura del borrador del nivel 4 de Venezuela (D136). No descarga nada:
// recibe las hojas ven_admin2 y ven_adminpoints del COD-AB de HDX (fuente
// INE) y arma filas y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const VENEZUELA_PATH = "earth.south-america.venezuela";

/**
 * P-code de entidad federal → comunidad de nivel 3 que ya existe en la base
 * (0016). El nombre se compara con el de cada fila. Las Dependencias
 * Federales (VE25) no tienen municipio y quedan en su nivel 3.
 */
export const STATES = new Map(
  [
    ["VE01", "Distrito Capital"],
    ["VE02", "Amazonas"],
    ["VE03", "Anzoátegui"],
    ["VE04", "Apure"],
    ["VE05", "Aragua"],
    ["VE06", "Barinas"],
    ["VE07", "Bolívar"],
    ["VE08", "Carabobo"],
    ["VE09", "Cojedes"],
    ["VE10", "Delta Amacuro"],
    ["VE11", "Falcón"],
    ["VE12", "Guárico"],
    ["VE13", "Lara"],
    ["VE14", "Mérida"],
    ["VE15", "Miranda"],
    ["VE16", "Monagas"],
    ["VE17", "Nueva Esparta"],
    ["VE18", "Portuguesa"],
    ["VE19", "Sucre"],
    ["VE20", "Táchira"],
    ["VE21", "Trujillo"],
    ["VE22", "Yaracuy"],
    ["VE23", "Zulia"],
    ["VE24", "La Guaira"],
  ].map(([code, name]) => [code, { slug: `venezuela-${slugify(name)}`, name }]),
);

const FEDERAL_DEPENDENCIES = "VE25";
const CAPITAL_DISTRICT = "VE01";

/** Tilde que la fuente omitió. La grafía del INE se respeta. */
const NAME_FIXES = new Map([["Autónomo Rio Negro", "Autónomo Río Negro"]]);

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * @typedef {{ adm1_pcode: string, adm1_name: string, adm2_pcode: string, adm2_name: string }} MunicipalityRecord
 * @typedef {{ admin_level: string, adm2_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio, cada uno con su alcaldía. El Distrito Capital y La
 * Guaira tienen un solo municipio, pero su alcaldía es un gobierno distinto
 * del de nivel 3, así que también va. El slug lleva el estado porque hay
 * homónimos entre estados (Andrés Bello, Sucre).
 *
 * @param {ReadonlyArray<MunicipalityRecord>} municipalities
 * @param {ReadonlyArray<PointRecord>} points
 * @returns {Level4Row[]}
 */
export function buildVenezuelaLevel4Rows(municipalities, points) {
  const pointOf = new Map(
    points
      .filter((item) => item.admin_level === "2")
      .map((item) => [item.adm2_pcode, item]),
  );
  const slugs = new Set();
  const rows = [];
  for (const record of municipalities) {
    const code = record.adm1_pcode.trim();
    if (code === FEDERAL_DEPENDENCIES) continue;
    const state = STATES.get(code);
    if (!state) throw new Error(`Estado desconocido: ${code}`);
    if (record.adm1_name.trim() !== state.name) {
      throw new Error(`El estado ${code} no coincide: ${record.adm1_name}`);
    }
    const source = record.adm2_name.trim().replace(/\s+/g, " ");
    if (!source) throw new Error(`Municipio sin nombre: ${record.adm2_pcode}`);
    const name = NAME_FIXES.get(source) ?? source;

    const located = pointOf.get(record.adm2_pcode);
    const lat = located ? coordinate(located.y_coord) : null;
    const lng = located ? coordinate(located.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Municipio sin punto: ${record.adm2_pcode} (${name})`);
    }

    const slug = `${state.slug}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: state.slug,
      path: `${VENEZUELA_PATH}.${state.slug}.${slug}`,
      description:
        code === CAPITAL_DISTRICT
          ? "Municipio del Distrito Capital"
          : `Municipio del estado ${state.name}`,
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
export function renderVenezuelaDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0084",
    title: "Municipios de Venezuela como nivel 4 (D136)",
    generator: "scripts/build-venezuela-level4-draft.mjs",
    countryPath: VENEZUELA_PATH,
    parentLabel: "STATE",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Colombia.",
      "",
      "Fuente: Venezuela - Subnational Administrative Boundaries (COD-AB) de HDX,",
      "con datos del Instituto Nacional de Estadística, licencia CC BY-IGO, hojas",
      `ven_admin2 y ven_adminpoints, descargadas el ${fetchedAt}.`,
      `${rows.length} municipios bajo sus 24 entidades; las Dependencias Federales`,
      "no tienen municipio y quedan en su nivel 3.",
    ],
  });
}
