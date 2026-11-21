// D107: salida simple a Producción. Reemplaza como camino obligatorio al
// flujo excepcional de D72 (canary, acta de 60 minutos, cutover por hashes),
// que nunca llegó a ejecutarse porque el executor del canary quedó en
// plan-only. Lo que se conserva es lo que de verdad protege: el request con
// los riesgos aceptados por el responsable, el build abierto con test,
// test.release y el preflight real, el smoke público y la vuelta a CLOSED.
import path from "node:path";
import {
  EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
  renderExceptionalReleaseRequestJson,
} from "./exceptional-release-act.mjs";
import {
  AUTHORIZED_RISK_OWNER,
  OWNER_WAIVER_CANDIDATE_GATE_IDS,
  RELEASE_DISPOSITION,
  RELEASE_GATE_POLICY_SHA256,
  RELEASE_GATE_POLICY_VERSION,
  getReleaseGateDefinition,
} from "./release-gate-policy.mjs";

export const SIMPLE_OPEN_RELEASE_CONFIRMATION = "ACEPTO";
const FULL_HEAD_PATTERN = /^[0-9a-f]{40}$/;

export const SIMPLE_OPEN_RELEASE_MANUAL_CHECKS = Object.freeze([
  "Registrarse con un correo propio nuevo: Turnstile aparece y el alta pasa.",
  "Recibir el correo de confirmación, abrirlo y confirmar con el botón.",
  "Aceptar los documentos legales vigentes y entrar a una comunidad.",
  "Cerrar sesión y volver a entrar con la contraseña.",
  "Pedir recuperación de contraseña, recibir el correo y cambiarla.",
  "Activar TOTP en Perfil > Seguridad y verificar un código.",
  "Crear un reclamo con una foto y ver que la foto carga sólo con sesión.",
  "En las DevTools: sin errores de CSP en consola y cookies de sesión Secure, HttpOnly y SameSite=Lax.",
]);

export function parseSimpleOpenReleaseArguments(argv) {
  if (!Array.isArray(argv) || argv.length > 1) {
    throw new Error("Uso: pnpm deploy:open [--dry-run]");
  }
  if (argv.length === 1 && argv[0] !== "--dry-run") {
    throw new Error("Uso: pnpm deploy:open [--dry-run]");
  }
  return Object.freeze({ dryRun: argv.length === 1 });
}

/**
 * Exige un árbol limpio, en main y alineado con origin/main: lo que se
 * despliega tiene que ser recuperable desde el remoto (D72 lo seguía
 * exigiendo y es barato de cumplir). La prueba sin subir no despliega nada,
 * así que puede correr antes del push.
 */
export function simpleOpenReleaseGitErrors({
  branch,
  head,
  originHead,
  porcelain,
  requireOrigin = true,
}) {
  const errors = [];
  if (porcelain !== "") errors.push("El worktree tiene cambios sin commitear.");
  if (branch !== "main") errors.push("La rama actual no es main.");
  if (!FULL_HEAD_PATTERN.test(head ?? "")) {
    errors.push("No se pudo leer el HEAD completo.");
  } else if (requireOrigin && head !== originHead) {
    errors.push(
      "HEAD no coincide con origin/main: hacé push (y fetch) antes de desplegar.",
    );
  }
  return errors;
}

/** El request de siempre, con los siete riesgos canónicos de la política. */
export function buildSimpleOpenReleaseRequest({ head, now }) {
  const request = {
    schemaVersion: EXCEPTIONAL_RELEASE_REQUEST_SCHEMA_VERSION,
    policyVersion: RELEASE_GATE_POLICY_VERSION,
    policyHash: RELEASE_GATE_POLICY_SHA256,
    head,
    owner: AUTHORIZED_RISK_OWNER,
    timestampUtc: now.toISOString(),
    deploymentAuthorized: false,
    risks: OWNER_WAIVER_CANDIDATE_GATE_IDS.map((gateId) => {
      const definition = getReleaseGateDefinition(gateId);
      return {
        gateId,
        evidenceStatus: definition.evidenceStatus,
        rawResult: definition.rawResult,
        requestedDisposition: RELEASE_DISPOSITION.RISK_ACCEPTED_BY_OWNER,
        acceptedConsequence: definition.consequence,
        reviewRequiredBy: definition.reviewRequiredBy,
      };
    }),
  };
  // Valida contra la política vigente: una fecha de revisión vencida o un
  // gate desconocido bloquean acá, antes de cualquier build.
  return renderExceptionalReleaseRequestJson(request, {
    currentHead: head,
    now,
  });
}

export function simpleOpenReleaseRiskSummary() {
  return OWNER_WAIVER_CANDIDATE_GATE_IDS.map((gateId) => {
    const definition = getReleaseGateDefinition(gateId);
    return `- ${gateId} (revisión hasta ${definition.reviewRequiredBy}): ${definition.consequence}`;
  });
}

export function simpleOpenReleaseRequestPath({ home, now }) {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return path.join(
    home,
    ".local/share/agorbis-release-requests",
    stamp,
    "request.json",
  );
}

export function simpleOpenReleaseSteps({
  root,
  requestPath,
  dryRun,
  nodeExecutable,
}) {
  const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
  const steps = [
    {
      label: "build abierto (test, test.release, build y preflight)",
      command: nodeExecutable,
      arguments: [
        path.join(root, "scripts/cloudflare-build.mjs"),
        "--exceptional-request",
        requestPath,
      ],
    },
    {
      label: dryRun ? "wrangler deploy --dry-run" : "wrangler deploy",
      command: nodeExecutable,
      arguments: [
        wrangler,
        "deploy",
        "--config",
        path.join(root, "wrangler.jsonc"),
        dryRun ? "--dry-run" : "--strict",
        "--no-autoconfig",
      ],
    },
  ];
  if (!dryRun) {
    steps.push({
      label: "smoke público de sólo lectura",
      command: nodeExecutable,
      arguments: [
        path.join(root, "scripts/production-smoke.mjs"),
        "--exceptional-request",
        requestPath,
      ],
    });
  }
  return Object.freeze(steps.map((step) => Object.freeze(step)));
}
