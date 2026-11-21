#!/usr/bin/env node

import {
  AAIP_DATABASE_REGISTRATION_STATUS,
  validateAaipDatabaseRegistration,
} from "./aaip-registration-policy.mjs";
import { socialAuthConsentBlockers } from "./social-auth-consent-policy.mjs";
import { GOOGLE_PROCESSING_DISCLOSURE } from "./google-processing-disclosure.mjs";
import { OWNER_WAIVER_CANDIDATE_GATE_IDS } from "./release-gate-policy.mjs";
import {
  areBilingualExternalEvidenceValuesEquivalent,
  isExternalEvidencePlaceholder,
} from "../src/lib/legal-evidence-policy.js";

/**
 * Fuente versionada y exclusivamente pública para el build de Cloudflare.
 *
 * Wrangler `vars` configura el runtime del Worker. Vite, en cambio, sustituye
 * `import.meta.env.PUBLIC_*` durante el build del cliente. Este inventario hace
 * explícita esa frontera y no consulta `process.env`, `.env.local`, Vercel ni
 * ningún gestor de secretos.
 */

const STATUS = Object.freeze({
  confirmed: "confirmed",
  pending: "pending",
  notApplicable: "not-applicable",
});
const PLACEHOLDER_EXEMPT_PUBLIC_NAMES = new Set([
  "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
]);
const BILINGUAL_EXTERNAL_DISCLOSURE_NAMES = Object.freeze([
  "PUBLIC_SUPABASE_PROCESSING_LOCATION",
  "PUBLIC_RESEND_PROCESSING_LOCATION",
  "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
  "PUBLIC_PROVIDER_RETENTION_SUMMARY",
  "PUBLIC_TRANSFER_SAFEGUARDS",
  "PUBLIC_GOOGLE_PROCESSING_LOCATION",
  "PUBLIC_FACEBOOK_PROCESSING_LOCATION",
]);

const SCOPE = Object.freeze({
  shared: "build-and-worker-runtime",
  buildOnly: "vite-build-only",
});

function entry({
  name,
  scope = SCOPE.buildOnly,
  status,
  value = "",
  source,
  requiredForOpen = true,
  blockingReason = "",
}) {
  return Object.freeze({
    name,
    scope,
    status,
    value,
    source,
    requiredForOpen,
    blockingReason,
  });
}

/**
 * Inventario exacto. Los valores pendientes se mantienen vacíos: ningún texto
 * jurídico, destino de tratamiento o dato de proveedor se inventa para hacer
 * pasar el build.
 */
