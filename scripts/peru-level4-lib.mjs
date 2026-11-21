// Lógica pura del borrador del nivel 4 de Perú (D134). No descarga nada:
// recibe las hojas del COD-AB de HDX (fuente IGN) y, para las tildes, las
// etiquetas de Wikidata, y arma filas y SQL sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const PERU_PATH = "earth.south-america.peru";

/**
 * P-code de departamento → comunidad de nivel 3 que ya existe en la base
 * (0016). El Callao y la provincia de Lima ya son nivel 3 y son ellos mismos
 * gobiernos provinciales: debajo van sus distritos, no la provincia.
 */
export const REGIONS = new Map(
  [
    ["PE01", "Amazonas"],
    ["PE02", "Áncash", "peru-ancash"],
    ["PE03", "Apurímac"],
    ["PE04", "Arequipa"],
    ["PE05", "Ayacucho"],
    ["PE06", "Cajamarca"],
    ["PE07", "Callao", "peru-el-callao"],
    ["PE08", "Cusco"],
    ["PE09", "Huancavelica"],
    ["PE10", "Huánuco"],
    ["PE11", "Ica"],
    ["PE12", "Junín"],
    ["PE13", "La Libertad"],
    ["PE14", "Lambayeque"],
    ["PE15", "Lima"],
    ["PE16", "Loreto"],
    ["PE17", "Madre de Dios"],
    ["PE18", "Moquegua"],
    ["PE19", "Pasco"],
    ["PE20", "Piura"],
    ["PE21", "Puno"],
    ["PE22", "San Martín"],
    ["PE23", "Tacna"],
    ["PE24", "Tumbes"],
    ["PE25", "Ucayali"],
  ].map(([code, name, slug]) => [
    code,
    { slug: slug ?? `peru-${slugify(name)}`, name },
  ]),
);

/** Provincias que ya son nivel 3: sus distritos van como nivel 4. */
const PROVINCES_AS_LEVEL3 = new Map([
  [
    "PE0701",
    {
      slug: "peru-el-callao",
      description: "Distrito de la Provincia Constitucional del Callao",
    },
  ],
  [
    "PE1501",
    {
      slug: "peru-municipalidad-metropolitana-de-lima",
      description: "Distrito de Lima Metropolitana",
    },
  ],
]);

