// Genera supabase/sql-drafts/0085_brasil_local_governments.sql desde la API
// de localidades del IBGE (D137). Se corre a mano:
//   node scripts/build-brasil-level4-draft.mjs
// No lo usa la app ni el Worker.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATES,
  buildBrasilLevel4Rows,
  renderBrasilDraftSql,
} from "./brasil-level4-lib.mjs";

const IBGE = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios";
// 5.569 municipios más Brasília (el Distrito Federal) y Fernando de Noronha
// (distrito estadual), que la API lista como municipios. Otro número es un
// cambio que se revisa.
const EXPECTED_ENTRIES = 5571;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(
  root,
  "supabase/sql-drafts/0085_brasil_local_governments.sql",
);

const response = await fetch(IBGE, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`IBGE respondió ${response.status}`);
const municipios = await response.json();
if (!Array.isArray(municipios) || municipios.length !== EXPECTED_ENTRIES) {
  throw new Error(
    `IBGE devolvió ${municipios?.length} municipios; se esperaban ${EXPECTED_ENTRIES}`,
  );
}

// La UF viene por la microrregión o, en los municipios nuevos que no la
// tienen, por la región inmediata.
const rows = buildBrasilLevel4Rows(
  municipios.map((m) => {
    const uf =
      m.microrregiao?.mesorregiao?.UF ??
      m["regiao-imediata"]?.["regiao-intermediaria"]?.UF;
    if (!uf) throw new Error(`Municipio sin UF: ${m.id} (${m.nome})`);
    return {
      id: m.id,
      nome: m.nome,
      ufId: uf.id,
      ufSigla: uf.sigla,
      ufNome: uf.nome,
    };
  }),
);

const present = new Set(rows.map((row) => row.parentSlug));
const absent = [...STATES.values()].filter((s) => !present.has(s.slug));
if (absent.length) {
  throw new Error(
    `Estados sin municipios: ${absent.map((s) => s.name).join(", ")}`,
  );
}

const fetchedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(output, renderBrasilDraftSql(rows, { fetchedAt }));
process.stdout.write(
  `${rows.length} filas en ${path.relative(root, output)}\n`,
);
