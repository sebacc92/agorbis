// Genera la sección de `communities` del seed de Agorbis.
// La bandera se deriva del ISO 3166-1 alpha-2 (indicadores regionales), así no
// hay riesgo de pegar un emoji equivocado a mano.
import { writeFileSync } from "node:fs";

const flag = (iso2) =>
  String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const CONTINENTS = [
  { slug: "africa", name: "África", emoji: "🌍", lat: 1.65, lng: 17.35 },
  { slug: "north-america", name: "América del Norte", emoji: "🌎", lat: 46.07, lng: -100.55 },
  { slug: "south-america", name: "América del Sur", emoji: "🌎", lat: -14.6, lng: -58.45 },
  { slug: "asia", name: "Asia", emoji: "🌏", lat: 34.05, lng: 100.62 },
  { slug: "europe", name: "Europa", emoji: "🌍", lat: 54.53, lng: 15.26 },
  { slug: "oceania", name: "Oceanía", emoji: "🌏", lat: -22.73, lng: 140.02 },
];

// [ISO 3166-1 alpha-2, nombre en español]
const COUNTRIES = {
  africa: [
    ["DZ", "Argelia"], ["AO", "Angola"], ["BJ", "Benín"], ["BW", "Botsuana"],
    ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", "Cabo Verde"], ["CM", "Camerún"],
    ["TD", "Chad"], ["KM", "Comoras"], ["CG", "Congo"], ["CD", "República Democrática del Congo"],
    ["CI", "Costa de Marfil"], ["DJ", "Yibuti"], ["EG", "Egipto"], ["GQ", "Guinea Ecuatorial"],
    ["ER", "Eritrea"], ["SZ", "Esuatini"], ["ET", "Etiopía"], ["GA", "Gabón"],
    ["GM", "Gambia"], ["GH", "Ghana"], ["GN", "Guinea"], ["GW", "Guinea-Bisáu"],
    ["KE", "Kenia"], ["LS", "Lesoto"], ["LR", "Liberia"], ["LY", "Libia"],
    ["MG", "Madagascar"], ["MW", "Malaui"], ["ML", "Malí"], ["MA", "Marruecos"],
    ["MR", "Mauritania"], ["MU", "Mauricio"], ["MZ", "Mozambique"], ["NA", "Namibia"],
    ["NE", "Níger"], ["NG", "Nigeria"], ["CF", "República Centroafricana"], ["RW", "Ruanda"],
    ["ST", "Santo Tomé y Príncipe"], ["SN", "Senegal"], ["SC", "Seychelles"], ["SL", "Sierra Leona"],
    ["SO", "Somalia"], ["ZA", "Sudáfrica"], ["SD", "Sudán"], ["SS", "Sudán del Sur"],
    ["TZ", "Tanzania"], ["TG", "Togo"], ["TN", "Túnez"], ["UG", "Uganda"],
    ["ZM", "Zambia"], ["ZW", "Zimbabue"],
  ],
  "north-america": [
    ["AG", "Antigua y Barbuda"], ["BS", "Bahamas"], ["BB", "Barbados"], ["BZ", "Belice"],
    ["CA", "Canadá"], ["CR", "Costa Rica"], ["CU", "Cuba"], ["DM", "Dominica"],
    ["DO", "República Dominicana"], ["SV", "El Salvador"], ["US", "Estados Unidos"], ["GD", "Granada"],
    ["GT", "Guatemala"], ["HT", "Haití"], ["HN", "Honduras"], ["JM", "Jamaica"],
    ["MX", "México"], ["NI", "Nicaragua"], ["PA", "Panamá"], ["KN", "San Cristóbal y Nieves"],
    ["VC", "San Vicente y las Granadinas"], ["LC", "Santa Lucía"], ["TT", "Trinidad y Tobago"],
  ],
  "south-america": [
    ["AR", "Argentina"], ["BO", "Bolivia"], ["BR", "Brasil"], ["CL", "Chile"],
    ["CO", "Colombia"], ["EC", "Ecuador"], ["GY", "Guyana"], ["PY", "Paraguay"],
    ["PE", "Perú"], ["SR", "Surinam"], ["UY", "Uruguay"], ["VE", "Venezuela"],
  ],
  asia: [
    ["AF", "Afganistán"], ["SA", "Arabia Saudita"], ["AM", "Armenia"], ["AZ", "Azerbaiyán"],
    ["BD", "Bangladés"], ["BH", "Baréin"], ["MM", "Birmania"], ["BN", "Brunéi"],
    ["BT", "Bután"], ["KH", "Camboya"], ["QA", "Catar"], ["CN", "China"],
    ["CY", "Chipre"], ["KP", "Corea del Norte"], ["KR", "Corea del Sur"], ["AE", "Emiratos Árabes Unidos"],
    ["PH", "Filipinas"], ["GE", "Georgia"], ["IN", "India"], ["ID", "Indonesia"],
    ["IQ", "Irak"], ["IR", "Irán"], ["IL", "Israel"], ["JP", "Japón"],
    ["JO", "Jordania"], ["KZ", "Kazajistán"], ["KG", "Kirguistán"], ["KW", "Kuwait"],
    ["LA", "Laos"], ["LB", "Líbano"], ["MY", "Malasia"], ["MV", "Maldivas"],
    ["MN", "Mongolia"], ["NP", "Nepal"], ["OM", "Omán"], ["PK", "Pakistán"],
    ["PS", "Palestina"], ["SG", "Singapur"], ["SY", "Siria"], ["LK", "Sri Lanka"],
    ["TH", "Tailandia"], ["TJ", "Tayikistán"], ["TL", "Timor Oriental"], ["TM", "Turkmenistán"],
    ["TR", "Turquía"], ["UZ", "Uzbekistán"], ["VN", "Vietnam"], ["YE", "Yemen"],
  ],
  europe: [
    ["AL", "Albania"], ["DE", "Alemania"], ["AD", "Andorra"], ["AT", "Austria"],
    ["BE", "Bélgica"], ["BY", "Bielorrusia"], ["BA", "Bosnia y Herzegovina"], ["BG", "Bulgaria"],
    ["VA", "Ciudad del Vaticano"], ["HR", "Croacia"], ["DK", "Dinamarca"], ["SK", "Eslovaquia"],
    ["SI", "Eslovenia"], ["ES", "España"], ["EE", "Estonia"], ["FI", "Finlandia"],
    ["FR", "Francia"], ["GR", "Grecia"], ["HU", "Hungría"], ["IE", "Irlanda"],
    ["IS", "Islandia"], ["IT", "Italia"], ["LV", "Letonia"], ["LI", "Liechtenstein"],
    ["LT", "Lituania"], ["LU", "Luxemburgo"], ["MK", "Macedonia del Norte"], ["MT", "Malta"],
    ["MD", "Moldavia"], ["MC", "Mónaco"], ["ME", "Montenegro"], ["NO", "Noruega"],
    ["NL", "Países Bajos"], ["PL", "Polonia"], ["PT", "Portugal"], ["GB", "Reino Unido"],
    ["CZ", "República Checa"], ["RO", "Rumania"], ["RU", "Rusia"], ["SM", "San Marino"],
    ["RS", "Serbia"], ["SE", "Suecia"], ["CH", "Suiza"], ["UA", "Ucrania"],
  ],
  oceania: [
    ["AU", "Australia"], ["FJ", "Fiyi"], ["MH", "Islas Marshall"], ["SB", "Islas Salomón"],
    ["KI", "Kiribati"], ["FM", "Micronesia"], ["NR", "Nauru"], ["NZ", "Nueva Zelanda"],
    ["PW", "Palaos"], ["PG", "Papúa Nueva Guinea"], ["WS", "Samoa"], ["TO", "Tonga"],
    ["TV", "Tuvalu"], ["VU", "Vanuatu"],
  ],
};

