#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  lockfilePackageVersions,
  readIgnoreList,
  validateAuditIgnores,
} from "./check-audit-ignores.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function workspace(entries, { legacyEntries = entries } = {}) {
  const render = (list) =>
    list
      .map(([id, comment]) =>
        comment === null ? `    - ${id}` : `    # ${comment}\n    - ${id}`,
      )
      .join("\n");
  return [
    "packages:",
    '  - "."',
    "",
    "auditConfig:",
    "  ignoreGhsas:",
    render(legacyEntries),
    "",
    "audit:",
    "  ignore:",
    render(entries),
    "",
    "allowBuilds:",
    "  esbuild: true",
    "",
  ].join("\n");
}

const valid = [
  [
    "GHSA-5gmw-xhrv-c9v3",
    "tinypool · .>vitest>tinypool · test runner local · revisar antes de 2026-11-19",
  ],
  [
    "GHSA-rfgv-xxqx-mfg5",
    "undici · .>wrangler>miniflare · CLI local · revisar antes de 2026-12-01",
  ],
];

{
  const result = validateAuditIgnores(workspace(valid), {
    today: "2026-10-20",
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.entries.length, 2);
  assert.equal(result.nextReview, "2026-11-19");
}

{
  const entries = readIgnoreList(workspace(valid), "audit", "ignore");
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["GHSA-5gmw-xhrv-c9v3", "GHSA-rfgv-xxqx-mfg5"],
  );
  assert.match(entries[0].comment, /^tinypool/);
  assert.equal(readIgnoreList("packages:\n", "audit", "ignore"), null);
}

// Vencido: aviso en lint, error en el job semanal.
{
  const lint = validateAuditIgnores(workspace(valid), { today: "2026-11-20" });
  assert.deepEqual(lint.errors, []);
  assert.equal(lint.warnings.length, 1);
  assert.match(lint.warnings[0], /GHSA-5gmw-xhrv-c9v3.*venció el 2026-11-19/);
  const weekly = validateAuditIgnores(workspace(valid), {
    today: "2026-11-20",
    failOnExpired: true,
  });
  assert.equal(weekly.errors.length, 1);
  assert.match(weekly.errors[0], /venció/);
}

for (const [description, source, pattern] of [
  [
    "sin comentario",
    workspace([["GHSA-5gmw-xhrv-c9v3", null]]),
    /falta el comentario/,
  ],
  [
    "sin fecha",
    workspace([["GHSA-5gmw-xhrv-c9v3", "tinypool · .>vitest · test runner"]]),
    /revisar antes de/,
  ],
  [
    "fecha imposible",
    workspace([
      [
        "GHSA-5gmw-xhrv-c9v3",
        "tinypool · .>vitest · test runner · revisar antes de 2026-02-30",
      ],
    ]),
    /revisar antes de/,
  ],
  [
    "sin ruta ni motivo",
    workspace([["GHSA-5gmw-xhrv-c9v3", "revisar antes de 2026-11-19"]]),
    /paquete · ruta · motivo/,
  ],
  [
    "identificador inválido",
    workspace([["CVE-2026-0001", "x · y · z · revisar antes de 2026-11-19"]]),
    /GHSA válido/,
  ],
  ["duplicado", workspace([valid[0], valid[0]]), /duplicado/],
  [
    "listas distintas",
    workspace(valid, { legacyEntries: [valid[0]] }),
    /mismos GHSA/,
  ],
  [
    "motivo distinto entre listas",
    workspace(valid, {
      legacyEntries: [
        valid[0],
        [
          valid[1][0],
          "undici · otra ruta · otro motivo · revisar antes de 2026-12-01",
        ],
      ],
    }),
    /motivo difiere/,
  ],
  [
    "paquete de runtime",
    workspace([
      [
        "GHSA-x586-xvc8-g7q6",
        "@qwik.dev/core · . · falso positivo de semver · revisar antes de 2026-11-19",
      ],
    ]),
    /llega al Worker o al bundle/,
  ],
  [
    "falta audit.ignore",
    "auditConfig:\n  ignoreGhsas:\n    # a · b · c · revisar antes de 2026-11-19\n    - GHSA-5gmw-xhrv-c9v3\n",
    /Falta audit\.ignore/,
  ],
]) {
  const { errors } = validateAuditIgnores(source, { today: "2026-10-20" });
  assert.match(errors.join("\n"), pattern, description);
}