export const CLOUDFLARE_PUBLIC_BUILD_VARIABLES = Object.freeze([
  entry({
    name: "PUBLIC_SITE_URL",
    scope: SCOPE.shared,
    status: STATUS.confirmed,
    value: "https://agorbis.com",
    source: "repository-and-operator-confirmed",
  }),
  entry({
    name: "PUBLIC_SUPABASE_URL",
    scope: SCOPE.shared,
    status: STATUS.confirmed,
    value: "https://ibtvlvpxwourrxwcrfkf.supabase.co",
    source: "repository-and-operator-confirmed",
  }),
  entry({
    name: "PUBLIC_SUPABASE_ANON_KEY",
    scope: SCOPE.shared,
    status: STATUS.confirmed,
    value: "sb_publishable_G8zV_-e3-KIm7sWr6UdpaQ_dlmOED8s",
    source: "repository-and-operator-confirmed",
  }),
  entry({
    name: "PUBLIC_GOOGLE_AUTH_ENABLED",
    scope: SCOPE.shared,
    status: STATUS.confirmed,
    value: "true",
    source: "google-open-target-d122-provider-active-in-supabase",
  }),
  entry({
    name: "PUBLIC_FACEBOOK_AUTH_ENABLED",
    scope: SCOPE.shared,
    status: STATUS.confirmed,
    value: "false",
    source: "facebook-auth-paused-by-operator",
  }),
  entry({
    name: "PUBLIC_TURNSTILE_SITE_KEY",
    status: STATUS.confirmed,
    // Widget "Agorbis — A (App)" de la cuenta SEBA (D92). La key anterior
    // era de la cuenta vieja: renderizaba, pero el TURNSTILE_SECRET nuevo
    // rechazaba cada token (02-11-2026).
    value: "0x4AAAAAAFsE7Y2uFQXTKPvn",
    source: "cloudflare-api-list-seba-widget-a-agorbis-com",
  }),
  entry({
    name: "PUBLIC_LEGAL_CONTROLLER_NAME",
    status: STATUS.confirmed,
    value: "Sebastian Cardoso Castillo",
    source: "operator-confirmed-public-legal-data",
  }),
  entry({
    name: "PUBLIC_LEGAL_CONTACT_EMAIL",
    status: STATUS.confirmed,
    value: "sebastiancardoso92@gmail.com",
    source: "operator-confirmed-public-legal-data",
  }),
  entry({
    name: "PUBLIC_AAIP_CONTROLLER_ID",
    status: STATUS.confirmed,
    value: "RL-2026-81658385-APN-DNPDP#AAIP",
    source: "operator-confirmed-aaip-controller-code",
  }),
  entry({
    name: "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
    status: STATUS.confirmed,
    value: AAIP_DATABASE_REGISTRATION_STATUS,
    source: "versioned-aaip-database-registration-policy",
  }),
  entry({
    name: "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
    status: STATUS.pending,
    source: "aaip-step-2-submitted-not-yet-approved",
    blockingReason:
      "Falta la constancia de aprobación del Paso 2 y el número que AAIP asigne a la base; el expediente EX y el código RL del responsable no lo sustituyen.",
  }),
  entry({
    name: "PUBLIC_SUPABASE_PROCESSING_LOCATION",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en español respaldada por las condiciones y documentación aplicables de Supabase; no requiere necesariamente una respuesta por correo.",
  }),
  entry({
    name: "PUBLIC_SUPABASE_PROCESSING_LOCATION_EN",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en inglés respaldada por las condiciones y documentación aplicables de Supabase; no requiere necesariamente una respuesta por correo.",
  }),
  entry({
    name: "PUBLIC_RESEND_PROCESSING_LOCATION",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en español respaldada por las condiciones y documentación aplicables de Resend; no requiere necesariamente una respuesta por correo.",
  }),
  entry({
    name: "PUBLIC_RESEND_PROCESSING_LOCATION_EN",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en inglés respaldada por las condiciones y documentación aplicables de Resend; no requiere necesariamente una respuesta por correo.",
  }),
  entry({
    name: "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en español respaldada para DNS, Turnstile y Workers Edge Compute.",
  }),
  entry({
    name: "PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN",
    status: STATUS.pending,
    source: "vercel-public-candidate-not-provider-validated",
    blockingReason:
      "Falta una descripción en inglés respaldada para DNS, Turnstile y Workers Edge Compute.",
  }),
  entry({
    name: "PUBLIC_TRANSFER_SAFEGUARDS",
    status: STATUS.pending,
    source: "argentine-transfer-mechanism-pending",
    blockingReason:
      "Falta acreditar el mecanismo argentino aplicable antes del primer request internacional.",
  }),
  entry({
    name: "PUBLIC_TRANSFER_SAFEGUARDS_EN",
    status: STATUS.pending,
    source: "argentine-transfer-mechanism-pending",
    blockingReason:
      "The Argentine transfer mechanism applicable before the first international request is not yet evidenced.",
  }),
  entry({
    name: "PUBLIC_PROVIDER_RETENTION_SUMMARY",
    status: STATUS.pending,
    source: "vercel-candidate-obsolete-includes-vercel-do-not-use",
    blockingReason:
      "Falta el resumen en español de retención externa respaldado por los proveedores.",
  }),
  entry({
    name: "PUBLIC_PROVIDER_RETENTION_SUMMARY_EN",
    status: STATUS.pending,
    source: "vercel-candidate-obsolete-includes-vercel-do-not-use",
    blockingReason:
      "Falta el resumen en inglés de retención externa respaldado por los proveedores.",
  }),
  entry({
    name: "PUBLIC_GOOGLE_PROCESSING_LOCATION",
    status: STATUS.confirmed,
    value: GOOGLE_PROCESSING_DISCLOSURE.es,
    source: GOOGLE_PROCESSING_DISCLOSURE.source,
  }),
  entry({
    name: "PUBLIC_GOOGLE_PROCESSING_LOCATION_EN",
    status: STATUS.confirmed,
    value: GOOGLE_PROCESSING_DISCLOSURE.en,
    source: GOOGLE_PROCESSING_DISCLOSURE.source,
  }),
  entry({
    name: "PUBLIC_FACEBOOK_PROCESSING_LOCATION",
    status: STATUS.notApplicable,
    source: "facebook-auth-disabled",
    requiredForOpen: false,
  }),
  entry({
    name: "PUBLIC_FACEBOOK_PROCESSING_LOCATION_EN",
    status: STATUS.notApplicable,
    source: "facebook-auth-disabled",
    requiredForOpen: false,
  }),
]);

