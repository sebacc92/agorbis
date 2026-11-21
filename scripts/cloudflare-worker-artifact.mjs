import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { loadEnv } from "vite";
import { findKnownSecrets } from "./secret-patterns.mjs";

const UNSAFE_QWIK_SERVER_LOG_MARKERS = Object.freeze([
  "Redirect URL ",
  "JSON request error:",
  "Server function ",
]);

const SERVER_ONLY_SENSITIVE_ENV_NAME =
  /(?:^|_)(?:SECRET|SECRET_KEY|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)$/i;

export function loadProductionBuildEnvironment(root) {
  return loadEnv("production", root, "");
}

export const EXPECTED_STATIC_ASSET_EXCLUSIONS = Object.freeze([
  "_worker.js",
  "_routes.json",
  "_headers",
  "_redirects",
  "sitemap.xml",
  "404.html",
  "q-manifest.json",
]);

function artifactFiles(root, label, baseRoot = root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...artifactFiles(absolute, label, baseRoot));
    } else if (entry.isFile()) {
      files.push({
        absolute,
        label: path.join(label, path.relative(baseRoot, absolute)),
      });
    } else throw new Error(`Tipo de artefacto no permitido: ${entry.name}.`);
  }
  return files;
}

export function validateCloudflareWorkerArtifact(
  outputRoot,
  configuration,
  { runtimeSecrets = process.env } = {},
) {
  const errors = [];
  const mainRelative = configuration?.main;
  if (mainRelative !== "dist/_worker.js") {
    return [
      "No se puede validar el artefacto: wrangler.jsonc no apunta a dist/_worker.js.",
    ];
  }

  const mainPath = path.resolve(path.dirname(outputRoot), mainRelative);
  const expectedMain = path.resolve(outputRoot, "_worker.js");
  if (mainPath !== expectedMain) {
    errors.push("El main de Wrangler escapa del directorio dist esperado.");
    return errors;
  }
  if (!existsSync(mainPath) || !statSync(mainPath).isFile()) {
    errors.push(
      "Falta dist/_worker.js; ejecutá `pnpm build.cloudflare` antes del corte.",
    );
    return errors;
  }
  const worker = readFileSync(mainPath, "utf8");
  if (!worker.trim()) errors.push("dist/_worker.js está vacío.");
  if (!/\bscheduled\b/.test(worker)) {
    errors.push("dist/_worker.js no contiene el handler scheduled requerido.");
  }
  if (!/\bfetch\b/.test(worker)) {
    errors.push("dist/_worker.js no contiene el handler fetch requerido.");
  }
  if (/\.vercel\/output|\.vc-config\.json|VERCEL_ENV/.test(worker)) {
    errors.push("dist/_worker.js todavía contiene acoplamiento de Vercel.");
  }

  const serverRoot = path.resolve(path.dirname(outputRoot), "server");
  const serverEntryPath = path.join(serverRoot, "entry.cloudflare-workers.js");
  if (!existsSync(serverRoot) || !statSync(serverRoot).isDirectory()) {
    errors.push("Falta server/, el bundle SSR importado por dist/_worker.js.");
  } else if (
    !existsSync(serverEntryPath) ||
    !statSync(serverEntryPath).isFile()
  ) {
    errors.push("Falta server/entry.cloudflare-workers.js.");
  }
  if (!worker.includes("../server/entry.cloudflare-workers.js")) {
    errors.push(
      "dist/_worker.js no importa el entry SSR esperado desde ../server/entry.cloudflare-workers.js.",
    );
  }
  if (existsSync(serverEntryPath)) {
    const serverEntry = readFileSync(serverEntryPath, "utf8");
    for (const marker of UNSAFE_QWIK_SERVER_LOG_MARKERS) {
      if (serverEntry.includes(marker)) {
        errors.push(
          `server/entry.cloudflare-workers.js conserva un logger dinámico no saneado de Qwik (${marker.trim()}).`,
        );
      }
    }
  }

  const manifestPath = path.join(outputRoot, "q-manifest.json");
  if (!existsSync(manifestPath)) {
    errors.push("Falta dist/q-manifest.json del build cliente de Qwik.");
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (
        manifest?.version !== "1" ||
        manifest?.options?.buildMode !== "production" ||
        typeof manifest?.manifestHash !== "string" ||
        !manifest.manifestHash
      ) {
        errors.push(
          "dist/q-manifest.json no describe un build Qwik de Producción.",
        );
      }
    } catch {
      errors.push("dist/q-manifest.json no contiene JSON válido.");
    }
  }

  const assetsIgnorePath = path.join(outputRoot, ".assetsignore");
  if (!existsSync(assetsIgnorePath)) {
    errors.push("Falta dist/.assetsignore.");
  } else {
    const ignoredEntries = readFileSync(assetsIgnorePath, "utf8")
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const actual = [...ignoredEntries].sort();
    const expected = [...EXPECTED_STATIC_ASSET_EXCLUSIONS].sort();
    if (
      ignoredEntries.length !== EXPECTED_STATIC_ASSET_EXCLUSIONS.length ||
      JSON.stringify(actual) !== JSON.stringify(expected)
    ) {
      errors.push(
        `dist/.assetsignore debe contener exactamente estas exclusiones y ninguna otra: ${EXPECTED_STATIC_ASSET_EXCLUSIONS.join(", ")}.`,
      );
    }
  }

  const exactSecrets = Object.entries(runtimeSecrets ?? {}).filter(
    ([name, secret]) =>
      !name.startsWith("PUBLIC_") &&
      SERVER_ONLY_SENSITIVE_ENV_NAME.test(name) &&
      typeof secret === "string" &&
      secret.length > 0,
  );
  for (const [name, secret] of exactSecrets) {
    if (secret.length < 8) {
      errors.push(
        `El valor server-only de ${name} es demasiado corto para escanearlo sin falsos positivos; corregilo antes de publicar.`,
      );
    }
  }
  const scanFiles = artifactFiles(outputRoot, "dist");
  if (existsSync(serverRoot) && statSync(serverRoot).isDirectory()) {
    scanFiles.push(...artifactFiles(serverRoot, "server"));
  }
  for (const { absolute: filePath, label: displayPath } of scanFiles) {
    const content = readFileSync(filePath);
    for (const [name, secret] of exactSecrets) {
      if (secret.length < 8) continue;
      if (content.includes(Buffer.from(secret))) {
        errors.push(
          `${displayPath} contiene el valor runtime de ${name}; el artefacto no puede incorporar secretos.`,
        );
      }
    }
    for (const finding of findKnownSecrets(content.toString("utf8"))) {
      errors.push(
        `${displayPath} contiene un formato secreto conocido (${finding.label}).`,
      );
    }
  }
  return errors;
}
