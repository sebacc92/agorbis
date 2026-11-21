// Lógica pura del borrador del nivel 4 de Colombia (D135). No descarga nada:
// recibe la DIVIPOLA del DANE (qué unidades hay y de qué tipo) y los nombres
// del COD-AB de HDX por código, y arma filas y SQL sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const COLOMBIA_PATH = "earth.south-america.colombia";

/**
 * Código DANE de departamento → comunidad de nivel 3 que ya existe en la base
 * (0016). Bogotá (11) no está: es un único distrito y su comunidad de nivel 3
 * ya es su gobierno local.
 */
export const DEPARTMENTS = new Map(
  [
    ["05", "Antioquia"],
    ["08", "Atlántico"],
    ["13", "Bolívar"],
    ["15", "Boyacá"],
    ["17", "Caldas"],
    ["18", "Caquetá"],
    ["19", "Cauca"],
    ["20", "Cesar"],
    ["23", "Córdoba"],
    ["25", "Cundinamarca"],
    ["27", "Chocó"],
    ["41", "Huila"],
    ["44", "La Guajira"],
    ["47", "Magdalena"],
    ["50", "Meta"],
    ["52", "Nariño"],
    ["54", "Norte de Santander"],
    ["63", "Quindío"],
    ["66", "Risaralda"],
    ["68", "Santander"],
    ["70", "Sucre"],
    ["73", "Tolima"],
    ["76", "Valle del Cauca"],
    ["81", "Arauca"],
    ["85", "Casanare"],
    ["86", "Putumayo"],
    ["88", "Archipiélago de San Andrés, Providencia y Santa Catalina"],
    ["91", "Amazonas"],
    ["94", "Guainía"],
    ["95", "Guaviare"],
    ["97", "Vaupés"],
    ["99", "Vichada"],
  ].map(([code, name]) => [code, { slug: `colombia-${slugify(name)}`, name }]),
);

const BOGOTA = "11";

/**
 * Tipos de la DIVIPOLA. Sólo el municipio tiene gobierno municipal; la isla
 * de San Andrés y las áreas no municipalizadas las gobierna el departamento
 * y quedan en él, como el territorio sin municipio de Uruguay (D129).
 */
const MUNICIPALITY = "Municipio";
const WITHOUT_MUNICIPALITY = new Set(["Isla", "Área no municipalizada"]);

/** Sin tildes, en minúscula y con un solo espacio: para comparar grafías. */
function fold(/** @type {string} */ text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Van en minúscula salvo al principio: "Nuevo Belén de Bajirá".
const PARTICLES = new Set(["de", "del", "el", "la", "las", "los", "y"]);

/** La DIVIPOLA escribe en mayúsculas; esto deja mayúscula inicial. */
function titleCase(/** @type {string} */ text) {
  return text
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) =>
      index > 0 && PARTICLES.has(word)
        ? word
        : word.charAt(0).toLocaleUpperCase("es") + word.slice(1),
    )
    .join(" ");
}

/**
 * @typedef {{ cod_dpto: string, dpto: string, cod_mpio: string, nom_mpio: string, tipo_municipio: string }} DivipolaRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string, nameSource: "COD-AB" | "DIVIPOLA",
 * }} Level4Row
 */

/**
 * Una fila por municipio de la DIVIPOLA, con el nombre del COD-AB cuando el
 * código existe ahí (bien escrito) y, si no, el de la DIVIPOLA. Sin
 * coordenadas. El slug lleva el departamento porque hay homónimos.
 *
 * @param {ReadonlyArray<DivipolaRecord>} records
 * @param {ReadonlyMap<string, string>} codAbNames código DANE → nombre
 * @returns {Level4Row[]}
 */
export function buildColombiaLevel4Rows(records, codAbNames) {
  const slugs = new Set();
  const rows = [];
  for (const record of records) {
    const kind = record.tipo_municipio.trim();
    if (WITHOUT_MUNICIPALITY.has(kind)) continue;
    if (kind !== MUNICIPALITY) {
      throw new Error(
        `Tipo de unidad desconocido: ${kind} (${record.cod_mpio})`,
      );
    }
    const departmentCode = record.cod_dpto.trim();
    if (departmentCode === BOGOTA) continue;
    const department = DEPARTMENTS.get(departmentCode);
    if (!department) {
      throw new Error(`Departamento desconocido: ${departmentCode}`);
    }
    if (fold(record.dpto) !== fold(department.name)) {
      throw new Error(
        `El departamento ${departmentCode} no coincide: ${record.dpto}`,
      );
    }

    const code = record.cod_mpio.trim();
    const fromCodAb = codAbNames.get(code);
    const name = fromCodAb ?? titleCase(record.nom_mpio);
    const slug = `${department.slug}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: department.slug,
      path: `${COLOMBIA_PATH}.${department.slug}.${slug}`,
      description: `Municipio del departamento de ${department.name}`,
      code,
      nameSource: /** @type {const} */ (fromCodAb ? "COD-AB" : "DIVIPOLA"),
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderColombiaDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0083",
    title: "Municipios de Colombia como nivel 4 (D135)",
    generator: "scripts/build-colombia-level4-draft.mjs",
    countryPath: COLOMBIA_PATH,
    parentLabel: "DEPARTMENT",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Perú.",
      "",
      "Lista: DIVIPOLA - Códigos municipios del DANE (datos.gov.co, gdxc-w37w,",
      `licencia CC BY-SA 4.0), descargada el ${fetchedAt}. Nombres: COD-AB de`,
      "Colombia en HDX (DANE, CC BY-IGO), por código; sin código ahí, el de la",
      "DIVIPOLA con mayúscula inicial.",
      "",
      `${rows.length} municipios bajo sus 32 departamentos. Bogotá, la isla de San`,
      "Andrés y las áreas no municipalizadas quedan en su nivel 3. Sin",
      "coordenadas: el GPS del onboarding sugiere el departamento.",
    ],
  });
}