const ALLOWED_STATUSES = new Set(Object.values(STATUS));
const ALLOWED_SCOPES = new Set(Object.values(SCOPE));
const PUBLIC_ENVIRONMENT_NAME = /^PUBLIC_[A-Z0-9_]+$/;
const UNSAFE_VALUE = /[\0\r\n]/;
const SENSITIVE_PROCESS_ENVIRONMENT_NAME =
  /(?:^|_)(?:SECRET|SECRET_KEY|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)$/;

export const CLOUDFLARE_PUBLIC_BUILD_LOCK =
  "AGORBIS_CLOUDFLARE_PUBLIC_BUILD_LOCKED";

export const EXCEPTIONAL_PUBLIC_VARIABLE_RISK_GATES = Object.freeze({
  PUBLIC_AAIP_DATABASE_REGISTRATION_ID: "legal.aaip-registration-pending",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION:
    "privacy.provider-locations-unverified",
  PUBLIC_CLOUDFLARE_PROCESSING_LOCATION_EN:
    "privacy.provider-locations-unverified",
  PUBLIC_SUPABASE_PROCESSING_LOCATION: "privacy.provider-locations-unverified",
  PUBLIC_SUPABASE_PROCESSING_LOCATION_EN:
    "privacy.provider-locations-unverified",
  PUBLIC_RESEND_PROCESSING_LOCATION: "privacy.provider-locations-unverified",
  PUBLIC_RESEND_PROCESSING_LOCATION_EN: "privacy.provider-locations-unverified",
  PUBLIC_PROVIDER_RETENTION_SUMMARY: "privacy.provider-retention-unverified",
  PUBLIC_PROVIDER_RETENTION_SUMMARY_EN: "privacy.provider-retention-unverified",
  PUBLIC_TRANSFER_SAFEGUARDS: "legal.transfer-safeguards-unverified",
  PUBLIC_TRANSFER_SAFEGUARDS_EN: "legal.transfer-safeguards-unverified",
});

function acceptedRiskGateSet(acceptedRiskGateIds) {
  if (!Array.isArray(acceptedRiskGateIds)) {
    throw new Error("acceptedRiskGateIds debe ser un array.");
  }
  const accepted = new Set(acceptedRiskGateIds);
  if (accepted.size !== acceptedRiskGateIds.length) {
    throw new Error("acceptedRiskGateIds no admite duplicados.");
  }
  for (const gateId of accepted) {
    if (!OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId)) {
      throw new Error(
        `Gate excepcional desconocido o no renunciable: ${gateId}.`,
      );
    }
  }
  return accepted;
}

function candidateRiskGateSet(candidateRiskGateIds) {
  if (!Array.isArray(candidateRiskGateIds)) {
    throw new Error("candidateRiskGateIds debe ser un array.");
  }
  const requested = new Set(candidateRiskGateIds);
  if (requested.size !== candidateRiskGateIds.length) {
    throw new Error("candidateRiskGateIds no admite duplicados.");
  }
  for (const gateId of requested) {
    if (!OWNER_WAIVER_CANDIDATE_GATE_IDS.includes(gateId)) {
      throw new Error(
        `Gate candidato desconocido o no renunciable: ${gateId}.`,
      );
    }
  }
  return requested;
}

