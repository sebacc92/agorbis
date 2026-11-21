// Lógica pura del borrador del nivel 4 de Chile (D130). No descarga nada:
// recibe la tabla de atributos de la capa COMUNAS de la DPA 2023 y arma filas
// y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const CHILE_PATH = "earth.south-america.chile";

/**
 * Código Único Territorial de región → comunidad de nivel 3 que ya existe en
 * la base (0016). El nombre es el oficial; el de 0016 abrevia el de Aysén.
 */
export const REGIONS = new Map([
  ["01", { slug: "chile-region-de-tarapaca", name: "Región de Tarapacá" }],
  [
    "02",
    { slug: "chile-region-de-antofagasta", name: "Región de Antofagasta" },
  ],
  ["03", { slug: "chile-region-de-atacama", name: "Región de Atacama" }],
  ["04", { slug: "chile-region-de-coquimbo", name: "Región de Coquimbo" }],
  ["05", { slug: "chile-region-de-valparaiso", name: "Región de Valparaíso" }],
  [
    "06",
    {
      slug: "chile-region-del-libertador-bernardo-o-higgins",
      name: "Región del Libertador General Bernardo O'Higgins",
    },
  ],
  ["07", { slug: "chile-region-del-maule", name: "Región del Maule" }],
  ["08", { slug: "chile-region-del-bio-bio", name: "Región del Biobío" }],
  [
    "09",
    { slug: "chile-region-de-la-araucania", name: "Región de La Araucanía" },
  ],
  ["10", { slug: "chile-region-de-los-lagos", name: "Región de Los Lagos" }],
  [
    "11",
    {
      slug: "chile-region-de-aysen-del-gral-ibanez-del-campo",
      name: "Región de Aysén del General Carlos Ibáñez del Campo",
    },
  ],
  [
    "12",
    {
      slug: "chile-region-de-magallanes-y-antartica-chilena",
      name: "Región de Magallanes y de la Antártica Chilena",
    },
  ],
  [
    "13",
    {
      slug: "chile-region-metropolitana-de-santiago",
      name: "Región Metropolitana de Santiago",
    },
  ],
  ["14", { slug: "chile-region-de-los-rios", name: "Región de Los Ríos" }],
  [
    "15",
    {
      slug: "chile-region-de-arica-y-parinacota",
      name: "Región de Arica y Parinacota",
    },
  ],
  ["16", { slug: "chile-region-de-nuble", name: "Región de Ñuble" }],
]);

/**
 * Tabla de atributos de un .dbf (dBase III) con campos de texto. La capa
 * declara UTF-8 en su .cpg.
 *
 * @param {Uint8Array} bytes
 * @returns {Record<string, string>[]}
 */
export function parseDbf(bytes) {
  if (bytes.length < 32 || (bytes[0] & 0x07) !== 0x03) {
    throw new Error("El archivo no es un dBase III");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  const decoder = new TextDecoder("utf-8", { fatal: true });

  /** @type {{ name: string, size: number }[]} */
  const fields = [];
  for (let at = 32; bytes[at] !== 0x0d; at += 32) {
    if (at + 32 > headerLength) throw new Error("Cabecera dBase sin cierre");
    const raw = bytes.subarray(at, at + 11);
    const end = raw.indexOf(0);
    fields.push({
      name: decoder.decode(end === -1 ? raw : raw.subarray(0, end)),
      size: bytes[at + 16],
    });
  }

  const records = [];
  for (let row = 0; row < count; row += 1) {
    let at = headerLength + row * recordLength;
    // 0x2A marca un registro borrado que el archivo todavía arrastra.
    if (bytes[at] === 0x2a) continue;
    at += 1;
    /** @type {Record<string, string>} */
    const record = {};
    for (const field of fields) {
      record[field.name] = decoder
        .decode(bytes.subarray(at, at + field.size))
        .trim();
      at += field.size;
    }
    records.push(record);
  }
  return records;
}

/**
 * @typedef {{ CUT_REG: string, CUT_COM: string, COMUNA: string }} ComunaRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por comuna. El slug no lleva la región porque en Chile no hay dos
 * comunas con el mismo nombre; si apareciera una, falla en vez de adivinar.
 *
 * @param {ReadonlyArray<ComunaRecord>} records
 * @returns {Level4Row[]}
 */
export function buildChileLevel4Rows(records) {
  const codes = new Set();
  const slugs = new Set();
  const rows = records.map((record) => {
    const region = REGIONS.get(record.CUT_REG.trim());
    if (!region) throw new Error(`Región desconocida: ${record.CUT_REG}`);
    const code = record.CUT_COM.trim();
    const name = record.COMUNA.trim();
    if (!name) throw new Error(`Comuna sin nombre: ${code}`);
    if (codes.has(code)) throw new Error(`Código repetido: ${code}`);
    codes.add(code);

    const slug = `chile-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    return {
      slug,
      name,
      parentSlug: region.slug,
      path: `${CHILE_PATH}.${region.slug}.${slug}`,
      description: `Comuna de la ${region.name}`,
      code,
    };
  });
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderChileDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0078",
    title: "Comunas de Chile como nivel 4 (D130)",
    generator: "scripts/build-chile-level4-draft.mjs",
    countryPath: CHILE_PATH,
    parentLabel: "REGION",
    header: [
      "Va después de 0076 y del borrador de Uruguay.",
      "",
      "Fuente: capa COMUNAS de la DPA 2023 (División Político Administrativa) de",
      "SUBDERE, IGM, DIFROL e INE, descargada del geoportal de la IDE Chile el",
      `${fetchedAt}. ${rows.length} comunas bajo sus 16 regiones; la capa no incluye la`,
      "comuna Antártica, que no tiene municipalidad propia.",
      "",
      "Sólo se usan nombres y códigos: nada derivado de los polígonos, porque la",
      "documentación pide validar con la DIFROL los productos derivados de la",
      "cartografía. Sin coordenadas, el GPS del onboarding sugiere la región.",
    ],
  });
}