/** Sin tildes, en minúscula y con un solo espacio: para comparar grafías. */
function fold(/** @type {string} */ text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const UNIT_PREFIX =
  /^(departamento|regi[oó]n|provincia|distrito)( constitucional)?( del?)?\s+/i;

/** Nombre de una unidad sin "Provincia de", "Departamento de" y similares. */
function bare(/** @type {string} */ label) {
  return label.trim().replace(UNIT_PREFIX, "");
}

/**
 * El nombre del IGN con las tildes del primer candidato que sólo difiere en
 * tildes o mayúsculas. Si el candidato cambia una palabra o un espacio, se
 * queda el del IGN: Wikidata aporta grafía, no nombres.
 *
 * @param {string} ignName
 * @param {ReadonlyArray<string>} candidates
 * @returns {string}
 */
export function accentedName(ignName, candidates) {
  const target = fold(ignName);
  const match = candidates.map(bare).find((name) => fold(name) === target);
  return match ?? ignName.trim().replace(/\s+/g, " ");
}

/**
 * @typedef {{ name: string, parents: ReadonlyArray<string> }} AccentCandidate
 * @typedef {{ adm1_pcode: string, adm1_name: string, adm2_pcode: string, adm2_name: string }} ProvinceRecord
 * @typedef {{ adm2_pcode: string, adm3_pcode: string, adm3_name: string }} DistrictRecord
 * @typedef {{ admin_level: string, adm2_pcode: string, adm3_pcode: string, y_coord: string, x_coord: string }} PointRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, lat: number, lng: number, code: string,
 * }} Level4Row
 */

/** Candidatos cuyo padre es `parentName`, por nombre sin prefijo ni tildes. */
function candidatesUnder(
  /** @type {ReadonlyArray<AccentCandidate>} */ candidates,
  /** @type {string} */ parentName,
) {
  const parent = fold(bare(parentName));
  return candidates
    .filter((item) => item.parents.some((p) => fold(bare(p)) === parent))
    .map((item) => item.name);
}

/** @param {string} value */
function coordinate(value) {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? Math.round(number * 1e6) / 1e6
    : null;
}

/**
 * Provincias como nivel 4, salvo El Callao y Lima, que ya son nivel 3 y
 * llevan sus distritos. El slug lleva el padre, como en los demás países.
 *
 * @param {{
 *   provinces: ReadonlyArray<ProvinceRecord>,
 *   districts: ReadonlyArray<DistrictRecord>,
 *   points: ReadonlyArray<PointRecord>,
 *   accents: { provinces: ReadonlyArray<AccentCandidate>, districts: ReadonlyArray<AccentCandidate> },
 * }} input
 * @returns {Level4Row[]}
 */
export function buildPeruLevel4Rows({ provinces, districts, points, accents }) {
  const pointOf = new Map();
  for (const item of points) {
    const code = item.admin_level === "2" ? item.adm2_pcode : item.adm3_pcode;
    if (item.admin_level === "2" || item.admin_level === "3") {
      pointOf.set(code, item);
    }
  }
  /** @param {string} code @param {string} name */
  const located = (code, name) => {
    const item = pointOf.get(code);
    const lat = item ? coordinate(item.y_coord) : null;
    const lng = item ? coordinate(item.x_coord) : null;
    if (lat === null || lng === null) {
      throw new Error(`Unidad sin punto: ${code} (${name})`);
    }
    return { lat, lng };
  };

  /** @type {Level4Row[]} */
  const rows = [];
  const add = (
    /** @type {{ slug: string }} */ parent,
    /** @type {string} */ name,
    /** @type {string} */ description,
    /** @type {string} */ code,
  ) => {
    const slug = `${parent.slug}-${slugify(name)}`;
    rows.push({
      slug,
      name,
      parentSlug: parent.slug,
      path: `${PERU_PATH}.${parent.slug}.${slug}`,
      description,
      ...located(code, name),
      code,
    });
  };

  for (const record of provinces) {
    const region = REGIONS.get(record.adm1_pcode);
    if (!region) {
      throw new Error(`Departamento desconocido: ${record.adm1_pcode}`);
    }
    if (fold(record.adm1_name) !== fold(region.name)) {
      throw new Error(
        `El departamento ${record.adm1_pcode} no coincide: ${record.adm1_name}`,
      );
    }
    const asLevel3 = PROVINCES_AS_LEVEL3.get(record.adm2_pcode);
    if (asLevel3) {
      const own = districts.filter((d) => d.adm2_pcode === record.adm2_pcode);
      const names = candidatesUnder(accents.districts, record.adm2_name);
      for (const item of own) {
        add(
          asLevel3,
          accentedName(item.adm3_name, names),
          asLevel3.description,
          item.adm3_pcode,
        );
      }
      continue;
    }
    add(
      region,
      accentedName(
        record.adm2_name,
        candidatesUnder(accents.provinces, region.name),
      ),
      `Provincia del departamento de ${region.name}`,
      record.adm2_pcode,
    );
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.slug)) throw new Error(`Slug repetido: ${row.slug}`);
    seen.add(row.slug);
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderPeruDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0082",
    title: "Provincias de Perú como nivel 4 (D134)",
    generator: "scripts/build-peru-level4-draft.mjs",
    countryPath: PERU_PATH,
    parentLabel: "REGION",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Ecuador.",
      "",
      "Fuente: Peru - Subnational Administrative Boundaries (COD-AB) de HDX, con",
      "datos del IGN, licencia CC BY-IGO, hojas per_admin2, per_admin3 y",
      `per_adminpoints, descargadas el ${fetchedAt}. Tildes de las etiquetas en`,
      "español de Wikidata (CC0), sólo cuando difieren del IGN únicamente en",
      "tildes o mayúsculas.",
      "",
      `${rows.length} filas: las municipalidades provinciales bajo su departamento y,`,
      "bajo El Callao y Lima Metropolitana, que ya son nivel 3, sus distritos.",
    ],
  });
}
