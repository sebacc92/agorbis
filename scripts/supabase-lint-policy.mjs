import { createHash } from "node:crypto";

export const DATABASE_LINT_SCOPES = Object.freeze({
  application: Object.freeze({
    schemas: Object.freeze(["public", "private"]),
    failOn: "warning",
  }),
  managed: Object.freeze({
    schemas: Object.freeze(["auth", "storage"]),
    failOn: "error",
  }),
});

const CLEAN_LINT_PREAMBLE = "No schema errors found";
const PNPM_LINT_PREAMBLE_LF =
  /^Already up to date\nDone in (?:0|[1-9][0-9]*)ms using pnpm v11\.15\.0\n([\s\S]+)$/;
const PNPM_LINT_PREAMBLE_CRLF =
  /^Already up to date\r\nDone in (?:0|[1-9][0-9]*)ms using pnpm v11\.15\.0\r\n([\s\S]+)$/;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  if (
    value === null ||
    ["string", "number", "boolean"].includes(typeof value)
  ) {
    return value;
  }
  throw new Error("db lint devolvió un valor JSON no soportado.");
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function compareCanonical(left, right) {
  const leftJson = canonicalJson(left);
  const rightJson = canonicalJson(right);
  if (leftJson < rightJson) return -1;
  if (leftJson > rightJson) return 1;
  return 0;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function removeSingleTerminalEol(stdout, label) {
  let framed = stdout;
  if (framed.endsWith("\r\n")) framed = framed.slice(0, -2);
  else if (framed.endsWith("\n")) framed = framed.slice(0, -1);
  if (framed.endsWith("\n") || framed.endsWith("\r")) {
    throw new Error(`${label}: db lint contiene más de un EOL terminal.`);
  }
  return framed;
}

export function parseDatabaseLintOutput(stdout, status, label) {
  if (!Number.isInteger(status) || status !== 0) {
    throw new Error(
      `${label}: db lint terminó con exit incompatible ${String(status)}.`,
    );
  }
  if (typeof stdout !== "string" || stdout.length === 0) {
    throw new Error(`${label}: db lint no devolvió stdout.`);
  }
  const framed = removeSingleTerminalEol(stdout, label);
  if (framed.length === 0) {
    throw new Error(`${label}: db lint no devolvió el objeto JSON final.`);
  }

  let candidate;
  let preamble = "none";
  if (framed.startsWith("{")) {
    candidate = framed;
  } else if (framed.startsWith(`${CLEAN_LINT_PREAMBLE}\n`)) {
    candidate = framed.slice(CLEAN_LINT_PREAMBLE.length + 1);
    preamble = "supabase-clean-lf";
  } else if (framed.startsWith(`${CLEAN_LINT_PREAMBLE}\r\n`)) {
    candidate = framed.slice(CLEAN_LINT_PREAMBLE.length + 2);
    preamble = "supabase-clean-crlf";
  } else {
    const pnpmLf = framed.match(PNPM_LINT_PREAMBLE_LF);
    const pnpmCrlf = framed.match(PNPM_LINT_PREAMBLE_CRLF);
    if (pnpmLf) {
      candidate = pnpmLf[1];
      preamble = "pnpm-11.15.0-lf";
    } else if (pnpmCrlf) {
      candidate = pnpmCrlf[1];
      preamble = "pnpm-11.15.0-crlf";
    } else {
      throw new Error(`${label}: db lint contiene un preámbulo desconocido.`);
    }
  }

  if (!candidate.startsWith("{") || !candidate.endsWith("}")) {
    throw new Error(
      `${label}: db lint no termina exactamente con un objeto JSON.`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(candidate);
  } catch {
    throw new Error(
      `${label}: db lint contiene JSON inválido, múltiple o con contenido adicional.`,
    );
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    JSON.stringify(Object.keys(payload).sort()) !==
      JSON.stringify(["message", "results"]) ||
    payload.message !== "db lint" ||
    !Array.isArray(payload.results)
  ) {
    throw new Error(
      `${label}: db lint devolvió una estructura JSON inesperada.`,
    );
  }
  if (preamble.startsWith("supabase-clean-") && payload.results.length !== 0) {
    throw new Error(
      `${label}: el preámbulo limpio de db lint acompaña findings inesperados.`,
    );
  }
  return payload;
}

function functionSchema(functionName, label) {
  const match = functionName.match(/^"?([a-z_][a-z0-9_]*)"?\./i);
  if (!match) {
    throw new Error(
      `${label}: función de db lint sin schema: ${functionName}.`,
    );
  }
  return match[1];
}

function normalizeLintPayload(payload, schemas, label) {
  if (payload?.message !== "db lint" || !Array.isArray(payload.results)) {
    throw new Error(`${label}: db lint no devolvió el formato JSON esperado.`);
  }
  const allowedSchemas = new Set(schemas);
  const findings = [];
  for (const result of payload.results) {
    if (
      !result ||
      typeof result !== "object" ||
      Array.isArray(result) ||
      typeof result.function !== "string" ||
      !Array.isArray(result.issues) ||
      result.issues.length === 0
    ) {
      throw new Error(`${label}: resultado de db lint inválido.`);
    }
    const schema = functionSchema(result.function, label);
    if (!allowedSchemas.has(schema)) {
      throw new Error(
        `${label}: db lint devolvió la función ${result.function} fuera de ${schemas.join(",")}.`,
      );
    }
    const resultMetadata = canonicalize(
      Object.fromEntries(
        Object.entries(result).filter(
          ([key]) => key !== "function" && key !== "issues",
        ),
      ),
    );
    for (const rawIssue of result.issues) {
      if (
        !rawIssue ||
        typeof rawIssue !== "object" ||
        Array.isArray(rawIssue) ||
        typeof rawIssue.level !== "string"
      ) {
        throw new Error(`${label}: issue de db lint inválido.`);
      }
      const issue = canonicalize(rawIssue);
      let severity;
      if (/^warning(?:\s|$)/i.test(issue.level)) severity = "warning";
      else if (/^error(?:\s|$)/i.test(issue.level)) severity = "error";
      else {
        throw new Error(
          `${label}: nivel de db lint desconocido: ${issue.level}.`,
        );
      }
      findings.push({
        schema,
        function: result.function,
        resultMetadata,
        severity,
        issue,
      });
    }
  }
  findings.sort(compareCanonical);
  return findings;
}

function assertSuccessfulExit(status, label) {
  if (status !== 0) {
    throw new Error(`${label}: db lint terminó con exit ${String(status)}.`);
  }
}

export function evaluateApplicationLint(payload, status, label) {
  const findings = normalizeLintPayload(
    payload,
    DATABASE_LINT_SCOPES.application.schemas,
    label,
  );
  if (findings.length > 0) {
    throw new Error(
      `${label}: public/private deben tener cero warnings y cero errors; se encontraron ${findings.length}.`,
    );
  }
  assertSuccessfulExit(status, label);
  return {
    schemas: [...DATABASE_LINT_SCOPES.application.schemas],
    issueCount: 0,
    resultsSha256: sha256("[]"),
    findings: [],
  };
}

export function evaluateManagedLint(payload, status, label) {
  const findings = normalizeLintPayload(
    payload,
    DATABASE_LINT_SCOPES.managed.schemas,
    label,
  );
  const errors = findings.filter((finding) => finding.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `${label}: auth/storage contienen ${errors.length} errors de db lint.`,
    );
  }
  assertSuccessfulExit(status, label);
  const warnings = findings.map(
    ({ schema, function: functionName, resultMetadata, issue }) =>
      canonicalize({
        schema,
        function: functionName,
        resultMetadata,
        issue,
      }),
  );
  return {
    schemas: [...DATABASE_LINT_SCOPES.managed.schemas],
    warningCount: warnings.length,
    warningsSha256: sha256(canonicalJson(warnings)),
    warnings,
  };
}

function multisetDifference(left, right) {
  const remaining = new Map();
  for (const item of right) {
    const key = canonicalJson(item);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  const difference = [];
  for (const item of left) {
    const key = canonicalJson(item);
    const count = remaining.get(key) ?? 0;
    if (count === 0) difference.push(item);
    else if (count === 1) remaining.delete(key);
    else remaining.set(key, count - 1);
  }
  return difference;
}

export function assertManagedLintParity(source, target) {
  const missingFromTarget = multisetDifference(
    source.warnings,
    target.warnings,
  );
  const unexpectedInTarget = multisetDifference(
    target.warnings,
    source.warnings,
  );
  if (missingFromTarget.length > 0 || unexpectedInTarget.length > 0) {
    throw new Error(
      `Las warnings administradas source-target difieren: source=${source.warningsSha256}, target=${target.warningsSha256}, faltantes=${missingFromTarget.length}, inesperadas=${unexpectedInTarget.length}.`,
    );
  }
  if (
    source.warningCount !== target.warningCount ||
    source.warningsSha256 !== target.warningsSha256 ||
    canonicalJson(source.warnings) !== canonicalJson(target.warnings)
  ) {
    throw new Error(
      "Las warnings administradas source-target no coinciden canónicamente.",
    );
  }
  return {
    matchesSource: true,
    warningCount: target.warningCount,
    warningsSha256: target.warningsSha256,
  };
}

export function databaseLintArgs(scope, workdir) {
  const policy = DATABASE_LINT_SCOPES[scope];
  if (!policy) throw new Error(`Scope de db lint desconocido: ${scope}.`);
  const args = ["exec", "supabase", "db", "lint", "--local"];
  if (workdir) args.push("--workdir", workdir);
  args.push(
    "--schema",
    policy.schemas.join(","),
    "--level",
    "warning",
    "--fail-on",
    policy.failOn,
    "--output-format",
    "json",
  );
  return args;
}
