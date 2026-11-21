/**
 * Contrato entre el código y el esquema de la base.
 *
 * `tsc` sólo compara el código con `src/lib/database.types.ts`, que se genera
 * de la base LOCAL. Esa base corre todas las migraciones del repo; Producción
 * puede ir atrás (el README declara `0001–0058 + 0060 + 0061` mientras el
 * código ya llama RPCs de `0062–0067`). Desplegar el Worker así rompe en
 * runtime con un 404 de PostgREST y ningún chequeo lo ve venir.
 *
 * Este script hace dos cosas:
 *
 * 1. Sin argumentos: junta cada `.rpc("x")` y `.from("x")` de `src/` (sin
 *    specs) y verifica que exista en `Database["public"]` de los tipos. Atrapa
 *    tipos desactualizados o un `as never` que tapó un nombre mal escrito.
 *    `storage.from("bucket")` es un bucket, no una tabla: se lista aparte.
 *
 * 2. `--ledger <archivo>`: preflight antes de desplegar. Recibe la salida de
 *    `supabase migration list --linked` (o un número de migración por línea),
 *    calcula qué migraciones de `supabase/migrations/` faltan en ese entorno y,
 *    para cada una, qué RPCs/tablas/vistas que usa el código se crean ahí. Si
 *    el código usa algo creado (o redefinido) en una migración pendiente,
 *    falla: o se aplica la migración antes, o no se despliega ese código.
 *
 * Las llamadas con nombre dinámico (`.from(target.table)`) no se pueden
 * resolver sin el chequeo de tipos; se informan como aviso. Los envoltorios
 * del estilo `fn(db, name: N) { return db.rpc(name, …) }` se detectan solos y
 * sus llamadas con literal cuentan como uso real.
 *
 *   node scripts/check-db-contract.mjs
 *   node scripts/check-db-contract.mjs --ledger ledger.txt
 *   node scripts/check-db-contract.mjs --ledger ledger.txt --json
 *
 * Salida: 0 coherente, 1 contrato roto, 2 error de uso o de entrada.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const TYPES_PATH = path.join("src", "lib", "database.types.ts");
export const MIGRATIONS_DIR = path.join("supabase", "migrations");

// ---------------------------------------------------------------------------
// Archivos fuente

/** `src/**\/*.{ts,tsx}` sin specs, sin `database.types.ts` y sin d.ts. */
export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
          continue;
        walk(full);
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.d\.ts$/.test(entry.name) &&
        !/\.(spec|test)\.tsx?$/.test(entry.name) &&
        path.relative(root, full) !== TYPES_PATH
      ) {
        out.push(full);
      }
    }
  };
  walk(path.join(root, "src"));
  return out.sort();
}

const parse = (fileName, text) =>
  ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

/** Texto de un literal sin interpolación; `null` si el nombre es dinámico. */
const literalText = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

const lineOf = (sourceFile, node) =>
  sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

/**
 * Clasifica `x.from(...)`. `storage.from` es Storage; `Array.from`,
 * `Buffer.from`, `Uint8Array.from` y compañía son constructores de JS (todo
 * identificador en mayúscula), no PostgREST.
 */
function classifyFrom(receiver) {
  if (ts.isPropertyAccessExpression(receiver)) {
    if (receiver.name.text === "storage") return { kind: "bucket" };
  } else if (ts.isIdentifier(receiver)) {
    if (receiver.text === "storage") return { kind: "bucket" };
    if (/^[A-Z]/.test(receiver.text)) return null;
  }
  // `db.schema("private").from("x")` apunta a otro schema: no se compara con
  // `public`, pero queda registrado.
  if (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === "schema"
  ) {
    const schema = literalText(receiver.arguments[0]);
    if (schema && schema !== "public") return { kind: "relation", schema };
  }
  return { kind: "relation", schema: "public" };
}

const schemaOfRpc = (receiver) => {
  if (
    ts.isCallExpression(receiver) &&
    ts.isPropertyAccessExpression(receiver.expression) &&
    receiver.expression.name.text === "schema"
  ) {
    const schema = literalText(receiver.arguments[0]);
    if (schema) return schema;
  }
  return "public";
};

/** Nombres de parámetros de una función (sólo identificadores simples). */
const parameterNames = (fn) =>
  fn.parameters.map((p) => (ts.isIdentifier(p.name) ? p.name.text : null));

/** Nombre con el que se invoca una función declarada o asignada a const. */
function functionName(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  const parent = fn.parent;
  if (
    (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) &&
    parent &&
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name)
  )
    return parent.name.text;
  return null;
}

