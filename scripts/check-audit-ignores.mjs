#!/usr/bin/env node
/**
 * Verifica la lista de advisories que `pnpm audit` ignora.
 *
 * `pnpm-workspace.yaml` tenía cuatro GHSA ignorados sin motivo ni fecha, y el
 * audit de CI terminaba rojo igual por otros treinta. Una excepción sin dueño
 * se vuelve permanente: este chequeo exige que cada entrada diga qué paquete
 * es, por qué ruta llega, por qué no alcanza al Worker ni al bundle y hasta
 * cuándo vale, y que las dos claves que leen las distintas versiones de pnpm
 * (`auditConfig.ignoreGhsas` y `audit.ignore`) digan exactamente lo mismo.
 *
 *   node scripts/check-audit-ignores.mjs                 # lint: avisa vencidos
 *   node scripts/check-audit-ignores.mjs --fail-on-expired  # job semanal
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GHSA_PATTERN = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
const REVIEW_PATTERN = /revisar antes de (\d{4}-\d{2}-\d{2})\s*$/;
const OWNER_EXCEPTION_PATTERN = /^excepci[oó]n del responsable \(D\d+\)/i;

/**
 * Versiones de cada paquete en `packages:` del lockfile, sin el sufijo de
 * peers entre paréntesis. Parser mínimo para el formato de pnpm 9/11.
 */
export function lockfilePackageVersions(lockfile) {
  const versions = new Map();
  let inPackages = false;
  for (const line of lockfile.split(/\r?\n/)) {
    if (/^[a-zA-Z]/.test(line)) {
      inPackages = line === "packages:";
      continue;
    }
    if (!inPackages) continue;
    const match = line.match(/^ {2}'?((?:@[^/\s']+\/)?[^@\s']+)@([^(\s':]+)/);
    if (!match) continue;
    const list = versions.get(match[1]) ?? [];
    if (!list.includes(match[2])) list.push(match[2]);
    versions.set(match[1], list);
  }
  return versions;
}

// Paquetes que sí llegan al Worker o al navegador. Un advisory sobre ellos se
// arregla o lo decide el responsable con una excepción propia (D100): el
// primer segmento nombra el paquete con TODAS sus versiones presentes en el
// lockfile (`zod@3.25.76,4.6.7`), el motivo empieza con "excepción del
// responsable (Dn)" y la fecha de revisión es obligatoria. Si el árbol cambia
// (otra versión, una copia más, una menos) la excepción deja de valer y el
// lint falla hasta que alguien la vuelva a mirar. Nunca entra como dev-only.
export const RUNTIME_PACKAGES = Object.freeze([
  "@qwik.dev/core",
  "@qwik.dev/router",
  "@supabase/ssr",
  "@supabase/supabase-js",
  "zod",
]);

/**
 * Lee una lista `- GHSA-…` bajo `topKey:` → `listKey:` con el comentario
 * inmediatamente anterior de cada entrada. No es un parser YAML general: sólo
 * entiende la forma que usa este repo, y cualquier otra cosa es un error.
 */
