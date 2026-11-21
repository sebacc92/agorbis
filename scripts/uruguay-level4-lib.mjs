// Lógica pura del borrador del nivel 4 de Uruguay (D129), el país piloto fuera
// de Argentina. No descarga nada: recibe las filas del plan circuital de la
// Corte Electoral y arma filas y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const URUGUAY_PATH = "earth.south-america.uruguay";

/** Valor con el que la Corte Electoral marca el territorio no municipalizado. */
const OUTSIDE_ANY_MUNICIPALITY = "SIN MUNICIPIO";

/**
 * Código de departamento de la Corte Electoral → comunidad de nivel 3 que ya
 * existe en la base (0016).
 */
export const DEPARTMENTS = new Map([
  ["AR", { slug: "uruguay-artigas", name: "Artigas" }],
  ["CA", { slug: "uruguay-canelones", name: "Canelones" }],
  ["CL", { slug: "uruguay-cerro-largo", name: "Cerro Largo" }],
  ["CO", { slug: "uruguay-colonia", name: "Colonia" }],
  ["DU", { slug: "uruguay-durazno", name: "Durazno" }],
  ["FD", { slug: "uruguay-florida", name: "Florida" }],
  ["FS", { slug: "uruguay-flores", name: "Flores" }],
  ["LA", { slug: "uruguay-lavalleja", name: "Lavalleja" }],
  ["MA", { slug: "uruguay-maldonado", name: "Maldonado" }],
  ["MO", { slug: "uruguay-montevideo", name: "Montevideo" }],
  ["PA", { slug: "uruguay-paysandu", name: "Paysandú" }],
  ["RN", { slug: "uruguay-rio-negro", name: "Río Negro" }],
  ["RO", { slug: "uruguay-rocha", name: "Rocha" }],
  ["RV", { slug: "uruguay-rivera", name: "Rivera" }],
  ["SA", { slug: "uruguay-salto", name: "Salto" }],
  ["SJ", { slug: "uruguay-san-jose", name: "San José" }],
  ["SO", { slug: "uruguay-soriano", name: "Soriano" }],
  ["TA", { slug: "uruguay-tacuarembo", name: "Tacuarembó" }],
  ["TT", { slug: "uruguay-treinta-y-tres", name: "Treinta y Tres" }],
]);

// Van en minúscula salvo al principio: "Paso de los Toros", "Del Andaluz".
const PARTICLES = new Set(["de", "del", "el", "la", "las", "los", "y"]);

/** @param {string} text */
function titleCase(text) {
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

const DEPARTMENT_SLUGS = new Set(
  [...DEPARTMENTS.values()].map((department) => slugify(department.name)),
);

/**
 * Nombre visible de un municipio. La Corte Electoral los escribe en mayúsculas
 * con su letra adelante ("A - PASO DE LOS TOROS"); en Montevideo la letra es
 * el nombre oficial ("Municipio CH"). Un paréntesis que nombra un departamento
 * sólo desambigua en una lista nacional y se quita: el buscador ya muestra el
 * departamento como contenedor.
 *
 * @param {string} departmentCode
 * @param {string} raw
 * @returns {string}
 */
export function municipalityName(departmentCode, raw) {
  const value = raw.trim();
  if (departmentCode === "MO") return `Municipio ${value}`;

  const match = /^([A-ZÑ]{1,2}) - (.+)$/u.exec(value);
  if (!match) {
    throw new Error(`Municipio sin letra en ${departmentCode}: ${value}`);
  }
  const name = match[2].replace(/\s*\(([^)]+)\)\s*$/u, (whole, inner) =>
    DEPARTMENT_SLUGS.has(slugify(inner)) ? "" : whole,
  );
  return titleCase(name);
}

/**
 * @typedef {{ Departamento: string, Municipio: string }} CircuitRow
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio. El plan circuital trae una fila por circuito, así
 * que cada municipio aparece muchas veces; el territorio sin municipio queda
 * en su departamento (D129).
 *
 * @param {ReadonlyArray<CircuitRow>} circuits
 * @returns {Level4Row[]}
 */
export function buildUruguayLevel4Rows(circuits) {
  const byCode = new Map();
  for (const circuit of circuits) {
    const departmentCode = circuit.Departamento.trim();
    const department = DEPARTMENTS.get(departmentCode);
    if (!department) {
      throw new Error(`Departamento desconocido: ${departmentCode}`);
    }
    const raw = circuit.Municipio.trim();
    if (!raw) {
      throw new Error(`Circuito sin municipio en ${departmentCode}`);
    }
    if (raw === OUTSIDE_ANY_MUNICIPALITY) continue;

    const letter = departmentCode === "MO" ? raw : raw.split(" - ")[0];
    const code = `${departmentCode}:${letter}`;
    if (byCode.has(code)) continue;

    const name = municipalityName(departmentCode, raw);
    const slug = `${department.slug}-${slugify(name)}`;
    byCode.set(code, {
      slug,
      name,
      parentSlug: department.slug,
      path: `${URUGUAY_PATH}.${department.slug}.${slug}`,
      description: `Municipio del departamento de ${department.name}`,
      code,
    });
  }

  const rows = [...byCode.values()];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.slug)) throw new Error(`Slug repetido: ${row.slug}`);
    seen.add(row.slug);
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * CSV con comillas dobles (RFC 4180): la columna del local de votación trae
 * comas adentro.
 *
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  /** @type {string[][]} */
  const records = [];
  let field = "";
  let record = [];
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }

  const [header = [], ...body] = records.filter(
    (row) => row.length > 1 || row[0] !== "",
  );
  const keys = header.map((key) => key.trim());
  return body.map((row) => {
    if (row.length !== keys.length) {
      throw new Error(
        `Fila con ${row.length} columnas, se esperaban ${keys.length}`,
      );
    }
    return Object.fromEntries(keys.map((key, index) => [key, row[index]]));
  });
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderUruguayDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0077",
    title: "Municipios de Uruguay como nivel 4 (D129)",
    generator: "scripts/build-uruguay-level4-draft.mjs",
    countryPath: URUGUAY_PATH,
    parentLabel: "DEPARTMENT",
    header: [
      "Va después de 0076.",
      "",
      "Fuente: plan circuital de las Elecciones Departamentales y Municipales 2025,",
      "Corte Electoral (catalogodatos.gub.uy, Licencia de Datos Abiertos de AGESIC),",
      `descargado el ${fetchedAt}. ${rows.length} municipios bajo sus 19 departamentos.`,
      "El territorio sin municipio queda en el departamento, que es su gobierno",
      "local (la Intendencia).",
      "",
      "Sin coordenadas: la fuente no las trae y la detección por GPS del",
      "onboarding ignora las comunidades sin lat/lng, así que sugiere el",
      "departamento en vez de un municipio equivocado.",
    ],
  });
}
