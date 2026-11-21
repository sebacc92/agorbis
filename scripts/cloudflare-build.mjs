import { installedPnpmStoreEnvironment } from "./installed-pnpm-store.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWranglerConfiguration } from "./cloudflare-worker-policy.mjs";
import {
  CLOUDFLARE_PUBLIC_BUILD_LOCK,
  cloudflareBuildProcessEnvironment,
} from "./cloudflare-public-build-environment.mjs";
import {
  loadProductionBuildEnvironment,
  validateCloudflareWorkerArtifact,
} from "./cloudflare-worker-artifact.mjs";
import { readExceptionalReleaseRequestFile } from "./exceptional-release-act.mjs";
import { assertExceptionalReleaseScriptContract } from "./exceptional-release-script-contract.mjs";
import {
  D72_COMPOSITE_PINNED_GIT_EXECUTABLE,
  D72_COMPOSITE_PINNED_PNPM_EXECUTABLE,
  assertD72CompositeProductionRuntime,
} from "./d72-non-stateful-composite-collector.mjs";

/** Suites que todo build de Cloudflare exige en verde antes de `pnpm build`. */
const CLOUDFLARE_BUILD_TEST_SCRIPTS = Object.freeze(["test", "test.release"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOSED_CUTOVER_FLAG = "--closed-cutover";
const READ_ONLY_PREVIEW_FLAG = "--public-read-only-preview";
const EXCEPTIONAL_REQUEST_FLAG = "--exceptional-request";
const D72_CANDIDATE_REQUEST_FLAG = "--d72-candidate-request";
const buildArguments = process.argv.slice(2);
const openRecovery =
  buildArguments.length === 2 &&
  buildArguments[0] === "--open-recovery-request";
const closedCutover =
  buildArguments.length === 1 && buildArguments[0] === CLOSED_CUTOVER_FLAG;
const readOnlyPreview =
  buildArguments.length === 1 && buildArguments[0] === READ_ONLY_PREVIEW_FLAG;
const exceptionalRequestPath =
  buildArguments.length === 2 && buildArguments[0] === EXCEPTIONAL_REQUEST_FLAG
    ? buildArguments[1]
    : null;
const d72CandidateRequestPath =
  buildArguments.length === 2 &&
  (buildArguments[0] === D72_CANDIDATE_REQUEST_FLAG || openRecovery)
    ? buildArguments[1]
    : null;
const releaseRequestPath =
  exceptionalRequestPath ?? d72CandidateRequestPath ?? null;

if (
  buildArguments.length > 0 &&
  !closedCutover &&
  !readOnlyPreview &&
  !releaseRequestPath
) {
  console.error(
    `cloudflare-build sólo acepta ${CLOSED_CUTOVER_FLAG}, ${READ_ONLY_PREVIEW_FLAG}, ${EXCEPTIONAL_REQUEST_FLAG} <ruta> o ${D72_CANDIDATE_REQUEST_FLAG} <ruta> o --open-recovery-request <ruta> como modo alternativo.`,
  );
  process.exit(1);
}

function run(command, args, { env = process.env } = {}) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

let viteEnvironment;
let releaseRequest;
try {
  if (d72CandidateRequestPath) {
    assertD72CompositeProductionRuntime();
  }
  if (releaseRequestPath) {
    const headResult = spawnSync(
      d72CandidateRequestPath ? D72_COMPOSITE_PINNED_GIT_EXECUTABLE : "git",
      ["rev-parse", "HEAD"],
      {
        cwd: root,
        encoding: "utf8",
        shell: false,
      },
    );
    if (headResult.error || headResult.signal || headResult.status !== 0) {
      throw new Error("No se pudo resolver el HEAD para el build excepcional.");
    }
    releaseRequest = readExceptionalReleaseRequestFile({
      requestPath: releaseRequestPath,
      worktreeRoot: root,
      currentHead: headResult.stdout.trim(),
    });
    if (openRecovery && releaseRequest.releaseMode !== "OPEN_UPDATE") {
      throw new Error(
        "La recuperación abierta requiere un request OPEN_UPDATE v2.",
      );
    }
  }
  viteEnvironment = cloudflareBuildProcessEnvironment({
    mode:
      closedCutover || readOnlyPreview
        ? "closed"
        : d72CandidateRequestPath
          ? openRecovery
            ? "d72-recovery"
            : "d72-candidate"
          : exceptionalRequestPath
            ? "exceptional-open"
            : "open",
    acceptedRiskGateIds: exceptionalRequestPath
      ? releaseRequest.risks.map(({ gateId }) => gateId)
      : [],
    candidateRiskGateIds: d72CandidateRequestPath
      ? releaseRequest.risks.map(({ gateId }) => gateId)
      : [],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

// El gate corre siempre: un entorno de Cloudflare mal etiquetado nunca puede
// convertir un build incompleto en un artefacto publicable.
// En modo abierto, construir viteEnvironment ejecuta el equivalente estricto de
// check-open antes de iniciar Qwik. En ambos modos, Vite recibe exclusivamente
// el inventario PUBLIC_* versionado y el lock que deshabilita todos los .env.
try {
  assertExceptionalReleaseScriptContract(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
// `pnpm build` (qwik build) corre sólo build.types y lint. Hasta el contrato
// v10, lint encadenaba además vitest y los gates de release; con la partición
// en lint/test/test.release, deploy:closed, deploy:readonly-preview,
// deploy:dry-run y release:open:dry-run pasaron a construir y publicar sin
// ninguna de esas pruebas. Se corren acá, con el mismo pnpm y el mismo
// entorno que el build, para no tocar los comandos deploy:* que
// production-preflight compara literalmente. Si una falla, no hay artefacto.
for (const script of CLOUDFLARE_BUILD_TEST_SCRIPTS) {
  run(
    d72CandidateRequestPath ? D72_COMPOSITE_PINNED_PNPM_EXECUTABLE : "pnpm",
    [script],
    { env: { ...viteEnvironment, ...installedPnpmStoreEnvironment(root) } },
  );
}
run(
  d72CandidateRequestPath ? D72_COMPOSITE_PINNED_PNPM_EXECUTABLE : "pnpm",
  ["build"],
  { env: { ...viteEnvironment, ...installedPnpmStoreEnvironment(root) } },
);
const configuration = readWranglerConfiguration(
  path.join(
    root,
    closedCutover
      ? "wrangler.closed.jsonc"
      : readOnlyPreview
        ? "wrangler.readonly-preview.jsonc"
        : openRecovery
          ? "wrangler.open-recovery.jsonc"
          : "wrangler.jsonc",
  ),
);
const artifactErrors = validateCloudflareWorkerArtifact(
  path.join(root, "dist"),
  configuration,
  {
    runtimeSecrets:
      process.env[CLOUDFLARE_PUBLIC_BUILD_LOCK] === "1"
        ? process.env
        : loadProductionBuildEnvironment(root),
  },
);
if (artifactErrors.length > 0) {
  console.error("Artefacto Cloudflare Workers: BLOQUEADO");
  for (const error of artifactErrors) console.error(`  ✗ ${error}`);
  process.exit(1);
}
run(
  process.execPath,
  readOnlyPreview
    ? ["scripts/cloudflare-readonly-preview-preflight.mjs"]
    : [
        "scripts/production-preflight.mjs",
        ...(closedCutover
          ? [CLOSED_CUTOVER_FLAG]
          : d72CandidateRequestPath
            ? [
                openRecovery
                  ? "--open-recovery-request"
                  : D72_CANDIDATE_REQUEST_FLAG,
                d72CandidateRequestPath,
              ]
            : exceptionalRequestPath
              ? [EXCEPTIONAL_REQUEST_FLAG, exceptionalRequestPath]
              : []),
      ],
  { env: { ...viteEnvironment, ...installedPnpmStoreEnvironment(root) } },
);
