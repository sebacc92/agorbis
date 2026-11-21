// Lógica pura del borrador del nivel 4 de Ecuador (D133). No descarga nada:
// recibe la hoja ecu_admgz_adm2 del COD-AB de HDX (fuente INEC) y arma filas
// y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const ECUADOR_PATH = "earth.south-america.ecuador";

/**
 * P-code de provincia → comunidad de nivel 3 que ya existe en la base (0016).
 * El nombre se compara con el de cada fila para que un código mal asignado
 * falle en vez de colgar cantones de la provincia equivocada.
 */
export const PROVINCES = new Map(
  [
    ["EC01", "Azuay"],
    ["EC02", "Bolívar"],
    ["EC03", "Cañar"],
    ["EC04", "Carchi"],
    ["EC05", "Cotopaxi"],
    ["EC06", "Chimborazo"],
    ["EC07", "El Oro"],
    ["EC08", "Esmeraldas"],
    ["EC09", "Guayas"],
    ["EC10", "Imbabura"],
    ["EC11", "Loja"],
    ["EC12", "Los Ríos"],
    ["EC13", "Manabí"],
    ["EC14", "Morona Santiago"],
    ["EC15", "Napo"],
    ["EC16", "Pastaza"],
    ["EC17", "Pichincha"],
    ["EC18", "Tungurahua"],
    ["EC19", "Zamora Chinchipe"],
    ["EC20", "Galápagos"],
    ["EC21", "Sucumbíos"],
    ["EC22", "Orellana"],
    ["EC23", "Santo Domingo de los Tsáchilas"],
    ["EC24", "Santa Elena"],
  ].map(([code, name]) => [code, { slug: `ecuador-${slugify(name)}`, name }]),
);

/**
 * Territorio que el INEC publica fuera de toda provincia: una isla y una zona
 * en estudio entre Cañar y Chimborazo. No tienen cantón, así que no van.
 */
const OUTSIDE_ANY_CANTON = new Set(["ECISLA", "ECNO APLICA"]);

/** Mayúsculas que la fuente puso mal. La grafía del INEC se respeta. */
const NAME_FIXES = new Map([
  ["Camilo Ponce enríquez", "Camilo Ponce Enríquez"],
]);

/**
 * @typedef {{ ADM1_PCODE: string, ADM1_ES: string, ADM2_PCODE: string, ADM2_ES: string }} CantonRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por cantón, cada uno con su GAD municipal. Sin coordenadas: la
 * capa no trae puntos y el GPS del onboarding sugiere la provincia. El slug
 * lleva la provincia porque hay homónimos (Bolívar y Olmedo, cada uno en dos provincias).
 *
 * @param {ReadonlyArray<CantonRecord>} cantons
 * @returns {Level4Row[]}
 */
export function buildEcuadorLevel4Rows(cantons) {
  const slugs = new Set();
  const rows = [];
  for (const record of cantons) {
    const code = record.ADM1_PCODE.trim();
    if (OUTSIDE_ANY_CANTON.has(code)) continue;
    const province = PROVINCES.get(code);
    if (!province) throw new Error(`Provincia desconocida: ${code}`);
    if (record.ADM1_ES.trim() !== province.name) {
      throw new Error(`La provincia ${code} no coincide: ${record.ADM1_ES}`);
    }
    const source = record.ADM2_ES.trim().replace(/\s+/g, " ");
    if (!source) throw new Error(`Cantón sin nombre: ${record.ADM2_PCODE}`);
    const name = NAME_FIXES.get(source) ?? source;

    const slug = `${province.slug}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: province.slug,
      path: `${ECUADOR_PATH}.${province.slug}.${slug}`,
      description: `Cantón de la provincia de ${province.name}`,
      code: record.ADM2_PCODE,
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderEcuadorDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0081",
    title: "Cantones de Ecuador como nivel 4 (D133)",
    generator: "scripts/build-ecuador-level4-draft.mjs",
    countryPath: ECUADOR_PATH,
    parentLabel: "PROVINCE",
    header: [
      "Va después de 0076 y de los borradores de Uruguay, Chile, Paraguay y Bolivia.",
      "",
      "Fuente: Ecuador - Subnational Administrative Boundaries (COD-AB) de HDX,",
      "con datos del INEC, licencia CC BY-IGO, hoja ecu_admgz_adm2, descargada",
      `el ${fetchedAt}. ${rows.length} cantones bajo sus 24 provincias; quedan afuera la`,
      "isla y la zona en estudio que el INEC publica sin cantón.",
      "",
      "Sin coordenadas: la capa no trae puntos y el GPS del onboarding sugiere",
      "la provincia.",
    ],
  });
}
