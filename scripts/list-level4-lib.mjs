// Lógica pura común a los borradores de nivel 4 que salen de una lista de
// unidades con el nombre de su padre (D142–D144): Wikidata en El Salvador y
// Nicaragua, el servicio de distritos de la ANATI en Panamá. El generador
// trae la lista; esto la valida y arma filas y SQL sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

/**
 * @typedef {{ name: string, slug: string, of: string, aliases?: ReadonlyArray<string> }} ListParent
 * @typedef {{
 *   key: string, slugPrefix: string, number: string, decision: string,
 *   title: string, countryPath: string, parentLabel: string, unit: string,
 *   parents: ReadonlyArray<ListParent>, exclude?: ReadonlyArray<string>,
 *   header: ReadonlyArray<string>,
 * }} ListConfig
 * @typedef {{ code: string, name: string, parent: string, lat?: number, lng?: number }} ListItem
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string, lat?: number, lng?: number,
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

/** Nombre sin "Departamento de", "Provincia de" y similares. */
function bare(/** @type {string} */ label) {
  return label.trim().replace(/^(departamento|provincia)( del?)?\s+/i, "");
}

/**
 * Una fila por unidad de la lista. El padre se reconoce por su nombre, con o
 * sin prefijo, o por un alias; el slug del padre es el de 0016 y el de cada
 * unidad usa el nombre correcto del padre, como en Brasil (D137). Las
 * coordenadas van sólo si la fuente las trae.
 *
 * @param {ListConfig} config
 * @param {ReadonlyArray<ListItem>} items
 * @returns {Level4Row[]}
 */
export function buildListLevel4Rows(config, items) {
  /** @type {Map<string, ListParent>} */
  const byName = new Map();
  for (const parent of config.parents) {
    for (const label of [parent.name, ...(parent.aliases ?? [])]) {
      byName.set(fold(label), parent);
    }
  }
  const excluded = new Set(config.exclude ?? []);

  const slugs = new Set();
  const rows = [];
  for (const item of items) {
    if (excluded.has(item.code)) continue;
    if (!item.parent.trim()) throw new Error(`Unidad sin padre: ${item.code}`);
    const parent =
      byName.get(fold(item.parent)) ?? byName.get(fold(bare(item.parent)));
    if (!parent) {
      throw new Error(`Padre desconocido: ${item.parent} (${item.code})`);
    }
    const name = item.name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error(`Unidad sin nombre: ${item.code}`);

    const slug = `${config.slugPrefix}-${slugify(parent.name)}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: parent.slug,
      path: `${config.countryPath}.${parent.slug}.${slug}`,
      description: `${config.unit} ${parent.of}`,
      ...(typeof item.lat === "number" && typeof item.lng === "number"
        ? { lat: item.lat, lng: item.lng }
        : {}),
      code: item.code,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ListConfig} config
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderListDraftSql(config, rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: config.number,
    title: `${config.title} (${config.decision})`,
    generator: `scripts/build-list-level4-draft.mjs ${config.key}`,
    countryPath: config.countryPath,
    parentLabel: config.parentLabel,
    header: [
      ...config.header,
      `Consultado el ${fetchedAt}. ${rows.length} unidades.`,
    ],
  });
}