/** Función más cercana que contiene al nodo. */
function enclosingFunction(node) {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isMethodDeclaration(cur)
    )
      return cur;
  }
  return null;
}

/**
 * Recorre un archivo y devuelve:
 * - `usages`: llamadas con nombre literal ({kind, name, schema, file, line}).
 * - `dynamic`: llamadas cuyo nombre no es literal.
 * - `wrappers`: funciones que reenvían un parámetro a `.rpc`/`.from`.
 */
export function scanSource(text, file) {
  const sourceFile = parse(file, text);
  const usages = [];
  const dynamic = [];
  const wrappers = [];

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      (node.expression.name.text === "rpc" ||
        node.expression.name.text === "from")
    ) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      const target =
        method === "rpc"
          ? { kind: "rpc", schema: schemaOfRpc(receiver) }
          : classifyFrom(receiver);
      if (target) {
        const arg = node.arguments[0];
        const name = literalText(arg);
        const line = lineOf(sourceFile, node);
        if (name !== null) {
          usages.push({ ...target, name, file, line });
        } else if (arg) {
          // ¿Es un parámetro de la función que lo contiene? Entonces es un
          // envoltorio y se resuelve en sus llamadas.
          const fn = enclosingFunction(node);
          const fnName = fn && functionName(fn);
          const index =
            fn && ts.isIdentifier(arg)
              ? parameterNames(fn).indexOf(arg.text)
              : -1;
          if (fnName && index >= 0) {
            wrappers.push({ ...target, function: fnName, index, file, line });
          } else {
            dynamic.push({
              ...target,
              expression: arg.getText(sourceFile),
              file,
              line,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { usages, dynamic, wrappers, sourceFile };
}

/** Resuelve las llamadas `wrapper(..., "literal", ...)` de un archivo. */
export function resolveWrapperCalls(sourceFile, wrappers) {
  if (wrappers.length === 0) return [];
  const byName = new Map();
  for (const w of wrappers) {
    if (!byName.has(w.function)) byName.set(w.function, []);
    byName.get(w.function).push(w);
  }
  const usages = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      for (const w of byName.get(node.expression.text) ?? []) {
        const name = literalText(node.arguments[w.index]);
        if (name !== null) {
          usages.push({
            kind: w.kind,
            schema: w.schema,
            name,
            file: sourceFile.fileName,
            line: lineOf(sourceFile, node),
            via: w.function,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return usages;
}

/** Escanea `src/` completo con dos pasadas (envoltorios después). */
export function collectUsages(root, files = listSourceFiles(root)) {
  const scanned = files.map((full) => {
    const rel = path.relative(root, full).split(path.sep).join("/");
    return scanSource(readFileSync(full, "utf8"), rel);
  });
  const wrappers = scanned.flatMap((s) => s.wrappers);
  const usages = scanned.flatMap((s) => [
    ...s.usages,
    ...resolveWrapperCalls(s.sourceFile, wrappers),
  ]);
  return {
    files: files.length,
    usages,
    dynamic: scanned.flatMap((s) => s.dynamic),
    wrappers: wrappers.map(({ kind, function: fn, index, file, line }) => ({
      kind,
      function: fn,
      index,
      file,
      line,
    })),
  };
}

// ---------------------------------------------------------------------------
// database.types.ts

const memberNames = (typeNode) => {
  // `{ [_ in never]: never }` es un MappedType: sección vacía.
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return [];
  return typeNode.members
    .map((m) => (m.name ? (literalText(m.name) ?? m.name.text) : null))
    .filter((name) => typeof name === "string");
};

const memberType = (typeNode, name) => {
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
  const member = typeNode.members.find(
    (m) =>
      ts.isPropertySignature(m) &&
      m.name &&
      (literalText(m.name) ?? m.name.text) === name,
  );
  return member?.type ?? null;
};

/**
 * Extrae Tables, Views y Functions de `Database["public"]`. Usa el AST y no
 * expresiones regulares para que una sobrecarga (`name: | {…} | {…}`) o un
 * cambio de formato del generador no rompan el chequeo en silencio.
 */
export function parseDatabaseTypes(text, schema = "public") {
  const sourceFile = parse("database.types.ts", text);
  const alias = sourceFile.statements.find(
    (s) => ts.isTypeAliasDeclaration(s) && s.name.text === "Database",
  );
  if (!alias) throw new Error("no se encontró `type Database` en los tipos");
  const schemaNode = memberType(alias.type, schema);
  if (!schemaNode)
    throw new Error(`no se encontró el schema "${schema}" en Database`);
  const tables = memberNames(memberType(schemaNode, "Tables"));
  const views = memberNames(memberType(schemaNode, "Views"));
  const functions = memberNames(memberType(schemaNode, "Functions"));
  if (tables.length === 0 && functions.length === 0)
    throw new Error(
      `Database["${schema}"] no tiene tablas ni funciones: ¿tipos mal generados?`,
    );
  return {
    tables: new Set(tables),
    views: new Set(views),
    functions: new Set(functions),
  };
}

// ---------------------------------------------------------------------------
// Migraciones y ledger

const IDENT = String.raw`"?([A-Za-z_][A-Za-z0-9_]*)"?`;
const SCHEMA = String.raw`(?:"?([A-Za-z_][A-Za-z0-9_]*)"?\s*\.\s*)?`;
const CREATE_PATTERNS = [
  {
    kind: "rpc",
    re: new RegExp(
      String.raw`\bcreate\s+(?:or\s+replace\s+)?function\s+${SCHEMA}${IDENT}\s*\(`,
      "gi",
    ),
  },
  {
    kind: "relation",
    re: new RegExp(
      String.raw`\bcreate\s+(?:(?:temp|temporary|unlogged)\s+)?table\s+(?:if\s+not\s+exists\s+)?${SCHEMA}${IDENT}`,
      "gi",
    ),
  },
  {
    kind: "relation",
    re: new RegExp(
      String.raw`\bcreate\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${SCHEMA}${IDENT}`,
      "gi",
    ),
  },
];

/** Quita comentarios SQL para que un `-- create table x` no cuente. */
const stripSqlComments = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

/** Objetos de `public` que crea (o reemplaza) un archivo de migración. */
export function migrationCreates(sql) {
  const clean = stripSqlComments(sql);
  const out = [];
  for (const { kind, re } of CREATE_PATTERNS) {
    for (const m of clean.matchAll(re)) {
      const schema = (m[1] ?? "public").toLowerCase();
      if (schema !== "public") continue;
      const replace = /\bor\s+replace\b/i.test(m[0]);
      out.push({ kind, name: m[2], replace });
    }
  }
  return out;
}

/** Versión de una migración: el prefijo numérico antes del primer `_`. */
export const migrationVersion = (file) => /^(\d+)_/.exec(file)?.[1] ?? null;

export function listMigrations(root) {
  const dir = path.join(root, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && migrationVersion(f))
    .sort()
    .map((file) => ({
      version: migrationVersion(file),
      file,
      creates: migrationCreates(readFileSync(path.join(dir, file), "utf8")),
    }));
}

/**
 * Celda del ledger sin los backticks con que el CLI de Supabase (desde 2.115.0)
 * envuelve cada valor de la tabla (`` `0001` ``). Sólo quita un par exterior:
 * lo que queda adentro se valida igual que antes, así que `` `abc` `` sigue
 * siendo una línea ignorada y `` `` `` una celda vacía.
 */
const unquoteCell = (cell) =>
  cell
    .trim()
    .replace(/^`([^`]*)`$/, "$1")
    .trim();

/**
 * Forma JSON de `supabase migration list`. Con stdout fuera de una terminal,
 * como en el pipe de `pnpm db.contract.remote`, el CLI 2.115.0 no imprime la
 * tabla sino `{"migrations":[{"local":"0001","remote":"0001","time":"…"},…]}`.
 * Se acepta únicamente esa forma exacta y con la misma regla que la tabla:
 * aplicada sólo si `remote` es numérico; `remote` vacío es pendiente; otro
 * valor deja la entrada como ignorada. Cualquier otro JSON devuelve `null` y
 * cae al parser de líneas, donde no hay versión reconocible y el gate falla
 * cerrado.
 */
function parseJsonLedger(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !Array.isArray(parsed.migrations)
  )
    return null;
  const applied = new Set();
  const ignored = [];
  for (const entry of parsed.migrations) {
    const remote =
      entry && typeof entry.remote === "string" ? entry.remote.trim() : "";
    const version = /^(\d+)$/.exec(remote)?.[1];
    if (version) applied.add(version);
    else if (remote !== "") ignored.push(JSON.stringify(entry));
  }
  return { applied, ignored };
}

/**
 * Versiones aplicadas según un ledger. Acepta:
 * - la tabla de `supabase migration list` (`Local | Remote | Time`), con o sin
 *   backticks por celda: cuenta como aplicada sólo si la columna Remote tiene
 *   valor numérico;
 * - el JSON que el mismo comando emite cuando stdout no es una terminal, con
 *   la misma regla sobre `remote`;
 * - un número de migración por línea (se ignora lo que siga al número).
 * Las líneas vacías, encabezados, separadores y comentarios `#` se ignoran.
 */
export function parseLedger(text) {
  const json = parseJsonLedger(text);
  if (json) return json;
  const applied = new Set();
  const ignored = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line || /^[-|─\s]+$/.test(line)) continue;
    if (line.includes("|")) {
      const cols = line.split("|").map(unquoteCell);
      if (/^local$/i.test(cols[0]) || /^remote$/i.test(cols[1] ?? "")) continue;
      const remote = /^(\d+)$/.exec(cols[1] ?? "")?.[1];
      if (remote) applied.add(remote);
      else if (!/^\d*$/.test(cols[1] ?? "")) ignored.push(raw);
      continue;
    }
    const version = /^(\d+)(?:\b|_)/.exec(unquoteCell(line))?.[1];
    if (version) applied.add(version);
    else ignored.push(raw);
  }
  return { applied, ignored };
}

// ---------------------------------------------------------------------------
// Análisis

const key = (u) => `${u.kind}:${u.name}`;

/** Agrupa usos por nombre con la lista de sitios `archivo:línea`. */
function groupUsages(usages) {
  const map = new Map();
  for (const u of usages) {
    const k = key(u);
    if (!map.has(k)) map.set(k, { kind: u.kind, name: u.name, sites: [] });
    map.get(k).sites.push(`${u.file}:${u.line}`);
  }
  return [...map.values()].sort((a, b) =>
    a.kind === b.kind
      ? a.name.localeCompare(b.name)
      : a.kind.localeCompare(b.kind),
  );
}

export function analyze({ root = defaultRoot, ledgerText = null } = {}) {
  const types = parseDatabaseTypes(
    readFileSync(path.join(root, TYPES_PATH), "utf8"),
  );
  const collected = collectUsages(root);

  const publicUsages = collected.usages.filter(
    (u) => u.kind !== "bucket" && u.schema === "public",
  );
  const used = groupUsages(publicUsages);
  const exists = (u) =>
    u.kind === "rpc"
      ? types.functions.has(u.name)
      : types.tables.has(u.name) || types.views.has(u.name);
  const missingInTypes = used.filter((u) => !exists(u));

  const report = {
    ok: missingInTypes.length === 0,
    files: collected.files,
    used: {
      rpc: used.filter((u) => u.kind === "rpc"),
      relations: used.filter((u) => u.kind === "relation"),
      buckets: groupUsages(collected.usages.filter((u) => u.kind === "bucket")),
      otherSchemas: groupUsages(
        collected.usages.filter(
          (u) => u.kind !== "bucket" && u.schema !== "public",
        ),
      ),
    },
    wrappers: collected.wrappers,
    dynamic: collected.dynamic,
    missingInTypes,
    ledger: null,
  };

  if (ledgerText !== null) {
    const { applied, ignored } = parseLedger(ledgerText);
    if (applied.size === 0)
      throw new UsageError(
        "el ledger no tiene ninguna migración aplicada reconocible",
      );
    const migrations = listMigrations(root);
    const local = new Set(migrations.map((m) => m.version));
    const pending = migrations.filter((m) => !applied.has(m.version));
    const appliedMigrations = migrations.filter((m) => applied.has(m.version));

    // Dónde se define cada objeto en lo ya aplicado.
    const appliedDefs = new Set(
      appliedMigrations.flatMap((m) => m.creates.map(key)),
    );
    const usedByKey = new Map(used.map((u) => [key(u), u]));

    const pendingReport = pending.map((m) => {
      const seen = new Set();
      const objects = [];
      for (const c of m.creates) {
        const k = key(c);
        if (seen.has(k) || !usedByKey.has(k)) continue;
        seen.add(k);
        objects.push({
          kind: c.kind,
          name: c.name,
          // "nueva": no existe en ninguna migración aplicada; el código
          // recibe un 404. "redefinida": existe, pero esta migración la
          // reemplaza o le agrega una sobrecarga que el código puede usar.
          status: appliedDefs.has(k) ? "redefinida" : "nueva",
          sites: usedByKey.get(k).sites,
        });
      }
      return { version: m.version, file: m.file, objects };
    });
    const blocking = pendingReport.filter((p) => p.objects.length > 0);
    report.ledger = {
      applied: [...applied].sort(),
      ignoredLines: ignored,
      pending: pendingReport,
      remoteOnly: [...applied].filter((v) => !local.has(v)).sort(),
      blocking: blocking.map((p) => p.version),
    };
    if (blocking.length > 0) report.ok = false;
  }

  return report;
}

export class UsageError extends Error {}

// ---------------------------------------------------------------------------
// Salida

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const label = (kind) =>
  kind === "rpc" ? "rpc" : kind === "bucket" ? "bucket" : "tabla/vista";
const sitesText = (sites, max = 3) =>
  sites.slice(0, max).join(", ") +
  (sites.length > max ? ` (+${sites.length - max})` : "");

export function formatReport(report) {
  const lines = [];
  lines.push(
    `check-db-contract: ${plural(report.files, "archivo", "archivos")}; ` +
      `${plural(report.used.rpc.length, "RPC", "RPCs")}, ` +
      `${plural(report.used.relations.length, "tabla/vista", "tablas/vistas")}, ` +
      `${plural(report.used.buckets.length, "bucket", "buckets")} ` +
      `(${report.used.buckets.map((b) => b.name).join(", ") || "ninguno"}).`,
  );

  if (report.missingInTypes.length > 0) {
    lines.push("");
    lines.push(
      `El código usa ${plural(report.missingInTypes.length, "objeto", "objetos")} ` +
        `que no existe en ${TYPES_PATH.split(path.sep).join("/")}:`,
    );
    for (const u of report.missingInTypes)
      lines.push(`  ${label(u.kind)} ${u.name} — ${sitesText(u.sites)}`);
    lines.push(
      "  Regenerá los tipos (`pnpm db.types`) o corregí el nombre; si falta la migración, escribila.",
    );
  }

  if (report.used.otherSchemas.length > 0) {
    lines.push("");
    lines.push("Usos fuera de `public` (no se comparan con los tipos):");
    for (const u of report.used.otherSchemas)
      lines.push(`  ${label(u.kind)} ${u.name} — ${sitesText(u.sites)}`);
  }

  if (report.dynamic.length > 0) {
    lines.push("");
    lines.push(
      "Aviso: nombres dinámicos que este chequeo no resuelve (los cubre tsc):",
    );
    for (const d of report.dynamic)
      lines.push(`  ${label(d.kind)} ${d.expression} — ${d.file}:${d.line}`);
  }

  if (report.ledger) {
    const { ledger } = report;
    lines.push("");
    lines.push(
      `Ledger: ${plural(ledger.applied.length, "migración aplicada", "migraciones aplicadas")}; ` +
        `${plural(ledger.pending.length, "pendiente", "pendientes")} en ${MIGRATIONS_DIR.split(path.sep).join("/")}` +
        (ledger.pending.length
          ? ` (${ledger.pending.map((p) => p.version).join(", ")}).`
          : "."),
    );
    if (ledger.remoteOnly.length > 0)
      lines.push(
        `  Aviso: el entorno tiene migraciones que el repo no tiene: ${ledger.remoteOnly.join(", ")}.`,
      );
    if (ledger.ignoredLines.length > 0)
      lines.push(
        `  Aviso: ${plural(ledger.ignoredLines.length, "línea ignorada", "líneas ignoradas")} del ledger.`,
      );
    for (const p of ledger.pending) {
      if (p.objects.length === 0) {
        lines.push(`  ${p.file}: el código no usa nada que se cree acá.`);
        continue;
      }
      lines.push(`  ${p.file}: el código usa lo que crea esta migración:`);
      for (const o of p.objects)
        lines.push(
          `    ${label(o.kind)} ${o.name} (${o.status}) — ${sitesText(o.sites)}`,
        );
    }
    if (ledger.blocking.length > 0)
      lines.push(
        "  No despliegues este código en ese entorno sin aplicar antes " +
          `${ledger.blocking.join(", ")} con el procedimiento del runbook.`,
      );
  }

  lines.push("");
  lines.push(report.ok ? "OK: contrato coherente." : "FALLA: contrato roto.");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI

export function parseArgs(argv) {
  const opts = { json: false, ledger: null, root: defaultRoot };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--ledger" || arg === "--root") {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new UsageError(`${arg} necesita un valor`);
      opts[arg.slice(2)] = value;
    } else if (arg.startsWith("--ledger=")) opts.ledger = arg.slice(9);
    else if (arg.startsWith("--root=")) opts.root = arg.slice(7);
    else throw new UsageError(`argumento desconocido: ${arg}`);
  }
  opts.root = path.resolve(opts.root);
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
    const ledgerText =
      opts.ledger === null
        ? null
        : opts.ledger === "-"
          ? readFileSync(0, "utf8")
          : readFileSync(path.resolve(opts.ledger), "utf8");
    const report = analyze({ root: opts.root, ledgerText });
    console.log(
      opts.json ? JSON.stringify(report, null, 2) : formatReport(report),
    );
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (opts?.json) console.log(JSON.stringify({ ok: false, error: message }));
    else console.error(`check-db-contract: ${message}`);
    return 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = main();
}