/**
 * Centroides de países, por ISO 3166-1 alpha-2. [lat, lng]
 *
 * Fuentes (ninguna coordenada es inventada):
 *   · Google DSPL — canonical countries (194 de 195):
 *     https://raw.githubusercontent.com/google/dspl/master/samples/google/canonical/countries.csv
 *   · mledoze/countries (sólo Sudán del Sur, posterior al dataset anterior):
 *     https://raw.githubusercontent.com/mledoze/countries/master/dist/countries.json
 *
 * Son centroides aproximados pensados para centrar un mapa, no para geodesia:
 * en países con territorios dispersos el punto puede caer en el mar.
 */
const COUNTRY_COORDS = {
  AD: [42.5462, 1.6016],
  AE: [23.4241, 53.8478],
  AF: [33.9391, 67.71],
  AG: [17.0608, -61.7964],
  AL: [41.1533, 20.1683],
  AM: [40.0691, 45.0382],
  AO: [-11.2027, 17.8739],
  AR: [-38.4161, -63.6167],
  AT: [47.5162, 14.5501],
  AU: [-25.2744, 133.7751],
  AZ: [40.1431, 47.5769],
  BA: [43.9159, 17.6791],
  BB: [13.1939, -59.5432],
  BD: [23.685, 90.3563],
  BE: [50.5039, 4.4699],
  BF: [12.2383, -1.5616],
  BG: [42.7339, 25.4858],
  BH: [25.9304, 50.6378],
  BI: [-3.3731, 29.9189],
  BJ: [9.3077, 2.3158],
  BN: [4.5353, 114.7277],
  BO: [-16.2902, -63.5887],
  BR: [-14.235, -51.9253],
  BS: [25.0343, -77.3963],
  BT: [27.5142, 90.4336],
  BW: [-22.3285, 24.6849],
  BY: [53.7098, 27.9534],
  BZ: [17.1899, -88.4976],
  CA: [56.1304, -106.3468],
  CD: [-4.0383, 21.7587],
  CF: [6.6111, 20.9394],
  CG: [-0.228, 15.8277],
  CH: [46.8182, 8.2275],
  CI: [7.54, -5.5471],
  CL: [-35.6751, -71.543],
  CM: [7.3697, 12.3547],
  CN: [35.8617, 104.1954],
  CO: [4.5709, -74.2973],
  CR: [9.7489, -83.7534],
  CU: [21.5218, -77.7812],
  CV: [16.0021, -24.0132],
  CY: [35.1264, 33.4299],
  CZ: [49.8175, 15.473],
  DE: [51.1657, 10.4515],
  DJ: [11.8251, 42.5903],
  DK: [56.2639, 9.5018],
  DM: [15.415, -61.371],
  DO: [18.7357, -70.1627],
  DZ: [28.0339, 1.6596],
  EC: [-1.8312, -78.1834],
  EE: [58.5953, 25.0136],
  EG: [26.8206, 30.8025],
  ER: [15.1794, 39.7823],
  ES: [40.4637, -3.7492],
  ET: [9.145, 40.4897],
  FI: [61.9241, 25.7482],
  FJ: [-16.5782, 179.4144],
  FM: [7.4256, 150.5508],
  FR: [46.2276, 2.2137],
  GA: [-0.8037, 11.6094],
  GB: [55.3781, -3.436],
  GD: [12.2628, -61.6042],
  GE: [42.3154, 43.3569],
  GH: [7.9465, -1.0232],
  GM: [13.4432, -15.3101],
  GN: [9.9456, -9.6966],
  GQ: [1.6508, 10.2679],
  GR: [39.0742, 21.8243],
  GT: [15.7835, -90.2308],
  GW: [11.8037, -15.1804],
  GY: [4.8604, -58.9302],
  HN: [15.2, -86.2419],
  HR: [45.1, 15.2],
  HT: [18.9712, -72.2852],
  HU: [47.1625, 19.5033],
  ID: [-0.7893, 113.9213],
  IE: [53.4129, -8.2439],
  IL: [31.0461, 34.8516],
  IN: [20.5937, 78.9629],
  IQ: [33.2232, 43.6793],
  IR: [32.4279, 53.688],
  IS: [64.9631, -19.0208],
  IT: [41.8719, 12.5674],
  JM: [18.1096, -77.2975],
  JO: [30.5852, 36.2384],
  JP: [36.2048, 138.2529],
  KE: [-0.0236, 37.9062],
  KG: [41.2044, 74.7661],
  KH: [12.5657, 104.991],
  KI: [-3.3704, -168.734],
  KM: [-11.875, 43.8722],
  KN: [17.3578, -62.783],
  KP: [40.3399, 127.5101],
  KR: [35.9078, 127.7669],
  KW: [29.3117, 47.4818],
  KZ: [48.0196, 66.9237],
  LA: [19.8563, 102.4955],
  LB: [33.8547, 35.8623],
  LC: [13.9094, -60.9789],
  LI: [47.166, 9.5554],
  LK: [7.8731, 80.7718],
  LR: [6.4281, -9.4295],
  LS: [-29.61, 28.2336],
  LT: [55.1694, 23.8813],
  LU: [49.8153, 6.1296],
  LV: [56.8796, 24.6032],
  LY: [26.3351, 17.2283],
  MA: [31.7917, -7.0926],
  MC: [43.7503, 7.4128],
  MD: [47.4116, 28.3699],
  ME: [42.7087, 19.3744],
  MG: [-18.7669, 46.8691],
  MH: [7.1315, 171.1845],
  MK: [41.6086, 21.7453],
  ML: [17.5707, -3.9962],
  MM: [21.914, 95.9562],
  MN: [46.8625, 103.8467],
  MR: [21.0079, -10.9408],
  MT: [35.9375, 14.3754],
  MU: [-20.3484, 57.5522],
  MV: [3.2028, 73.2207],
  MW: [-13.2543, 34.3015],
  MX: [23.6345, -102.5528],
  MY: [4.2105, 101.9758],
  MZ: [-18.6657, 35.5296],
  NA: [-22.9576, 18.4904],
  NE: [17.6078, 8.0817],
  NG: [9.082, 8.6753],
  NI: [12.8654, -85.2072],
  NL: [52.1326, 5.2913],
  NO: [60.472, 8.4689],
  NP: [28.3949, 84.124],
  NR: [-0.5228, 166.9315],
  NZ: [-40.9006, 174.886],
  OM: [21.5126, 55.9233],
  PA: [8.538, -80.7821],
  PE: [-9.19, -75.0152],
  PG: [-6.315, 143.9555],
  PH: [12.8797, 121.774],
  PK: [30.3753, 69.3451],
  PL: [51.9194, 19.1451],
  PS: [31.9522, 35.2332],
  PT: [39.3999, -8.2245],
  PW: [7.515, 134.5825],
  PY: [-23.4425, -58.4438],
  QA: [25.3548, 51.1839],
  RO: [45.9432, 24.9668],
  RS: [44.0165, 21.0059],
  RU: [61.524, 105.3188],
  RW: [-1.9403, 29.8739],
  SA: [23.8859, 45.0792],
  SB: [-9.6457, 160.1562],
  SC: [-4.6796, 55.492],
  SD: [12.8628, 30.2176],
  SE: [60.1282, 18.6435],
  SG: [1.3521, 103.8198],
  SI: [46.1512, 14.9955],
  SK: [48.669, 19.699],
  SL: [8.4606, -11.7799],
  SM: [43.9424, 12.4578],
  SN: [14.4974, -14.4524],
  SO: [5.1521, 46.1996],
  SR: [3.9193, -56.0278],
  SS: [7, 30], // mledoze/countries
  ST: [0.1864, 6.6131],
  SV: [13.7942, -88.8965],
  SY: [34.8021, 38.9968],
  SZ: [-26.5225, 31.4659],
  TD: [15.4542, 18.7322],
  TG: [8.6195, 0.8248],
  TH: [15.87, 100.9925],
  TJ: [38.861, 71.2761],
  TL: [-8.8742, 125.7275],
  TM: [38.9697, 59.5563],
  TN: [33.8869, 9.5375],
  TO: [-21.179, -175.1982],
  TR: [38.9637, 35.2433],
  TT: [10.6918, -61.2225],
  TV: [-7.1095, 177.6493],
  TZ: [-6.369, 34.8888],
  UA: [48.3794, 31.1656],
  UG: [1.3733, 32.2903],
  US: [37.0902, -95.7129],
  UY: [-32.5228, -55.7658],
  UZ: [41.3775, 64.5853],
  VA: [41.9029, 12.4534],
  VC: [12.9843, -61.2872],
  VE: [6.4238, -66.5897],
  VN: [14.0583, 108.2772],
  VU: [-15.3767, 166.9592],
  WS: [-13.759, -172.1046],
  YE: [15.5527, 48.5164],
  ZA: [-30.5595, 22.9375],
  ZM: [-13.1339, 27.8493],
  ZW: [-19.0154, 29.1549],
};

