// Lógica pura común a los borradores de nivel 4 que salen de un COD-AB de HDX
// con hoja admin2 y hoja de puntos (D140, D141). Venezuela y Guatemala
// repetían esta forma; los países nuevos la toman de acá con su configuración
// (cod-ab-level4-countries.mjs). No descarga nada.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";
import { accentedName } from "./peru-level4-lib.mjs";

/**
 * @typedef {{ pcode: string, name: string, slug: string, aliases?: ReadonlyArray<string> }} ParentConfig
 * @typedef {{
 *   key: string, slugPrefix: string, number: string, decision: string,
 *   title: string, countryPath: string, parentLabel: string,
 *   parents: ReadonlyArray<ParentConfig>, exclude?: ReadonlyArray<string>,
 *   describe: (parentName: string) => string, header: ReadonlyArray<string>,
 *   accentsByParent?: boolean,
 * }} CountryConfig
 * @typedef {{ adm1_pcode: string, adm1_name: string, adm2_pcode: string, adm2_name: string }} UnitRecord
 * @typedef {{ admin_level: string, adm2_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{ name: string, parents: ReadonlyArray<string> }} AccentCandidate
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/** Sin tildes, en minúscula y con un solo espacio: para comparar grafías. */
function fold(/** @type {string} */ text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Nombre de una unidad sin "Departamento de", "Provincia de" y similares. */
function bare(/** @type {string} */ label) {
  return label
    .trim()
    .replace(/^(departamento|provincia|regi[oó]n|estado)( del?)?\s+/i, "");
}

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * Una fila por unidad de nivel 2 del COD-AB, con su punto. El padre se busca
 * por el slug que tiene en 0016 (a veces en inglés o mal escrito), pero el
 * slug nuevo usa el nombre correcto para no heredar el error, como en Brasil
 * (D137). Si vienen candidatos de tildes (Wikidata), se aplican sólo cuando la
 * única diferencia son tildes o mayúsculas, como en Perú (D134).
 *
 * @param {CountryConfig} config
 * @param {{
 *   units: ReadonlyArray<UnitRecord>,
 *   points: ReadonlyArray<PointRecord>,
 *   accents?: ReadonlyArray<AccentCandidate>,
 * }} input
 * @returns {Level4Row[]}
 */
export function buildCodAbLevel4Rows(config, { units, points, accents = [] }) {
  const parents = new Map(config.parents.map((p) => [p.pcode, p]));
  const excluded = new Set(config.exclude ?? []);
  const pointOf = new Map(
    points
      .filter((item) => item.admin_level === "2")
      .map((item) => [item.adm2_pcode, item]),
  );

  const slugs = new Set();
  const rows = [];
  for (const record of units) {
    if (excluded.has(record.adm2_pcode)) continue;
    const parent = parents.get(record.adm1_pcode);
    if (!parent) throw new Error(`Padre desconocido: ${record.adm1_pcode}`);
    // El COD-AB puede nombrar al padre en otro idioma (Haití: "West" por
    // "Ouest"); los alias lo reconocen y la fila usa el nombre correcto.
    const parentNames = [parent.name, ...(parent.aliases ?? [])].map(fold);
    if (!parentNames.includes(fold(record.adm1_name))) {
      throw new Error(
        `El padre ${record.adm1_pcode} no coincide: ${record.adm1_name}`,
      );
    }
    const source = record.adm2_name.trim().replace(/\s+/g, " ");
    if (!source) throw new Error(`Unidad sin nombre: ${record.adm2_pcode}`);
    // Por padre, salvo que el país no tenga homónimos y Wikidata cuelgue las
    // unidades de otro nivel (Haití: de los arrondissements).
    const sameParent = accents
      .filter(
        (item) =>
          config.accentsByParent === false ||
          item.parents.some((p) => fold(bare(p)) === fold(parent.name)),
      )
      .map((item) => item.name);
    const name = accentedName(source, sameParent);

    const located = pointOf.get(record.adm2_pcode);
    const lat = located ? coordinate(located.y_coord) : null;
    const lng = located ? coordinate(located.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Unidad sin punto: ${record.adm2_pcode} (${name})`);
    }

    const slug = `${config.slugPrefix}-${slugify(parent.name)}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: parent.slug,
      path: `${config.countryPath}.${parent.slug}.${slug}`,
      description: config.describe(parent.name),
      lat,
      lng,
      code: record.adm2_pcode,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {CountryConfig} config
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderCodAbDraftSql(config, rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: config.number,
    title: `${config.title} (${config.decision})`,
    generator: `scripts/build-cod-ab-level4-draft.mjs ${config.key}`,
    countryPath: config.countryPath,
    parentLabel: config.parentLabel,
    header: [
      ...config.header,
      `Descargado el ${fetchedAt}. ${rows.length} unidades, con un punto cada una.`,
    ],
  });
}
