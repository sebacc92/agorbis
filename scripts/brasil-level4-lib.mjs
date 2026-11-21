// Lógica pura del borrador del nivel 4 de Brasil (D137). No descarga nada:
// recibe los municipios de la API de localidades del IBGE, ya aplanados por
// el generador, y arma filas y SQL, para que el spec pruebe todo sin red.

import { slugify } from "./argentina-level4-lib.mjs";
import { renderLevel4DraftSql } from "./level4-draft-sql.mjs";

const BRASIL_PATH = "earth.south-america.brasil";

/**
 * Código IBGE de UF → comunidad de nivel 3 que ya existe en la base (0016),
 * con su slug tal como está, errores incluidos (`rio-de-jeneiro`,
 * `rio-granda-do-norte`): corregirlos cambia el path de comunidades que ya
 * existen y es otra decisión. El nombre es el oficial del IBGE. El Distrito
 * Federal (53) no está: no tiene municipios.
 */
export const STATES = new Map(
  /** @type {[number, string, string, string][]} */ ([
    [11, "RO", "Rondônia", "brasil-rondonia"],
    [12, "AC", "Acre", "brasil-acre"],
    [13, "AM", "Amazonas", "brasil-amazonas"],
    [14, "RR", "Roraima", "brasil-roraima"],
    [15, "PA", "Pará", "brasil-para"],
    [16, "AP", "Amapá", "brasil-amapa"],
    [17, "TO", "Tocantins", "brasil-tocantins"],
    [21, "MA", "Maranhão", "brasil-maranhao"],
    [22, "PI", "Piauí", "brasil-piaui"],
    [23, "CE", "Ceará", "brasil-ceara"],
    [24, "RN", "Rio Grande do Norte", "brasil-rio-granda-do-norte"],
    [25, "PB", "Paraíba", "brasil-paraiba"],
    [26, "PE", "Pernambuco", "brasil-pernambuco"],
    [27, "AL", "Alagoas", "brasil-alagoas"],
    [28, "SE", "Sergipe", "brasil-sergipe"],
    [29, "BA", "Bahia", "brasil-bahia"],
    [31, "MG", "Minas Gerais", "brasil-minas-gerais"],
    [32, "ES", "Espírito Santo", "brasil-espirito-santo"],
    [33, "RJ", "Rio de Janeiro", "brasil-rio-de-jeneiro"],
    [35, "SP", "São Paulo", "brasil-sao-paulo"],
    [41, "PR", "Paraná", "brasil-parana"],
    [42, "SC", "Santa Catarina", "brasil-santa-catarina"],
    [43, "RS", "Rio Grande do Sul", "brasil-rio-grande-do-sul"],
    [50, "MS", "Mato Grosso do Sul", "brasil-mato-grosso-do-sul"],
    [51, "MT", "Mato Grosso", "brasil-mato-grosso"],
    [52, "GO", "Goiás", "brasil-goias"],
  ]).map(([id, sigla, name, slug]) => [id, { sigla, name, slug }]),
);

const FEDERAL_DISTRICT = 53;

/**
 * Fernando de Noronha figura en la API como municipio, pero es un distrito
 * estadual sin prefeitura: lo gobierna un administrador de Pernambuco, así
 * que queda en su estado, como el territorio sin municipio de Uruguay (D129).
 */
const WITHOUT_PREFEITURA = new Set([2605459]);

/** Sin tildes, en minúscula y con un solo espacio: para comparar grafías. */
function fold(/** @type {string} */ text) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @typedef {{ id: number, nome: string, ufId: number, ufSigla: string, ufNome: string }} MunicipioRecord
 * @typedef {{
 *   slug: string, name: string, parentSlug: string, path: string,
 *   description: string, code: string,
 * }} Level4Row
 */

/**
 * Una fila por municipio, cada uno con su prefeitura. El slug lleva la sigla
 * de la UF y no el slug del estado, para que los errores de 0016 no queden en
 * miles de URLs nuevas; hay 232 nombres repetidos entre estados, ninguno
 * dentro de uno. Sin coordenadas: la API no las trae.
 *
 * @param {ReadonlyArray<MunicipioRecord>} municipios
 * @returns {Level4Row[]}
 */
export function buildBrasilLevel4Rows(municipios) {
  const slugs = new Set();
  const rows = [];
  for (const record of municipios) {
    if (record.ufId === FEDERAL_DISTRICT || WITHOUT_PREFEITURA.has(record.id)) {
      continue;
    }
    const state = STATES.get(record.ufId);
    if (!state) throw new Error(`UF desconocida: ${record.ufId}`);
    if (
      record.ufSigla !== state.sigla ||
      fold(record.ufNome) !== fold(state.name)
    ) {
      throw new Error(
        `La UF ${record.ufId} no coincide: ${record.ufSigla} ${record.ufNome}`,
      );
    }
    const name = record.nome.trim().replace(/\s+/g, " ");
    if (!name) throw new Error(`Municipio sin nombre: ${record.id}`);

    const slug = `brasil-${state.sigla.toLowerCase()}-${slugify(name)}`;
    if (slugs.has(slug)) throw new Error(`Slug repetido: ${slug}`);
    slugs.add(slug);
    rows.push({
      slug,
      name,
      parentSlug: state.slug,
      path: `${BRASIL_PATH}.${state.slug}.${slug}`,
      description: `Municipio del estado de ${state.name}`,
      code: String(record.id),
    });
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path, "en"));
}

/**
 * @param {ReadonlyArray<Level4Row>} rows
 * @param {{ fetchedAt: string }} options
 * @returns {string}
 */
export function renderBrasilDraftSql(rows, { fetchedAt }) {
  return renderLevel4DraftSql(rows, {
    number: "0085",
    title: "Municipios de Brasil como nivel 4 (D137)",
    generator: "scripts/build-brasil-level4-draft.mjs",
    countryPath: BRASIL_PATH,
    parentLabel: "STATE",
    header: [
      "Va después de 0076 y de los borradores de Uruguay a Venezuela.",
      "",
      "Fuente: API de localidades del IBGE (servicodados.ibge.gov.br, datos",
      `públicos del Estado brasileño, con atribución), consultada el ${fetchedAt}.`,
      `${rows.length} municipios bajo sus 26 estados; el Distrito Federal no tiene`,
      "municipios y queda en su nivel 3, como Fernando de Noronha, distrito",
      "estadual sin prefeitura. Sin coordenadas: el GPS del onboarding sugiere",
      "el estado.",
    ],
  });
}