// Nivel 3 de Argentina: 23 provincias + CABA, todas al mismo nivel.
const AR_SUBDIVISIONS = [
  ["Buenos Aires", "🌾", -36.68, -60.56],
  ["Ciudad Autónoma de Buenos Aires", "🏙️", -34.61, -58.44],
  ["Catamarca", "⛰️", -27.32, -66.94],
  ["Chaco", "🌳", -26.35, -60.75],
  ["Chubut", "🐋", -43.79, -68.53],
  ["Córdoba", "🏔️", -32.14, -63.8],
  ["Corrientes", "🐊", -28.77, -57.79],
  ["Entre Ríos", "🏞️", -31.77, -59.22],
  ["Formosa", "🌿", -24.89, -59.97],
  ["Jujuy", "🏜️", -23.31, -65.76],
  ["La Pampa", "🐄", -37.13, -65.44],
  ["La Rioja", "🍇", -29.72, -67.15],
  ["Mendoza", "🍷", -34.63, -68.5],
  ["Misiones", "💦", -26.88, -54.51],
  ["Neuquén", "🦕", -38.63, -70.06],
  ["Río Negro", "🍎", -40.35, -67.28],
  ["Salta", "🌶️", -24.79, -65.41],
  ["San Juan", "☀️", -31.0, -68.9],
  ["San Luis", "🪨", -33.7, -66.03],
  ["Santa Cruz", "🧊", -49.31, -70.0],
  ["Santa Fe", "🌻", -31.0, -60.9],
  ["Santiago del Estero", "🪵", -27.78, -63.25],
  ["Tierra del Fuego", "🐧", -54.35, -67.5],
  ["Tucumán", "🍋", -26.85, -65.24],
];