export function validatePublicBuildInventory(
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
) {
  const errors = [];
  if (!Array.isArray(variables)) {
    return ["El inventario público debe ser un array."];
  }

  const names = [];
  for (const [index, variable] of variables.entries()) {
    if (!variable || typeof variable !== "object" || Array.isArray(variable)) {
      errors.push(`Entrada pública ${index} inválida.`);
      continue;
    }
    const { name, scope, status, value, source, requiredForOpen } = variable;
    if (typeof name !== "string" || !PUBLIC_ENVIRONMENT_NAME.test(name)) {
      errors.push(`Entrada pública ${index} tiene un nombre no permitido.`);
      continue;
    }
    names.push(name);
    if (!ALLOWED_SCOPES.has(scope)) {
      errors.push(`${name} tiene un scope desconocido.`);
    }
    if (!ALLOWED_STATUSES.has(status)) {
      errors.push(`${name} tiene un estado desconocido.`);
    }
    if (typeof source !== "string" || source.length === 0) {
      errors.push(`${name} no registra su fuente.`);
    }
    if (typeof requiredForOpen !== "boolean") {
      errors.push(`${name} no declara requiredForOpen como booleano.`);
    }
    if (typeof value !== "string" || UNSAFE_VALUE.test(value ?? "")) {
      errors.push(`${name} contiene un valor no serializable en una línea.`);
    } else if (status === STATUS.confirmed && value.length === 0) {
      errors.push(`${name} figura confirmado pero está vacío.`);
    } else if (
      status === STATUS.confirmed &&
      !PLACEHOLDER_EXEMPT_PUBLIC_NAMES.has(name) &&
      isExternalEvidencePlaceholder(value)
    ) {
      errors.push(`${name} figura confirmado pero contiene un placeholder.`);
    } else if (status !== STATUS.confirmed && value.length > 0) {
      errors.push(`${name} no confirmado no puede contener un valor.`);
    }
  }

  if (names.length !== new Set(names).size) {
    errors.push("El inventario público contiene nombres duplicados.");
  }

  for (const name of BILINGUAL_EXTERNAL_DISCLOSURE_NAMES) {
    const spanish = variables.find((variable) => variable.name === name);
    const english = variables.find(
      (variable) => variable.name === `${name}_EN`,
    );
    if (
      spanish?.status === STATUS.confirmed &&
      english?.status === STATUS.confirmed &&
      areBilingualExternalEvidenceValuesEquivalent(spanish.value, english.value)
    ) {
      errors.push(
        `${name} y ${name}_EN deben contener textos ES/EN distintos; repetir el mismo valor no acredita una traducción.`,
      );
    }
  }

  for (const [provider, label] of [
    ["GOOGLE", "Google"],
    ["FACEBOOK", "Facebook"],
  ]) {
    const flag = `PUBLIC_${provider}_AUTH_ENABLED`;
    const enabled = variables.find(({ name }) => name === flag);
    if (enabled?.status !== STATUS.confirmed) {
      errors.push(`${flag} debe estar confirmado.`);
    } else if (!new Set(["true", "false"]).has(enabled.value)) {
      errors.push(`${flag} debe valer "true" o "false".`);
    } else if (enabled.value === "true") {
      for (const name of [
        `PUBLIC_${provider}_PROCESSING_LOCATION`,
        `PUBLIC_${provider}_PROCESSING_LOCATION_EN`,
      ]) {
        const variable = variables.find((candidate) => candidate.name === name);
        if (
          !variable?.requiredForOpen ||
          ![STATUS.confirmed, STATUS.pending].includes(variable.status)
        ) {
          errors.push(
            `${name} debe confirmarse antes de abrir ${label} Auth o figurar pendiente y obligatorio para apertura.`,
          );
        }
      }
    }
  }

  const publishableKey = variables.find(
    ({ name }) => name === "PUBLIC_SUPABASE_ANON_KEY",
  );
  if (
    publishableKey?.status !== STATUS.confirmed ||
    !publishableKey.value.startsWith("sb_publishable_")
  ) {
    errors.push(
      "PUBLIC_SUPABASE_ANON_KEY debe contener exclusivamente una sb_publishable_ confirmada.",
    );
  }

  const aaipStatus = variables.find(
    ({ name }) => name === "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS",
  );
  const aaipDatabaseRegistrationId = variables.find(
    ({ name }) => name === "PUBLIC_AAIP_DATABASE_REGISTRATION_ID",
  );
  const aaipControllerId = variables.find(
    ({ name }) => name === "PUBLIC_AAIP_CONTROLLER_ID",
  );
  if (aaipStatus?.status !== STATUS.confirmed) {
    errors.push(
      "PUBLIC_AAIP_DATABASE_REGISTRATION_STATUS debe estar confirmado y derivarse de la política AAIP versionada.",
    );
  } else {
    errors.push(
      ...validateAaipDatabaseRegistration({
        status: aaipStatus.value,
        registrationId: aaipDatabaseRegistrationId?.value ?? "",
        controllerId: aaipControllerId?.value ?? "",
      }),
    );
  }

  return errors;
}

