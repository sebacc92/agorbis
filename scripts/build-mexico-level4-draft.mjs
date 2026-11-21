// Genera supabase/sql-drafts/0086_mexico_local_governments.sql desde el
// catálogo geoestadístico del INEGI (D138). Se corre a mano:
//   node scripts/build-mexico-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENTITIES,
  buildMexicoLevel4Rows,
  renderMexicoDraftSql,
} from "./mexico-level4-lib.mjs";

const CATALOG = "https://gaia.inegi.org.mx/wscatgeo";
// 2.462 municipios y 16 alcaldías; otro número es un cambio que se revisa.
const EXPECTED_UNITS = 2478;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0086_mexico_local_governments.sql",
);

/** @param {string} url */
async function datos(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${url} respondió ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body?.datos)) throw new Error(`${url} no trajo datos`);
  return body.datos;
}

const entityNames = new Map(
  (await datos(`${CATALOG}/mgee/`)).map((e) => [e.cve_agee, e.nom_agee]),
);
// El servicio entrega los municipios de a una entidad: una que falle o venga
// vacía corta la generación en vez de dejar un estado sin hijos.
const municipios = [];
for (const code of ENTITIES.keys()) {
  const rows = await datos(`${CATALOG}/v2/mgem/${code}`);
  if (rows.length === 0) throw new Error(`La entidad ${code} vino vacía`);
  municipios.push(
    ...rows.map(({ cvegeo, cve_ent, cve_mun, nomgeo }) => ({
      cvegeo,
      cve_ent,
      cve_mun,
      nomgeo,
    })),
  );
}

const rows = buildMexicoLevel4Rows(municipios, entityNames);
if (rows.length !== EXPECTED_UNITS) {
  throw new Error(
    `Se esperaban ${EXPECTED_UNITS} unidades y hay ${rows.length}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderMexicoDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