// Nivel 4 dentro de la Provincia de Buenos Aires.
const BA_CITIES = [
  ["Mar del Plata", "🌊", -38.0055, -57.5426, "Partido de General Pueyrredón"],
  ["La Plata", "🏛️", -34.9215, -57.9545, "Capital de la Provincia de Buenos Aires"],
  ["Bahía Blanca", "⚓", -38.7196, -62.2724, "Puerto y nudo ferroviario del sur bonaerense"],
  ["Tandil", "🪨", -37.3217, -59.1332, "Sierras, quesos y salames en el centro de la provincia"],
  ["Mar Chiquita", "🦩", -37.7442, -57.4256, "Partido costero con la única albufera del país"],
  ["Balcarce", "🏁", -37.8462, -58.2556, "Tierra de Fangio y de la papa"],
  ["Necochea", "🏖️", -38.5545, -58.7396, "Playas anchas y el Parque Miguel Lillo"],
  ["Pinamar", "🌲", -37.1069, -56.8592, "Bosque y médanos sobre el Atlántico"],
  ["Villa Gesell", "🎸", -37.2639, -56.973, "Balneario forestado, cuna de la peatonal veraniega"],
  ["Miramar", "🚲", -38.2703, -57.8397, "La ciudad de los niños, en el partido de General Alvarado"],
];

