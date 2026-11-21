// Configuración de cada país que sale de una lista con list-level4-lib.mjs.
// `expected` es el conteo oficial que el generador exige; cuando la fuente es
// Wikidata (de terceros), ese conteo es el control. El slug de cada padre es el
// que ya tiene en 0016, aunque esté en inglés.

/** @typedef {import("./list-level4-lib.mjs").ListConfig & {
 *   source: { kind: "wikidata", classId: string } | { kind: "anati", url: string },
 *   expected: number,
 * }} ListCountry */

/**
 * @param {string} prefix
 * @param {string} of preposición y tipo: "del departamento de"
 * @param {[string, string][]} list nombre correcto y slug de 0016 sin prefijo
 */
const parentsOf = (prefix, of, list) =>
  list.map(([name, slug]) => ({
    name,
    slug: `${prefix}-${slug}`,
    of: `${of} ${name}`,
  }));

/** @type {ListCountry} */
const EL_SALVADOR = {
  key: "el-salvador",
  slugPrefix: "el-salvador",
  number: "0090",
  decision: "D142",
  title: "Municipios de El Salvador como nivel 4",
  countryPath: "earth.north-america.el-salvador",
  parentLabel: "DEPARTMENT",
  unit: "Municipio",
  // Q3556889: municipio de El Salvador. 44 según el Decreto 762 (vigente
  // desde el 01-05-2024).
  source: { kind: "wikidata", classId: "Q3556889" },
  expected: 44,
  // San Sebastián Analco no es uno de los 44 del Decreto 762.
  exclude: ["Q94339265"],
  parents: parentsOf("el-salvador", "del departamento de", [
    ["Ahuachapán", "ahuachapan"],
    ["Cabañas", "cabanas"],
    ["Chalatenango", "chalatenango-department"],
    ["Cuscatlán", "cuscatlan"],
    ["La Libertad", "la-libertad-department"],
    ["La Paz", "la-paz-department"],
    ["La Unión", "la-union"],
    ["Morazán", "morazan"],
    ["San Miguel", "san-miguel-department"],
    ["San Salvador", "san-salvador-department"],
    ["San Vicente", "san-vicente-department"],
    ["Santa Ana", "santa-ana-department"],
    ["Sonsonate", "sonsonate-department"],
    ["Usulután", "usulutan"],
  ]),
  header: [
    "Fuente: Wikidata (CC0, de terceros), clase Q3556889, con nombres y puntos;",
    "el generador exige los 44 municipios del Decreto 762, vigentes desde el",
    "01-05-2024.",
  ],
};

/** @type {ListCountry} */
const NICARAGUA = {
  key: "nicaragua",
  slugPrefix: "nicaragua",
  number: "0091",
  decision: "D143",
  title: "Municipios de Nicaragua como nivel 4",
  countryPath: "earth.north-america.nicaragua",
  parentLabel: "DEPARTMENT",
  unit: "Municipio",
  // Q318727: municipio de Nicaragua. 153 según la Ley 59 de División
  // Política Administrativa.
  source: { kind: "wikidata", classId: "Q318727" },
  expected: 153,
  parents: [
    ...parentsOf("nicaragua", "del departamento de", [
      ["Boaco", "boaco-department"],
      ["Carazo", "carazo-department"],
      ["Chinandega", "chinandega-department"],
      ["Chontales", "chontales-department"],
      ["Estelí", "esteli-department"],
      ["Granada", "granada-department"],
      ["Jinotega", "jinotega-department"],
      ["León", "leon-department"],
      ["Madriz", "madriz-department"],
      ["Managua", "managua-department"],
      ["Masaya", "masaya-department"],
      ["Matagalpa", "matagalpa-department"],
      ["Nueva Segovia", "nueva-segovia-department"],
      ["Río San Juan", "rio-san-juan-department"],
      ["Rivas", "rivas-department"],
    ]),
    {
      name: "Costa Caribe Norte",
      aliases: ["Región Autónoma de la Costa Caribe Norte"],
      slug: "nicaragua-north-caribbean-coast",
      of: "de la Región Autónoma de la Costa Caribe Norte",
    },
    {
      name: "Costa Caribe Sur",
      aliases: ["Región Autónoma de la Costa Caribe Sur"],
      slug: "nicaragua-south-caribbean-coast",
      of: "de la Región Autónoma de la Costa Caribe Sur",
    },
  ],
  header: [
    "Fuente: Wikidata (CC0, de terceros), clase Q318727, con nombres y puntos;",
    "el generador exige los 153 municipios de la Ley 59 de División Política",
    "Administrativa.",
  ],
};

/** @type {ListCountry} */
const PANAMA = {
  key: "panama",
  slugPrefix: "panama",
  number: "0092",
  decision: "D144",
  title: "Distritos de Panamá como nivel 4",
  countryPath: "earth.north-america.panama",
  parentLabel: "PROVINCE",
  unit: "Distrito",
  source: {
    kind: "anati",
    url: "https://sigigntg.anati.gob.pa/arcgisserver/rest/services/Distrito/MapServer/0/query",
  },
  // 83 distritos en la capa; Naso Tjër Di (0105) y Guna Yala (1001) son
  // comarcas con categoría de distrito que ya son nivel 3 en 0016.
  expected: 81,
  exclude: ["0105", "1001"],
  parents: [
    ...parentsOf("panama", "de la provincia de", [
      ["Bocas del Toro", "bocas-del-toro-province"],
      ["Coclé", "cocle"],
      ["Colón", "colon"],
      ["Chiriquí", "chiriqui-province"],
      ["Darién", "darien"],
      ["Herrera", "herrera-province"],
      ["Los Santos", "los-santos-province"],
      ["Panamá", "panama"],
      ["Panamá Oeste", "panama-oeste-province"],
      ["Veraguas", "veraguas-province"],
    ]),
    {
      name: "Emberá-Wounaan",
      aliases: ["Comarca Emberá-Wounaán"],
      slug: "panama-embera",
      of: "de la comarca Emberá-Wounaan",
    },
    {
      name: "Ngäbe-Buglé",
      aliases: ["Comarca Ngäbe-Buglé"],
      slug: "panama-ngoebe-bugle-comarca",
      of: "de la comarca Ngäbe-Buglé",
    },
  ],
  header: [
    "Fuente: capa de distritos del Instituto Geográfico Nacional Tommy Guardia",
    "(ANATI), con datos del INEC y de la Comisión Nacional de Límites. Sólo",
    "nombres y códigos; sin coordenadas, porque la capa no declara licencia.",
  ],
};

/** @type {ReadonlyMap<string, ListCountry>} */
export const LIST_COUNTRIES = new Map(
  [EL_SALVADOR, NICARAGUA, PANAMA].map((country) => [country.key, country]),
);
