/**
 * Pruebas de `check-db-contract.mjs`.
 *
 * Los fixtures se escriben en un directorio temporal en vez de vivir como
 * `.ts` sueltos en el repo: así no entran en `tsc`, ESLint ni en el escaneo
 * real de `src/`, y cada caso muestra entero lo que está probando.
 *
 * La última parte corre el chequeo contra el repo de verdad: el código actual
 * tiene que ser coherente con `src/lib/database.types.ts`.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  analyze,
  formatReport,
  migrationCreates,
  parseArgs,
  parseDatabaseTypes,
  parseLedger,
  scanSource,
} from "./check-db-contract.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const script = path.join(repoRoot, "scripts", "check-db-contract.mjs");

const writeTree = (root, files) => {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------------------
// Fixtures

const TYPES = `
export type Json = string | number | boolean | null;
export type Database = {
  graphql_public: {
    Tables: { [_ in never]: never };
    Views: { [_ in never]: never };
    Functions: { graphql: { Args: never; Returns: Json } };
  };
  public: {
    Tables: {
      claims: { Row: { id: string }; Insert: {}; Update: {}; Relationships: [] };
      profiles: { Row: { id: string }; Insert: {}; Update: {}; Relationships: [] };
      notification_preferences: { Row: { id: string }; Insert: {}; Update: {}; Relationships: [] };
    };
    Views: {
      community_stats: { Row: { id: string }; Relationships: [] };
    };
    Functions: {
      is_moderator: { Args: { p_user: string }; Returns: boolean };
      global_search:
        | { Args: { p_query: string }; Returns: Json }
        | { Args: { p_query: string; p_sort: string }; Returns: Json };
      notification_inbox: { Args: never; Returns: Json };
      create_data_deletion_request: { Args: { p: string }; Returns: Json };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
  storage: {
    Tables: { buckets: { Row: { id: string } } };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
  };
};
`;

const SOURCE_QUOTES = `
// .rpc("fantasma_en_comentario") no cuenta: es un comentario.
export async function load(db: any, admin: any, id: string) {
  await db.rpc("is_moderator", { p_user: id });
  await db.rpc('global_search', { p_query: "x" });
  await db.from(\`claims\`).select("id");
  await db
    .from("profiles")
    .select("id");
  await db.from('community_stats').select("*");
  await admin.storage.from("avatars").download("a");
  await admin.storage
    .from("claims")
    .remove(["a"]);
  const bytes = Array.from("abc");
  const raw = Uint8Array.from([1, 2]);
  const table = id ? "claims" : "profiles";
  await db.from(table).select("id");
  await db.rpc(\`dyn_\${id}\`);
  await db.schema("private").from("secret_table").select("*");
  return { bytes, raw };
}
`;

const SOURCE_WRAPPER = `
type Name = "create_data_deletion_request";
export function deletionRpc<N extends Name>(db: any, name: N, args: object) {
  return db.rpc(name, args);
}
export const run = (db: any) => deletionRpc(db, "create_data_deletion_request", {});
`;

const SOURCE_TSX = `
export default function Inbox(props: { db: any }) {
  void props.db.rpc("notification_inbox");
  void props.db.from("notification_preferences").select("*");
  return <p>Don't break: .rpc("texto_jsx") es texto, no código.</p>;
}
`;

const SOURCE_SPEC = `
it("x", async () => { await db.rpc("solo_en_spec"); });
`;

const MIGRATIONS = {
  "supabase/migrations/0001_base.sql": `
create table public.claims (id uuid primary key);
create table if not exists public.profiles (id uuid primary key);
create or replace view public.community_stats as select 1 as id;
create function public.is_moderator(p_user uuid) returns boolean
language sql as $$ select true $$;
create function public.global_search(p_query text) returns jsonb
language sql as $$ select '{}'::jsonb $$;
-- create table public.comentada (id int);
/* create function public.tambien_comentada() */
create function private.helper() returns void language sql as $$ $$;
`,
  "supabase/migrations/0002_search.sql": `
create or replace function public.global_search(p_query text, p_sort text)
returns jsonb language sql as $$ select '{}'::jsonb $$;
`,
  "supabase/migrations/0003_deletions.sql": `
create function public.create_data_deletion_request(p text) returns jsonb
language sql as $$ select '{}'::jsonb $$;
`,
  "supabase/migrations/0004_notifications.sql": `
