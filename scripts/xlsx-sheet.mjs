// Lector mínimo de XLSX sin dependencias, para los generadores de nivel 4 que
// leen planillas oficiales (COD-AB de HDX, listas electorales). Sólo texto y
// números de celda: sin fórmulas, estilos ni fechas.
import { readZipEntry } from "./zip-entry.mjs";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** @param {string} text */
function decodeXml(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1] === "x" || entity[1] === "X";
      return String.fromCodePoint(
        parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10),
      );
    }
    return ENTITIES[/** @type {keyof typeof ENTITIES} */ (entity)] ?? whole;
  });
}

/** Texto de un nodo con uno o varios <t> (texto plano o con formato). */
function textOf(/** @type {string} */ xml) {
  return decodeXml(
    [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((match) => match[1])
      .join(""),
  ).trim();
}

/**
 * Ruta dentro del zip de la hoja que se llama `name`. El número de archivo no
 * sigue el orden de las pestañas, así que se resuelve por las relaciones.
 *
 * @param {string} workbookXml
 * @param {string} relsXml
 * @param {string} name
 */
export function sheetPath(workbookXml, relsXml, name) {
  const sheet = [...workbookXml.matchAll(/<sheet\s[^>]*>/g)]
    .map((match) => match[0])
    .find((tag) => tag.includes(`name="${name}"`));
  const id = sheet?.match(/r:id="([^"]+)"/)?.[1];
  const target = id
    ? [...relsXml.matchAll(/<Relationship\s[^>]*>/g)]
        .map((match) => match[0])
        .find((tag) => tag.includes(`Id="${id}"`))
        ?.match(/Target="([^"]+)"/)?.[1]
    : undefined;
  if (!target) throw new Error(`El libro no trae la hoja ${name}`);
  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

/**
 * Filas de una hoja de XLSX como objetos, con la primera fila de encabezado.
 * `skipRows` saltea filas de título que algunas planillas oficiales ponen
 * antes del encabezado (la Relación de municipios del INE trae una).
 *
 * @param {string} sharedStringsXml
 * @param {string} sheetXml
 * @param {{ skipRows?: number }} [options]
 * @returns {Record<string, string>[]}
 */
export function parseXlsxSheet(sharedStringsXml, sheetXml, options = {}) {
  const shared = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    (match) => textOf(match[1]),
  );
  const rows = [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(
    (row) => {
      /** @type {Map<string, string>} */
      const cells = new Map();
      for (const cell of row[1].matchAll(
        /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const [, column, attributes, body = ""] = cell;
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = "";
        if (attributes.includes('t="s"') && raw !== undefined) {
          value = shared[Number(raw)] ?? "";
        } else if (attributes.includes('t="inlineStr"')) {
          value = textOf(body);
        } else if (raw !== undefined) {
          value = decodeXml(raw).trim();
        }
        cells.set(column, value);
      }
      return cells;
    },
  );

  const [header, ...body] = rows.slice(options.skipRows ?? 0);
  if (!header) return [];
  const columns = [...header].filter(([, key]) => key);
  return body
    .filter((cells) => [...cells.values()].some(Boolean))
    .map((cells) =>
      Object.fromEntries(
        columns.map(([column, key]) => [key, cells.get(column) ?? ""]),
      ),
    );
}

/**
 * Hoja de un XLSX por nombre; sin nombre, la primera.
 * @param {Buffer} book @param {string | null} name
 * @param {{ skipRows?: number }} [options]
 */
export function readXlsxSheet(book, name, options = {}) {
  const workbook = readZipEntry(book, "xl/workbook.xml").toString();
  const rels = readZipEntry(book, "xl/_rels/workbook.xml.rels").toString();
  const sheetName = name ?? workbook.match(/<sheet\s[^>]*name="([^"]+)"/)?.[1];
  if (!sheetName) throw new Error("El libro no tiene hojas");
  const shared = readZipEntry(book, "xl/sharedStrings.xml").toString();
  const sheet = readZipEntry(
    book,
    sheetPath(workbook, rels, sheetName),
  ).toString();
  return parseXlsxSheet(shared, sheet, options);
}
