// Configuración de cada país que sale de un COD-AB de HDX con
// cod-ab-level4-lib.mjs. Cada uno trae su decisión en DECISIONS.md. El nombre
// de cada padre es el correcto, con tildes, y se compara con el del COD-AB sin
// tildes; el slug es el que el padre ya tiene en 0016, aunque esté en inglés.

/** @typedef {import("./cod-ab-level4-lib.mjs").CountryConfig & {
 *   url: string, sheets: { units: string, points: string },
 *   expected: number, wikidataClass?: string,
 *   levels?: { parent: string, unit: string }, stripPrefix?: RegExp,
 *   wikidataLanguage?: string,
 * }} CountrySource */

/** @param {string} prefix @param {[string, string, string][]} list */
const parentsOf = (prefix, list) =>
  list.map(([pcode, name, slug]) => ({
    pcode,
    name,
    slug: `${prefix}-${slug}`,
  }));

/** @type {CountrySource} */
const HONDURAS = {
  key: "honduras",
  slugPrefix: "honduras",
  number: "0088",
  decision: "D140",
  title: "Municipios de Honduras como nivel 4",
  countryPath: "earth.north-america.honduras",
  parentLabel: "DEPARTMENT",
  url: "https://data.humdata.org/dataset/bd62fb53-64d3-478f-9ca8-38e4a2de19c0/resource/f12349c7-bc5f-4655-a34d-972f761266b5/download/hnd_admin_boundaries.xlsx",
  sheets: { units: "hnd_admin2", points: "hnd_adminpoints" },
  expected: 298,
  // Q2602693: municipio de Honduras. El COD-AB trae casi todo sin tildes.
  wikidataClass: "Q2602693",
  parents: parentsOf("honduras", [
    ["HN01", "Atlántida", "atlantida-department"],
    ["HN02", "Colón", "colon-department"],
    ["HN03", "Comayagua", "comayagua-department"],
    ["HN04", "Copán", "copan-department"],
    ["HN05", "Cortés", "cortes-department"],
    ["HN06", "Choluteca", "choluteca-department"],
    ["HN07", "El Paraíso", "el-paraiso-department"],
    ["HN08", "Francisco Morazán", "francisco-morazan-department"],
    ["HN09", "Gracias a Dios", "gracias-a-dios-department"],
    ["HN10", "Intibucá", "intibuca-department"],
    ["HN11", "Islas de la Bahía", "bay-islands"],
    ["HN12", "La Paz", "la-paz-department"],
    ["HN13", "Lempira", "lempira-department"],
    ["HN14", "Ocotepeque", "ocotepeque-department"],
    ["HN15", "Olancho", "olancho-department"],
    ["HN16", "Santa Bárbara", "santa-barbara-department"],
    ["HN17", "Valle", "valle-department"],
    ["HN18", "Yoro", "yoro-department"],
  ]),
  describe: (parent) => `Municipio del departamento de ${parent}`,
  header: [
    "Fuente: Honduras - Subnational Administrative Boundaries (COD-AB) de HDX,",
    "con datos del SINIT/SEPLAN, licencia CC BY-IGO. Tildes de las etiquetas en",
    "español de Wikidata (CC0), sólo cuando difieren únicamente en tildes o",
    "mayúsculas.",
  ],
};

/** @type {CountrySource} */
const COSTA_RICA = {
  key: "costa-rica",
  slugPrefix: "costa-rica",
  number: "0089",
  decision: "D141",
  title: "Cantones de Costa Rica como nivel 4",
  countryPath: "earth.north-america.costa-rica",
  parentLabel: "PROVINCE",
  url: "https://data.humdata.org/dataset/7cf2b2c2-ad83-4f65-aa69-dae9c574df13/resource/f3530865-1419-4ffa-bf51-e0100f4266a5/download/cri_admin_boundaries.xlsx",
  sheets: { units: "cri_admin2", points: "cri_adminpoints" },
  expected: 84,
  parents: parentsOf("costa-rica", [
    ["CR1", "San José", "san-jose"],
    ["CR2", "Alajuela", "alajuela-province"],
    ["CR3", "Cartago", "cartago-province"],
    ["CR4", "Heredia", "heredia-province"],
    ["CR5", "Guanacaste", "guanacaste-province"],
    ["CR6", "Puntarenas", "puntarenas-province"],
    ["CR7", "Limón", "limon-province"],
  ]),
  describe: (parent) => `Cantón de la provincia de ${parent}`,
  header: [
    "Fuente: Costa Rica - Subnational Administrative Boundaries (COD-AB) de HDX,",
    "con datos del INEC, licencia CC BY-IGO. Cada cantón tiene su municipalidad.",
  ],
};