function isDisabledSocialProviderDisclosure(name, variables) {
  const provider =
    /^PUBLIC_(GOOGLE|FACEBOOK)_PROCESSING_LOCATION(?:_EN)?$/.exec(name)?.[1];
  return (
    provider &&
    variables.find(
      (variable) => variable.name === `PUBLIC_${provider}_AUTH_ENABLED`,
    )?.value === "false"
  );
}

export function publicBuildOpeningBlockers(
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  { acceptedRiskGateIds = [] } = {},
) {
  const inventoryErrors = validatePublicBuildInventory(variables);
  if (inventoryErrors.length > 0) return inventoryErrors;

  let accepted;
  try {
    accepted = acceptedRiskGateSet(acceptedRiskGateIds);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  return [
    ...socialAuthConsentBlockers(
      Object.fromEntries(variables.map(({ name, value }) => [name, value])),
    ),
    ...variables
      .filter(
        ({ name, requiredForOpen, status }) =>
          requiredForOpen &&
          !isDisabledSocialProviderDisclosure(name, variables) &&
          status !== STATUS.confirmed &&
          !accepted.has(EXCEPTIONAL_PUBLIC_VARIABLE_RISK_GATES[name]),
      )
      .map(
        ({ name, blockingReason }) =>
          `${name}: ${blockingReason || "valor público pendiente"}`,
      ),
  ];
}

export function d72CandidateBuildBlockers(
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  { candidateRiskGateIds = [] } = {},
) {
  const inventoryErrors = validatePublicBuildInventory(variables);
  if (inventoryErrors.length > 0) return inventoryErrors;
  let requested;
  try {
    requested = candidateRiskGateSet(candidateRiskGateIds);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  return [
    ...socialAuthConsentBlockers(
      Object.fromEntries(variables.map(({ name, value }) => [name, value])),
    ),
    ...variables
      .filter(
        ({ name, requiredForOpen, status }) =>
          requiredForOpen &&
          !isDisabledSocialProviderDisclosure(name, variables) &&
          status !== STATUS.confirmed &&
          !requested.has(EXCEPTIONAL_PUBLIC_VARIABLE_RISK_GATES[name]),
      )
      .map(
        ({ name, blockingReason }) =>
          `${name}: ${blockingReason || "valor público pendiente"}`,
      ),
  ];
}

export function publicBuildEnvironment({
  mode = "closed",
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  acceptedRiskGateIds = [],
  candidateRiskGateIds = [],
} = {}) {
  if (
    !new Set([
      "closed",
      "open",
      "exceptional-open",
      "d72-candidate",
      "d72-recovery",
    ]).has(mode)
  ) {
    throw new Error(`Modo público desconocido: ${mode}.`);
  }
  if (
    (["d72-candidate", "d72-recovery"].includes(mode) &&
      acceptedRiskGateIds.length > 0) ||
    (!["d72-candidate", "d72-recovery"].includes(mode) &&
      candidateRiskGateIds.length > 0)
  ) {
    throw new Error(
      "El build candidato y la aceptación excepcional usan parámetros separados.",
    );
  }
  const inventoryErrors = validatePublicBuildInventory(variables);
  if (inventoryErrors.length > 0) {
    throw new Error(
      `Inventario público inválido:\n${inventoryErrors.join("\n")}`,
    );
  }
  if (
    mode === "open" ||
    mode === "exceptional-open" ||
    ["d72-candidate", "d72-recovery"].includes(mode)
  ) {
    const blockers = ["d72-candidate", "d72-recovery"].includes(mode)
      ? d72CandidateBuildBlockers(variables, { candidateRiskGateIds })
      : publicBuildOpeningBlockers(variables, {
          acceptedRiskGateIds:
            mode === "exceptional-open" ? acceptedRiskGateIds : [],
        });
    if (blockers.length > 0) {
      throw new Error(`Apertura pública bloqueada:\n${blockers.join("\n")}`);
    }
  }
  return Object.fromEntries(
    variables.map(({ name, value }) => [
      name,
      ["closed", "d72-recovery"].includes(mode) &&
      ["PUBLIC_GOOGLE_AUTH_ENABLED", "PUBLIC_FACEBOOK_AUTH_ENABLED"].includes(
        name,
      )
        ? "false"
        : value,
    ]),
  );
}

/**
 * Entorno del subproceso Vite/Qwik. Conserva sólo variables operativas no
 * públicas y no sensibles; reemplaza el namespace PUBLIC_* completo por el
 * inventario versionado. El lock hace que Vite deshabilite envDir y, por lo
 * tanto, no consulte .env, .env.local ni sus variantes de modo.
 */
export function cloudflareBuildProcessEnvironment({
  mode = "closed",
  processEnvironment = process.env,
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
  acceptedRiskGateIds = [],
  candidateRiskGateIds = [],
} = {}) {
  if (
    !processEnvironment ||
    typeof processEnvironment !== "object" ||
    Array.isArray(processEnvironment)
  ) {
    throw new Error("El entorno padre del build debe ser un objeto.");
  }
  const inherited = Object.fromEntries(
    Object.entries(processEnvironment).filter(
      ([name, value]) =>
        typeof value === "string" &&
        !PUBLIC_ENVIRONMENT_NAME.test(name) &&
        !name.startsWith("VITE_") &&
        !SENSITIVE_PROCESS_ENVIRONMENT_NAME.test(name),
    ),
  );
  return {
    ...inherited,
    [CLOUDFLARE_PUBLIC_BUILD_LOCK]: "1",
    ...publicBuildEnvironment({
      mode,
      variables,
      acceptedRiskGateIds,
      candidateRiskGateIds,
    }),
  };
}

export function serializePublicBuildEnvironment({
  format = "dotenv",
  mode = "closed",
  variables = CLOUDFLARE_PUBLIC_BUILD_VARIABLES,
} = {}) {
  const environment = publicBuildEnvironment({ mode, variables });
  if (format === "json") {
    return `${JSON.stringify(environment, null, 2)}\n`;
  }
  if (format !== "dotenv") {
    throw new Error(`Formato público desconocido: ${format}.`);
  }
  return `${Object.entries(environment)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n")}\n`;
}

function usage() {
  return [
    "Uso:",
    "  node scripts/cloudflare-public-build-environment.mjs inventory",
    "  node scripts/cloudflare-public-build-environment.mjs check-open",
    "  node scripts/cloudflare-public-build-environment.mjs export-closed [dotenv|json]",
    "  node scripts/cloudflare-public-build-environment.mjs export-open [dotenv|json]",
  ].join("\n");
}

async function main(arguments_) {
  const [command, format = "dotenv", ...rest] = arguments_;
  if (rest.length > 0) throw new Error(usage());
  if (command === "inventory" && arguments_.length === 1) {
    const errors = validatePublicBuildInventory();
    if (errors.length > 0) {
      throw new Error(`Inventario público inválido:\n${errors.join("\n")}`);
    }
    process.stdout.write(
      `${JSON.stringify(CLOUDFLARE_PUBLIC_BUILD_VARIABLES, null, 2)}\n`,
    );
    return;
  }
  if (command === "check-open" && arguments_.length === 1) {
    const blockers = publicBuildOpeningBlockers();
    if (blockers.length > 0) {
      throw new Error(`Apertura pública bloqueada:\n${blockers.join("\n")}`);
    }
    process.stdout.write("Fuente pública Cloudflare: PASS para apertura.\n");
    return;
  }
  if (command === "export-closed" || command === "export-open") {
    process.stdout.write(
      serializePublicBuildEnvironment({
        mode: command === "export-open" ? "open" : "closed",
        format,
      }),
    );
    return;
  }
  throw new Error(usage());
}

const isMain =
  process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href;

if (isMain) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