create table "public"."notification_preferences" (id uuid primary key);
create function public.notification_inbox() returns jsonb
language sql as $$ select '{}'::jsonb $$;
create function public.sin_uso() returns void language sql as $$ $$;
`,
  "supabase/migrations/0005_data_only.sql": `
update public.profiles set id = id where false;
`,
};

const fixture = (extra = {}) => {
  const root = mkdtempSync(path.join(tmpdir(), "db-contract-"));
  writeTree(root, {
    "src/lib/database.types.ts": TYPES,
    "src/lib/queries.ts": SOURCE_QUOTES,
    "src/lib/wrapper.ts": SOURCE_WRAPPER,
    "src/components/Inbox.tsx": SOURCE_TSX,
    "src/lib/queries.spec.ts": SOURCE_SPEC,
    ...MIGRATIONS,
    ...extra,
  });
  return root;
};

const names = (list) => list.map((u) => u.name);

// ---------------------------------------------------------------------------
// Unidades

test("parseDatabaseTypes lee sólo public, con sobrecargas y secciones vacías", () => {
  const types = parseDatabaseTypes(TYPES);
  assert.deepEqual([...types.tables].sort(), [
    "claims",
    "notification_preferences",
    "profiles",
  ]);
  assert.deepEqual([...types.views], ["community_stats"]);
  assert.ok(types.functions.has("global_search"));
  assert.ok(!types.functions.has("graphql"));
  assert.ok(!types.tables.has("buckets"));
});

test("parseDatabaseTypes falla fuerte si los tipos no tienen la forma esperada", () => {
  assert.throws(
    () => parseDatabaseTypes("export type Other = {};"),
    /Database/,
  );
  assert.throws(
    () =>
      parseDatabaseTypes(
        "export type Database = { public: { Tables: { [_ in never]: never }; Functions: { [_ in never]: never } } };",
      ),
    /mal generados/,
  );
});

test("scanSource reconoce comillas dobles, simples y template sin interpolación", () => {
  const { usages, dynamic } = scanSource(SOURCE_QUOTES, "src/lib/queries.ts");
  const rpc = usages.filter((u) => u.kind === "rpc");
  const rel = usages.filter((u) => u.kind === "relation");
  const buckets = usages.filter((u) => u.kind === "bucket");
  assert.deepEqual(names(rpc), ["is_moderator", "global_search"]);
  assert.deepEqual(names(rel.filter((u) => u.schema === "public")), [
    "claims",
    "profiles",
    "community_stats",
  ]);
  assert.deepEqual(names(buckets), ["avatars", "claims"]);
  assert.deepEqual(
    rel.filter((u) => u.schema !== "public").map((u) => [u.schema, u.name]),
    [["private", "secret_table"]],
  );
  assert.deepEqual(
    dynamic.map((d) => d.expression),
    ["table", "`dyn_${id}`"],
  );
  // Línea del `.from("profiles")` encadenado en varias líneas.
  assert.equal(rel.find((u) => u.name === "profiles").line, 7);
});

test("scanSource ignora comentarios, Array.from y texto JSX con apóstrofos", () => {
  const all = [
    ...scanSource(SOURCE_QUOTES, "q.ts").usages,
    ...scanSource(SOURCE_TSX, "Inbox.tsx").usages,
  ];
  assert.ok(!names(all).includes("fantasma_en_comentario"));
  assert.ok(!names(all).includes("texto_jsx"));
  assert.ok(!names(all).includes("abc"));
  assert.deepEqual(names(scanSource(SOURCE_TSX, "Inbox.tsx").usages), [
    "notification_inbox",
    "notification_preferences",
  ]);
});

test("scanSource detecta envoltorios que reenvían el nombre a .rpc", () => {
  const { usages, dynamic, wrappers } = scanSource(SOURCE_WRAPPER, "w.ts");
  assert.equal(usages.length, 0);
  assert.equal(dynamic.length, 0);
  assert.deepEqual(
    wrappers.map((w) => [w.kind, w.function, w.index]),
    [["rpc", "deletionRpc", 1]],
  );
});

test("migrationCreates sólo cuenta public y descarta comentarios", () => {
  const created = migrationCreates(
    MIGRATIONS["supabase/migrations/0001_base.sql"],
  );
  assert.deepEqual(
    created.map((c) => `${c.kind}:${c.name}`),
    [
      "rpc:is_moderator",
      "rpc:global_search",
      "relation:claims",
      "relation:profiles",
      "relation:community_stats",
    ],
  );
  const quoted = migrationCreates(
    MIGRATIONS["supabase/migrations/0004_notifications.sql"],
  );
  assert.ok(quoted.some((c) => c.name === "notification_preferences"));
  assert.equal(
    migrationCreates("CREATE OR REPLACE FUNCTION Public.X_y()")[0].name,
    "X_y",
  );
});

test("parseLedger entiende la tabla de supabase migration list", () => {
  const { applied } = parseLedger(`