// El archivo real del repo cumple la forma (las fechas pueden vencer: eso lo
// reporta el job semanal, no este test).
{
  const source = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const lockfileVersions = lockfilePackageVersions(
    readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"),
  );
  const { errors, entries } = validateAuditIgnores(source, {
    today: "2026-10-20",
    lockfileVersions,
  });
  assert.deepEqual(errors, []);
  assert.ok(entries.length > 0);
  // El advisory de @qwik.dev/core entra sólo como excepción del responsable
  // con su versión exacta (D100), nunca como dev-only.
  const qwik = entries.find((entry) => entry.id === "GHSA-x586-xvc8-g7q6");
  assert.ok(qwik, "la excepción de Qwik core está anotada");
  assert.match(
    qwik.comment,
    /^@qwik\.dev\/core@2\.0\.0-beta\.40 · .* · excepción del responsable \(D100\)/,
  );
  // Un lockfile distinto la invalida: es el control contra cambios del árbol.
  assert.match(
    validateAuditIgnores(source, {
      today: "2026-10-20",
      lockfileVersions: new Map([["@qwik.dev/core", ["2.0.0-beta.41"]]]),
    }).errors[0],
    /el árbol tiene @qwik\.dev\/core@2\.0\.0-beta\.41/,
  );
}

// Un paquete de runtime sólo entra como excepción explícita del responsable,
// atada a la decisión, a la fecha de revisión y a las versiones exactas que
// hay en el lockfile: cualquier cambio del árbol la invalida.
{
  const tree = new Map([
    ["@qwik.dev/core", ["2.0.0-beta.40"]],
    ["zod", ["3.25.76", "4.6.7"]],
  ]);
  const check = (comment) =>
    validateAuditIgnores(workspace([["GHSA-x586-xvc8-g7q6", comment]]), {
      today: "2026-10-29",
      lockfileVersions: tree,
    }).errors;
  assert.match(
    check(
      "@qwik.dev/core · .>@qwik.dev/core · rango mal escrito · revisar antes de 2026-11-19",
    )[0],
    /sólo entra como "excepción del responsable/,
  );
  assert.match(
    check(
      "@qwik.dev/core · .>@qwik.dev/core · excepción del responsable (D100): rango sin punto · revisar antes de 2026-11-19",
    )[0],
    /versiones exactas/,
  );
  assert.match(
    check(
      "@qwik.dev/core@2.0.0-beta.41 · .>@qwik.dev/core · excepción del responsable (D100): rango sin punto · revisar antes de 2026-11-19",
    )[0],
    /el árbol tiene @qwik.dev\/core@2.0.0-beta.40/,
  );
  assert.deepEqual(
    check(
      "@qwik.dev/core@2.0.0-beta.40 · .>@qwik.dev/core · excepción del responsable (D100): rango sin punto · revisar antes de 2026-11-19",
    ),
    [],
  );
  // Dos copias: hay que nombrarlas todas, en cualquier orden.
  const zod = (spec) =>
    validateAuditIgnores(
      workspace([
        [
          "GHSA-mrhx-c7xc-m3w5",
          `${spec} · .>@qwik.dev/router>zod · excepción del responsable (D100): sin arreglo en 3.x · revisar antes de 2026-11-19`,
        ],
      ]),
      { today: "2026-10-29", lockfileVersions: tree },
    ).errors;
  assert.deepEqual(zod("zod@4.6.7,3.25.76"), []);
  assert.match(zod("zod@3.25.76")[0], /el árbol tiene zod@3.25.76,4.6.7/);
  assert.match(
    validateAuditIgnores(
      workspace([
        [
          "GHSA-x586-xvc8-g7q6",
          "@qwik.dev/core@2.0.0-beta.40 · .>@qwik.dev/core · excepción del responsable (D100): sin fecha",
        ],
      ]),
      { today: "2026-10-29", lockfileVersions: tree },
    ).errors[0],
    /revisar antes de/,
  );
}

// El parser del lockfile ignora los sufijos de peers y las comillas.
{
  const lock = [
    "lockfileVersion: '9.0'",
    "",
    "packages:",
    "",
    "  '@qwik.dev/core@2.0.0-beta.40(prettier@3.9.6)(vite@8.2.4)':",
    "    resolution: {integrity: sha512-x}",
    "",
    "  zod@3.25.76:",
    "    resolution: {integrity: sha512-y}",
    "",
    "  zod@4.6.7:",
    "    resolution: {integrity: sha512-z}",
    "",
    "snapshots:",
    "",
    "  zod@9.9.9: {}",
    "",
  ].join("\n");
  const versions = lockfilePackageVersions(lock);
  assert.deepEqual(versions.get("@qwik.dev/core"), ["2.0.0-beta.40"]);
  assert.deepEqual(versions.get("zod"), ["3.25.76", "4.6.7"]);
}

console.log("Audit ignores policy tests: PASS");