/** @type {CountrySource} */
const REPUBLICA_DOMINICANA = {
  key: "republica-dominicana",
  slugPrefix: "republica-dominicana",
  number: "0093",
  decision: "D145",
  title: "Municipios de República Dominicana como nivel 4",
  countryPath: "earth.north-america.republica-dominicana",
  parentLabel: "PROVINCE",
  url: "https://data.humdata.org/dataset/1b26ea94-4d28-4167-9209-4984ab087973/resource/a7dec461-4f33-4117-b043-ccf9a471580c/download/dom_admin_boundaries.xlsx",
  // En este COD-AB adm1 son las regiones de planificación: la provincia es
  // adm2 y el municipio adm3, ambos con prefijo ("Provincia Duarte").
  levels: { parent: "adm2", unit: "adm3" },
  stripPrefix: /^(Municipio|Provincia)\s+/,
  sheets: { units: "dom_admin3", points: "dom_adminpoints" },
  // 155 municipios en la capa (2021) menos Santo Domingo de Guzmán, que es el
  // Distrito Nacional y ya es nivel 3 ("Nacional" en 0016).
  expected: 154,
  exclude: ["DO080101"],
  parents: parentsOf("republica-dominicana", [
    ["DO0101", "Duarte", "duarte-province"],
    ["DO0102", "Hermanas Mirabal", "hermanas-mirabal"],
    ["DO0103", "María Trinidad Sánchez", "maria-trinidad-sanchez"],
    ["DO0104", "Samaná", "samana"],
    ["DO0201", "Dajabón", "dajabon"],
    ["DO0202", "Monte Cristi", "monte-cristi-province"],
    ["DO0203", "Santiago Rodríguez", "santiago-rodriguez"],
    ["DO0204", "Valverde", "valverde-province"],
    ["DO0301", "Espaillat", "espaillat-province"],
    ["DO0302", "Puerto Plata", "puerto-plata"],
    ["DO0303", "Santiago", "santiago-province"],
    ["DO0401", "La Vega", "la-vega"],
    ["DO0402", "Monseñor Nouel", "monsenor-nouel"],
    ["DO0403", "Sánchez Ramírez", "sanchez-ramirez"],
    ["DO0501", "Elías Piña", "elias-pina"],
    ["DO0502", "San Juan", "san-juan-province"],
    ["DO0601", "Baoruco", "baoruco-province"],
    ["DO0602", "Barahona", "barahona-province"],
    ["DO0603", "Independencia", "independencia"],
    ["DO0604", "Pedernales", "pedernales-province"],
    ["DO0701", "Hato Mayor", "hato-mayor-province"],
    ["DO0702", "Monte Plata", "monte-plata-province"],
    ["DO0703", "San Pedro de Macorís", "san-pedro-de-macoris"],
    ["DO0802", "Santo Domingo", "santo-domingo-province"],
    ["DO0901", "Azua", "azua-province"],
    ["DO0902", "Peravia", "peravia"],
    ["DO0903", "San Cristóbal", "san-cristobal"],
    ["DO0904", "San José de Ocoa", "san-jose-de-ocoa"],
    ["DO1001", "El Seibo", "el-seibo"],
    ["DO1002", "La Altagracia", "la-altagracia-province"],
    ["DO1003", "La Romana", "la-romana"],
  ]),
  describe: (parent) => `Municipio de la provincia de ${parent}`,
  header: [
    "Fuente: República Dominicana - Subnational Administrative Boundaries",
    "(COD-AB) de HDX, con datos de la Oficina Nacional de Estadística, licencia",
    "CC BY-IGO, vigente desde 2021. Falta La Victoria (Santo Domingo), creada",
    "en 2026: queda pendiente antes de promover.",
  ],
};

/** @type {CountrySource} */
const HAITI = {
  key: "haiti",
  slugPrefix: "haiti",
  number: "0094",
  decision: "D146",
  title: "Comunas de Haití como nivel 4",
  countryPath: "earth.north-america.haiti",
  parentLabel: "DEPARTMENT",
  url: "https://data.humdata.org/dataset/777e8b06-337f-4295-80bc-ca1515244215/resource/08d3ec12-d827-4fd2-8f18-67a5dd08f421/download/hti_admin_boundaries.xlsx",
  sheets: { units: "hti_admin2", points: "hti_adminpoints" },
  // 140 comunas en la capa de 2018; Wikidata cuenta 146: faltan las nuevas.
  expected: 140,
  // Q3685462: comuna de Haití. Las etiquetas en francés: las de español traen
  // exónimos ("Tiburón", "Bombardópolis"). Wikidata cuelga las comunas de los
  // arrondissements, así que el cruce va por todo el país (no hay homónimos).
  wikidataClass: "Q3685462",
  wikidataLanguage: "fr",
  accentsByParent: false,
  parents: [
    ["HT01", "Ouest", "ouest", "West"],
    ["HT02", "Sud-Est", "sud-est", "South-East"],
    ["HT03", "Nord", "nord", "North"],
    ["HT04", "Nord-Est", "nord-est", "North-East"],
    ["HT05", "Artibonite", "artibonite"],
    ["HT06", "Centre", "centre"],
    ["HT07", "Sud", "sud", "South"],
    ["HT08", "Grand'Anse", "grand-anse", "Grande'Anse"],
    ["HT09", "Nord-Ouest", "nord-ouest", "North-West"],
    ["HT10", "Nippes", "nippes"],
  ].map(([pcode, name, slug, alias]) => ({
    pcode,
    name,
    slug: `haiti-${slug}`,
    ...(alias ? { aliases: [alias] } : {}),
  })),
  describe: (parent) => `Comuna del departamento ${parent}`,
  header: [
    "Fuente: Haiti - Subnational Administrative Boundaries (COD-AB) de HDX, con",
    "datos del CNIGS, licencia CC BY-IGO, vigente desde 2018. Tildes de las",
    "etiquetas en francés de Wikidata (CC0), sólo cuando difieren únicamente en",
    "tildes o mayúsculas. Faltan las comunas creadas después: Wikidata cuenta 146.",
  ],
};

/** @type {ReadonlyMap<string, CountrySource>} */
export const COUNTRIES = new Map(
  [HONDURAS, COSTA_RICA, REPUBLICA_DOMINICANA, HAITI].map((country) => [
    country.key,
    country,
  ]),
);