const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? "NULL" : String(v));

const rows = [];
rows.push(["earth", "Tierra", 0, "NULL", "earth", "🌍",
  "La comunidad de toda la humanidad. Acá caben las conversaciones que nos incluyen a todos.", 0, 0]);

for (const c of CONTINENTS) {
  rows.push([c.slug, c.name, 1, "earth", `earth.${c.slug}`, c.emoji, null, c.lat, c.lng]);
}

const seenSlugs = new Set(rows.map((r) => r[0]));
let countryCount = 0;
for (const [contSlug, list] of Object.entries(COUNTRIES)) {
  for (const [iso, name] of list) {
    const slug = slugify(name);
    if (seenSlugs.has(slug)) throw new Error(`Slug duplicado: ${slug} (${name})`);
    seenSlugs.add(slug);
    countryCount++;
    const coord = COUNTRY_COORDS[iso];
    if (!coord) throw new Error(`Falta la coordenada de ${iso} (${name})`);
    rows.push([slug, name, 2, contSlug, `earth.${contSlug}.${slug}`, flag(iso), null, coord[0], coord[1]]);
  }
}

for (const [name, emoji, lat, lng] of AR_SUBDIVISIONS) {
  const slug = slugify(name === "Ciudad Autónoma de Buenos Aires" ? "CABA" : name);
  if (seenSlugs.has(slug)) throw new Error(`Slug duplicado: ${slug} (${name})`);
  seenSlugs.add(slug);
  rows.push([slug, name, 3, "argentina", `earth.south-america.argentina.${slug}`, emoji, null, lat, lng]);
}

