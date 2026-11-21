// Lógica pura del borrador del nivel 4 de Paraguay (D131). No descarga nada:
// recibe las hojas del COD-AB de HDX (fuente INE) y la lista de intendencias
// electas de la Justicia Electoral, y arma filas y SQL sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const PARAGUAY_PATH = "earth.south-america.paraguay";

/**
 * P-code de departamento → comunidad de nivel 3 que ya existe en la base
 * (0016). Asunción (PY00) no está: es un único distrito y su comunidad de
 * nivel 3 ya es su gobierno local.
 */
export const DEPARTMENTS = new Map([
  ["PY01", { slug: "paraguay-concepcion", name: "Concepción" }],
  ["PY02", { slug: "paraguay-san-pedro", name: "San Pedro" }],
  ["PY03", { slug: "paraguay-cordillera", name: "Cordillera" }],
  ["PY04", { slug: "paraguay-guaira", name: "Guairá" }],
  ["PY05", { slug: "paraguay-caaguazu", name: "Caaguazú" }],
  ["PY06", { slug: "paraguay-caazapa", name: "Caazapá" }],
  ["PY07", { slug: "paraguay-itapua", name: "Itapúa" }],
  ["PY08", { slug: "paraguay-misiones", name: "Misiones" }],
  ["PY09", { slug: "paraguay-paraguari", name: "Paraguarí" }],
  ["PY10", { slug: "paraguay-alto-parana", name: "Alto Paraná" }],
  ["PY11", { slug: "paraguay-central", name: "Central" }],
  ["PY12", { slug: "paraguay-neembucu", name: "Ñeembucú" }],
  ["PY13", { slug: "paraguay-amambay", name: "Amambay" }],
  ["PY14", { slug: "paraguay-canindeyu", name: "Canindeyú" }],
  ["PY15", { slug: "paraguay-presidente-hayes", name: "Presidente Hayes" }],
  ["PY16", { slug: "paraguay-boqueron", name: "Boquerón" }],
  ["PY17", { slug: "paraguay-alto-paraguay", name: "Alto Paraguay" }],
]);

const ASUNCION = "PY00";

/**
 * Mayúsculas que la fuente puso mal. Sólo eso: la grafía de cada nombre se
 * respeta tal como la publica el INE.
 */
const NAME_FIXES = new Map([
  ["R.i. 3 Corrales", "R.I. 3 Corrales"],
  ["Juan E. O'leary", "Juan E. O'Leary"],
]);

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * @typedef {{ adm1_pcode: string, adm2_pcode: string, adm2_name: string }} DistrictRecord
 * @typedef {{ admin_level: string, adm2_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/**
 * Una fila por distrito, con el punto que publica el mismo COD-AB. El slug
 * lleva el departamento porque hay homónimos (Bella Vista).
 *
 * @param {ReadonlyArray<DistrictRecord>} districts
 * @param {ReadonlyArray<PointRecord>} points
 * @returns {Level4Row[]}
 */
export function buildParaguayLevel4Rows(districts, points) {
  const pointOf = new Map(
    points
      .filter((item) => item.admin_level === "2")
      .map((item) => [item.adm2_pcode, item]),
  );
  const slugs = new Set();
  const rows = [];
  for (const district of districts) {
    if (district.adm1_pcode === ASUNCION) continue;
    const department = DEPARTMENTS.get(district.adm1_pcode);
    if (!department) {
      throw new Error(`Departamento desconocido: ${district.adm1_pcode}`);
    }
    const source = district.adm2_name.trim();
    if (!source) throw new Error(`Distrito sin nombre: ${district.adm2_pcode}`);
    const name = NAME_FIXES.get(source) ?? source;

    const located = pointOf.get(district.adm2_pcode);
    const lat = located ? coordinate(located.y_coord) : null;
    const lng = located ? coordinate(located.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Distrito sin punto: ${district.adm2_pcode} (${name})`);
    }

    const slug = `${department.slug}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: department.slug,
      path: `${PARAGUAY_PATH}.${department.slug}.${slug}`,
      description: `Distrito del departamento de ${department.name}`,
      lat,
      lng,
      code: district.adm2_pcode,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * Contrasta cada departamento con las intendencias electas por la Justicia
 * Electoral: un distrito nuevo o fusionado que la capa todavía no refleje
 * aparece como diferencia. Sólo se leen los códigos, no los datos de las
 * personas electas.
 *
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {ReadonlyArray<{ COD_DEPARTAMENTO: string, COD_DISTRITO: string }>} election
 * @returns {string[]}
 */
export function compareWithElection(rows, election) {
  /** @type {Map<string, number>} */
  const elected = new Map();
  for (const item of election) {
    const code = `PY${item.COD_DEPARTAMENTO.trim().padStart(2, "0")}`;
    if (code === ASUNCION) continue;
    elected.set(code, (elected.get(code) ?? 0) + 1);
  }
  /** @type {Map<string, number>} */
  const loaded = new Map();
  for (const row of rows) {
    const code = row.code.slice(0, 4);
    loaded.set(code, (loaded.get(code) ?? 0) + 1);
  }
  return [...new Set([...elected.keys(), ...loaded.keys()])]
    .sort()
    .filter((code) => elected.get(code) !== loaded.get(code))
    .map(
      (code) =>
        `${code}: ${loaded.get(code) ?? 0} distritos y ${elected.get(code) ?? 0} intendencias electas`,
    );
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderParaguayDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0079",
    title: "Distritos de Paraguay como nivel 4 (D131)",
    generator: "scripts/build-paraguay-level4-draft.mjs",
    countryPath: PARAGUAY_PATH,
    parentLabel: "DEPARTMENT",
    header: [
      "Va después de 0076 y de los borradores de Uruguay y Chile.",
      "",
      "Fuente: Paraguay - Subnational Administrative Boundaries (COD-AB) de HDX,",
      "con datos del INE de Paraguay, licencia CC BY-IGO, hojas pry_admin2 y",
      `pry_adminpoints, descargadas el ${fetchedAt}. ${rows.length} distritos bajo sus 17`,
      "departamentos; Asunción ya es su propio distrito y queda en nivel 3.",
      "Contrastado por departamento con las intendencias electas en 2026 que",
      "publica la Justicia Electoral (TSJE).",
    ],
  });
}