Connecting to remote database...

   Local | Remote | Time (UTC)
  -------|--------|---------------------
   0001  | 0001   | 0001
   0002  | 0002   | 0002
   0003  |        | 0003
         | 0099   | 0099
`);
  assert.deepEqual([...applied].sort(), ["0001", "0002", "0099"]);
});

test("parseLedger entiende la tabla con backticks del CLI 2.115.0", () => {
  // Salida real de `supabase migration list` 2.115.0: cada celda va entre
  // backticks, también la de Time, y la tabla llega precedida de líneas de
  // conexión. La columna Remote sigue decidiendo qué cuenta como aplicada.
  const { applied, ignored } = parseLedger(`
Connecting to remote database...

   Local  | Remote | Time (UTC) ${""}
  --------|--------|------------
   \`0001\` | \`0001\` | \`0001\`     ${""}
   \`0002\` | \`0002\` | \`0002\`     ${""}
   \`0003\` |        | \`0003\`     ${""}
   \`0004\` | \`\`     | \`0004\`     ${""}
          | \`0099\` | \`0099\`     ${""}
`);
  assert.deepEqual([...applied].sort(), ["0001", "0002", "0099"]);
  assert.deepEqual(ignored, ["Connecting to remote database..."]);
});

test("parseLedger acepta filas con y sin backticks en la misma tabla", () => {
  const { applied, ignored } = parseLedger(
    "Local | Remote | Time\n0001 | 0001 | 0001\n`0002` | `0002` | `0002`\n`0003` | 0003 | x\n",
  );
  assert.deepEqual([...applied].sort(), ["0001", "0002", "0003"]);
  assert.deepEqual(ignored, []);
});

test("parseLedger sólo quita un par exterior de backticks y no relaja la columna Remote", () => {
  const text = [
    "Local | Remote | Time",
    "`0005` | `abc` | `0005`", // Remote no numérico: línea ignorada
    "`0006` | `00x6` | `0006`", // dígitos mezclados: ignorada
    "`0007` | ``0007`` | `0007`", // backticks dobles: no es un valor limpio
    "`0008` | `0008`| `0008`", // espacios irregulares alrededor del valor
    "`basura`", // una sola columna sin número
    "`0009`", // una sola columna con número
  ].join("\n");
  const { applied, ignored } = parseLedger(text);
  assert.deepEqual([...applied].sort(), ["0008", "0009"]);
  assert.deepEqual(ignored, [
    "`0005` | `abc` | `0005`",
    "`0006` | `00x6` | `0006`",
    "`0007` | ``0007`` | `0007`",
    "`basura`",
  ]);
});