export function readIgnoreList(source, topKey, listKey) {
  const lines = source.split(/\r?\n/);
  const topIndex = lines.indexOf(`${topKey}:`);
  if (topIndex === -1) return null;
  if (lines[topIndex + 1] !== `  ${listKey}:`) return null;
  const entries = [];
  let pendingComment = null;
  for (const line of lines.slice(topIndex + 2)) {
    if (!line.startsWith("    ")) break;
    const comment = line.match(/^ {4}# (.*)$/);
    if (comment) {
      pendingComment = comment[1].trim();
      continue;
    }
    const item = line.match(/^ {4}- (\S+)\s*$/);
    if (!item) {
      entries.push({ id: line.trim(), comment: null, malformed: true });
      pendingComment = null;
      continue;
    }
    entries.push({ id: item[1], comment: pendingComment, malformed: false });
    pendingComment = null;
  }
  return entries;
}

function isValidDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validateAuditIgnores(
  source,
  {
    today = new Date().toISOString().slice(0, 10),
    failOnExpired = false,
    lockfileVersions = new Map(),
  } = {},
) {
  const errors = [];
  const warnings = [];
  const legacy = readIgnoreList(source, "auditConfig", "ignoreGhsas");
  const current = readIgnoreList(source, "audit", "ignore");
  if (!legacy) errors.push("Falta auditConfig.ignoreGhsas.");
  if (!current) errors.push("Falta audit.ignore.");
  if (!legacy || !current) return { errors, warnings, entries: [] };

  const legacyIds = legacy.map((entry) => entry.id);
  const currentIds = current.map((entry) => entry.id);
  if (JSON.stringify(legacyIds) !== JSON.stringify(currentIds)) {
    errors.push(
      "auditConfig.ignoreGhsas y audit.ignore deben listar los mismos GHSA en el mismo orden.",
    );
  }

  const seen = new Set();
  let nextReview = null;
  current.forEach((entry, index) => {
    const label = entry.id;
    if (entry.malformed || !GHSA_PATTERN.test(entry.id)) {
      errors.push(`${label}: no es un identificador GHSA válido.`);
      return;
    }
    if (seen.has(entry.id)) errors.push(`${label}: está duplicado.`);
    seen.add(entry.id);
    // El comentario de la clave legacy tiene que ser el mismo: si no, alguien
    // actualizó una lista y no la otra.
    if (legacy[index] && legacy[index].comment !== entry.comment) {
      errors.push(`${label}: el motivo difiere entre las dos listas.`);
    }
    if (!entry.comment) {
      errors.push(
        `${label}: falta el comentario "paquete · ruta · motivo · revisar antes de AAAA-MM-DD".`,
      );
      return;
    }
    const parts = entry.comment.split(" · ").map((part) => part.trim());
    if (parts.length < 3 || parts.some((part) => part.length === 0)) {
      errors.push(
        `${label}: el comentario debe tener paquete · ruta · motivo · fecha.`,
      );
    }
    const spec = parts[0].split(/[\s(]/)[0];
    const at = spec.lastIndexOf("@");
    const packageName = at > 0 ? spec.slice(0, at) : spec;
    if (RUNTIME_PACKAGES.includes(packageName)) {
      const declared =
        at > 0
          ? spec
              .slice(at + 1)
              .split(",")
              .sort()
          : [];
      const present = [...(lockfileVersions.get(packageName) ?? [])].sort();
      if (!OWNER_EXCEPTION_PATTERN.test(parts[2] ?? "")) {
        errors.push(
          `${label}: ${packageName} llega al Worker o al bundle; sólo entra como "excepción del responsable (Dn)" con sus versiones exactas.`,
        );
      } else if (declared.length === 0) {
        errors.push(
          `${label}: la excepción de ${packageName} tiene que nombrar sus versiones exactas (${packageName}@a,b).`,
        );
      } else if (JSON.stringify(declared) !== JSON.stringify(present)) {
        errors.push(
          `${label}: el árbol tiene ${packageName}@${present.join(",") || "(ninguna)"} y la excepción se firmó para ${declared.join(",")}; revisarla de nuevo.`,
        );
      }
    }
    const review = entry.comment.match(REVIEW_PATTERN);
    if (!review || !isValidDate(review[1])) {
      errors.push(
        `${label}: falta "revisar antes de AAAA-MM-DD" al final del comentario.`,
      );
      return;
    }
    const reviewDate = review[1];
    if (!nextReview || reviewDate < nextReview) nextReview = reviewDate;
    if (reviewDate < today) {
      const message = `${label}: la revisión venció el ${reviewDate}; reauditar y renovar o borrar la entrada.`;
      if (failOnExpired) errors.push(message);
      else warnings.push(message);
    }
  });

  return { errors, warnings, entries: current, nextReview };
}

const scriptPath = fileURLToPath(import.meta.url);
const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === scriptPath;

if (isMain) {
  const argumentsList = process.argv.slice(2);
  const unknown = argumentsList.filter(
    (value) => value !== "--fail-on-expired",
  );
  if (unknown.length > 0) {
    console.error(`Argumentos desconocidos: ${unknown.join(" ")}`);
    process.exit(2);
  }
  const root = path.resolve(path.dirname(scriptPath), "..");
  const source = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  const lockfileVersions = lockfilePackageVersions(
    readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8"),
  );
  const { errors, warnings, entries, nextReview } = validateAuditIgnores(
    source,
    {
      failOnExpired: argumentsList.includes("--fail-on-expired"),
      lockfileVersions,
    },
  );
  for (const warning of warnings) console.warn(`⚠ ${warning}`);
  if (errors.length > 0) {
    console.error("✗ advisories ignorados sin justificación válida:");
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log(
    `✓ audit ignores · ${entries.length} advisories anotados${nextReview ? ` · próxima revisión ${nextReview}` : ""}`,
  );
}