for (const [name, emoji, lat, lng, desc] of BA_CITIES) {
  const slug = slugify(name);
  if (seenSlugs.has(slug)) throw new Error(`Slug duplicado: ${slug} (${name})`);
  seenSlugs.add(slug);
  rows.push([slug, name, 4, "buenos-aires",
    `earth.south-america.argentina.buenos-aires.${slug}`, emoji, desc, lat, lng]);
}

// Validación: todo slug debe respetar el CHECK de la tabla.
for (const r of rows) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r[0])) throw new Error(`Slug inválido: ${r[0]}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/.test(r[4]))
    throw new Error(`Path inválido: ${r[4]}`);
}

const LEVEL_LABEL = {
  0: "Nivel 0 · la Tierra",
  1: `Nivel 1 · ${CONTINENTS.length} continentes`,
  2: `Nivel 2 · ${countryCount} países`,
  3: `Nivel 3 · subdivisiones de Argentina (23 provincias + CABA)`,
  4: `Nivel 4 · municipios de la Provincia de Buenos Aires`,
};

// Un INSERT por nivel: `parent_id` se resuelve por slug contra las filas que ya
// están en la tabla, y una sentencia no puede ver lo que ella misma inserta.
const blocks = [0, 1, 2, 3, 4]
  .map((level) => {
    const values = rows
      .filter((r) => r[2] === level)
      .map(([slug, name, lvl, parentSlug, path, emoji, desc, lat, lng]) =>
        `  (${q(slug)}, ${q(name)}, ${lvl}, ${parentSlug === "NULL" ? "NULL" : q(parentSlug)}, ` +
        `${q(path)}, ${q(emoji)}, ${q(desc)}, ${n(lat)}, ${n(lng)})`)
      .join(",\n");

    // Los casts explícitos son obligatorios: cuando una columna del `VALUES` es
    // NULL en todas las filas (pasa con lat/lng/description en los 195 países),
    // Postgres la infiere como `text` y el INSERT falla con
    // "column lat is of type double precision but expression is of type text".
    return `-- ${LEVEL_LABEL[level]}
insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, i.level::smallint, p.id, i.path, i.emoji::text, i.description::text,
       i.lat::double precision, i.lng::double precision
from (values
${values}
) as i (slug, name, level, parent_slug, path, emoji, description, lat, lng)
left join public.communities p on p.slug = i.parent_slug
on conflict (slug) do nothing;`;
  })
  .join("\n\n");

const sql = `-- =============================================================================
-- Agorbis · seed
-- -----------------------------------------------------------------------------
-- Generado parcialmente por scripts/gen-geo.mjs (jerarquía geográfica) y
-- completado a mano (community_info y contenido demo).
--
-- ATENCIÓN: la sección de usuarios demo escribe en auth.users. Está pensada
-- SÓLO para desarrollo local (\`supabase db reset\`). No correr en producción.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Jerarquía: 1 global + ${CONTINENTS.length} continentes + ${countryCount} países
-- + ${AR_SUBDIVISIONS.length} subdivisiones argentinas + ${BA_CITIES.length} municipios bonaerenses
-- = ${rows.length} comunidades.
-- -----------------------------------------------------------------------------

${blocks}
`;

writeFileSync(process.argv[2], sql);
console.log(`OK · ${rows.length} comunidades · ${countryCount} países`);
for (const c of CONTINENTS) {
  console.log(`   ${c.name}: ${COUNTRIES[c.slug].length}`);
}