test("un ledger con backticks pero sin Remote aplicado sigue fallando cerrado", () => {
  const headerOnly = parseLedger(
    "   Local  | Remote | Time (UTC)\n  --------|--------|------------\n   `0001` |        | `0001`\n",
  );
  assert.equal(headerOnly.applied.size, 0);
  assert.deepEqual(headerOnly.ignored, []);
  const root = fixture();
  try {
    assert.throws(
      () =>
        analyze({
          root,
          ledgerText: "Local | Remote | Time\n`0001` | `` | `0001`\n",
        }),
      /ledger no tiene ninguna migración aplicada reconocible/,
    );
    assert.throws(
      () => analyze({ root, ledgerText: "`basura`\n" }),
      /ledger no tiene ninguna migración aplicada reconocible/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseLedger entiende el JSON que el CLI 2.115.0 emite por un pipe", () => {
  // Captura real de `supabase migration list --project-ref …` con stdout
  // redirigido: sin terminal no hay tabla sino este objeto. Es lo que recibe
  // `pnpm db.contract.remote`. `remote` decide igual que la columna Remote.
  const { applied, ignored } = parseLedger(
    JSON.stringify({
      migrations: [
        { local: "0001", remote: "0001", time: "0001" },
        { local: "0002", remote: "0002", time: "0002" },
        { local: "0003", remote: "", time: "0003" },
        { local: "0004", time: "0004" },
        { local: "", remote: "0099", time: "0099" },
        { local: "0005", remote: "abc", time: "0005" },
      ],
    }) + "\n",
  );
  assert.deepEqual([...applied].sort(), ["0001", "0002", "0099"]);
  assert.deepEqual(ignored, [
    JSON.stringify({ local: "0005", remote: "abc", time: "0005" }),
  ]);
});

test("un JSON que no es la forma exacta del CLI falla cerrado", () => {
  for (const text of [
    '{"migrations":',
    '{"foo":[{"remote":"0001"}]}',
    '{"migrations":{}}',
    '{"migrations":[]}',
    '{"migrations":[{"local":"0001","remote":1}]}',
    '[{"remote":"0001"}]',
  ]) {
    const { applied } = parseLedger(text);
    assert.equal(applied.size, 0, text);
  }
  const root = fixture();
  try {
    assert.throws(
      () => analyze({ root, ledgerText: '{"migrations":[]}\n' }),
      /ledger no tiene ninguna migración aplicada reconocible/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parseLedger entiende un número por línea, con nombre o comentario", () => {
  const { applied, ignored } = parseLedger(
    "0001\n0002_search.sql\n# comentario\n\n0004  # aplicada a mano\nbasura\n",
  );
  assert.deepEqual([...applied].sort(), ["0001", "0002", "0004"]);
  assert.deepEqual(ignored, ["basura"]);
});

test("parseArgs valida opciones", () => {
  assert.equal(parseArgs(["--json"]).json, true);
  assert.equal(parseArgs(["--ledger", "x.txt"]).ledger, "x.txt");
  assert.equal(parseArgs(["--ledger=y.txt"]).ledger, "y.txt");
  assert.throws(() => parseArgs(["--ledger"]), /necesita un valor/);
  assert.throws(() => parseArgs(["--ledger", "--json"]), /necesita un valor/);
  assert.throws(() => parseArgs(["--nada"]), /desconocido/);
});

// ---------------------------------------------------------------------------
// Integración sobre el fixture

test("analyze pasa cuando todo lo usado existe en los tipos (specs excluidas)", () => {
  const root = fixture();
  try {
    const report = analyze({ root });
    assert.equal(report.ok, true, formatReport(report));
    assert.deepEqual(report.missingInTypes, []);
    assert.ok(names(report.used.rpc).includes("create_data_deletion_request"));
    assert.ok(!names(report.used.rpc).includes("solo_en_spec"));
    assert.deepEqual(names(report.used.buckets), ["avatars", "claims"]);
    assert.equal(report.dynamic.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("analyze falla si el código usa una RPC o tabla que no está en los tipos", () => {
  const root = fixture({
    "src/lib/nuevo.ts":
      "export const x = (db: any) => [db.rpc(\"rpc_inexistente\"), db.from('tabla_inexistente')];",
  });
  try {
    const report = analyze({ root });
    assert.equal(report.ok, false);
    assert.deepEqual(
      report.missingInTypes.map((u) => `${u.kind}:${u.name}`),
      ["relation:tabla_inexistente", "rpc:rpc_inexistente"],
    );
    assert.deepEqual(report.missingInTypes[1].sites, ["src/lib/nuevo.ts:1"]);
    const text = formatReport(report);
    assert.match(text, /rpc rpc_inexistente — src\/lib\/nuevo\.ts:1/);
    assert.match(text, /FALLA/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--ledger agrupa por migración pendiente lo nuevo y lo redefinido", () => {
  const root = fixture();
  try {
    const report = analyze({ root, ledgerText: "0001\n0003\n" });
    assert.equal(report.ok, false);
    const byVersion = Object.fromEntries(
      report.ledger.pending.map((p) => [
        p.version,
        p.objects.map((o) => `${o.kind}:${o.name}:${o.status}`),
      ]),
    );
    assert.deepEqual(byVersion, {
      "0002": ["rpc:global_search:redefinida"],
      "0004": [
        "rpc:notification_inbox:nueva",
        "relation:notification_preferences:nueva",
      ],
      "0005": [],
    });
    assert.deepEqual(report.ledger.blocking, ["0002", "0004"]);
    const text = formatReport(report);
    assert.match(text, /0004_notifications\.sql: el código usa/);
    assert.match(text, /0005_data_only\.sql: el código no usa nada/);
    assert.match(text, /sin aplicar antes 0002, 0004/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--ledger pasa con todo aplicado y avisa lo que sólo tiene el entorno", () => {
  const root = fixture();
  try {
    const report = analyze({
      root,
      ledgerText: "0001\n0002\n0003\n0004\n0005\n0099\n",
    });
    assert.equal(report.ok, true, formatReport(report));
    assert.deepEqual(report.ledger.pending, []);
    assert.deepEqual(report.ledger.remoteOnly, ["0099"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--ledger con una migración pendiente que el código no usa no bloquea", () => {
  const root = fixture();
  try {
    const report = analyze({ root, ledgerText: "0001\n0002\n0003\n0004\n" });
    assert.equal(report.ok, true, formatReport(report));
    assert.deepEqual(
      report.ledger.pending.map((p) => p.version),
      ["0005"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI: códigos de salida y --json", () => {
  const root = fixture();
  try {
    const ledger = path.join(root, "ledger.txt");
    writeFileSync(ledger, "0001\n");
    const ok = spawnSync(process.execPath, [script, "--root", root], {
      encoding: "utf8",
    });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /OK: contrato coherente/);

    const broken = spawnSync(
      process.execPath,
      [script, "--root", root, "--ledger", ledger, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(broken.status, 1, broken.stderr);
    const json = JSON.parse(broken.stdout);
    assert.equal(json.ok, false);
    assert.deepEqual(json.ledger.blocking, ["0002", "0003", "0004"]);

    // El pipe real de `pnpm db.contract.remote`: JSON del CLI por stdin.
    const piped = spawnSync(
      process.execPath,
      [script, "--root", root, "--ledger", "-", "--json"],
      {
        encoding: "utf8",
        input: JSON.stringify({
          migrations: [
            { local: "0001", remote: "0001", time: "0001" },
            { local: "0002", remote: "", time: "0002" },
          ],
        }),
      },
    );
    assert.equal(piped.status, 1, piped.stderr);
    assert.deepEqual(JSON.parse(piped.stdout).ledger.blocking, [
      "0002",
      "0003",
      "0004",
    ]);

    const empty = path.join(root, "vacio.txt");
    writeFileSync(empty, "\n");
    const usage = spawnSync(
      process.execPath,
      [script, "--root", root, "--ledger", empty],
      { encoding: "utf8" },
    );
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /ledger no tiene ninguna migración/);

    const bad = spawnSync(process.execPath, [script, "--nada"], {
      encoding: "utf8",
    });
    assert.equal(bad.status, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Repo real

test("el código del repo es coherente con database.types.ts", () => {
  const report = analyze({ root: repoRoot });
  assert.equal(report.ok, true, formatReport(report));
  // Sanidad: si el escaneo dejara de ver llamadas, el chequeo pasaría vacío.
  assert.ok(report.used.rpc.length > 50, "muy pocas RPCs detectadas");
  assert.ok(report.used.relations.length > 20, "muy pocas tablas detectadas");
  assert.ok(names(report.used.buckets).includes("claims"));
  assert.ok(
    names(report.used.rpc).includes("create_data_deletion_request"),
    "no se resolvió el envoltorio deletionRequestRpc",
  );
  assert.ok(!names(report.used.relations).includes("avatars"));
});

test("con el ledger completo del repo no queda nada pendiente", () => {
  const report = analyze({
    root: repoRoot,
    ledgerText: readdirSync(path.join(repoRoot, "supabase", "migrations")).join(
      "\n",
    ),
  });
  assert.equal(report.ok, true, formatReport(report));
  assert.deepEqual(report.ledger.pending, []);
});

let failed = 0;
// ---------------------------------------------------------------------------
// Scripts de package.json

test("ningún script compara contra el proyecto enlazado (--linked)", () => {
  // Los runbooks prohíben `--linked`: depende de `supabase/.temp`, que puede
  // apuntar a otro proyecto sin que nada lo muestre. El destino va escrito.
  const { scripts } = JSON.parse(
    readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const linked = Object.entries(scripts)
    .filter(([, command]) => /--linked\b/.test(command.replace(/'[^']*'/g, "")))
    .map(([name]) => name);
  assert.deepEqual(linked, []);
  const remote = scripts["db.contract.remote"];
  assert.match(remote, /--project-ref "\$AGORBIS_SUPABASE_PROJECT_REF"/);
  assert.match(remote, /^test -n "\$AGORBIS_SUPABASE_PROJECT_REF" \|\|/);
  assert.match(remote, /check-db-contract\.mjs --ledger -$/);
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed++;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}
if (failed > 0) {
  console.error(`${failed} de ${tests.length} pruebas fallaron`);
  process.exit(1);
}
console.log(`${tests.length} pruebas de check-db-contract OK`);
