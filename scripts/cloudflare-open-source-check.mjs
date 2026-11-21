import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readExceptionalReleaseArtifactForReview } from "./exceptional-release-artifact.mjs";
import {
  deriveOpenUpdateEvidencePath,
  readOpenUpdateEvidenceFile,
} from "./open-update-evidence-file.mjs";
import { assertOpenUpdateCertifiedSourceSnapshot } from "./open-update-source-policy.mjs";
import {
  readExceptionalReleaseRequestFile,
  exceptionalReleaseRequestHash,
} from "./exceptional-release-act.mjs";
import {
  collectCloudflareState,
  loadWranglerOAuthToken,
} from "./cloudflare-closed-state.mjs";
import { assertOpenReleaseBaselineMatches } from "./open-release-baseline-policy.mjs";
import { runOpenSourceProductionSmoke } from "./cloudflare-open-source-smoke-policy.mjs";

export function parseOpenSourceCheckArguments(argv) {
  if (
    !Array.isArray(argv) ||
    ![2, 3].includes(argv.length) ||
    argv[0] !== "--request" ||
    typeof argv[1] !== "string" ||
    !path.isAbsolute(argv[1]) ||
    (argv.length === 3 && argv[2] !== "--smoke")
  ) {
    throw new Error(
      "Uso: cloudflare-open-source-check.mjs --request <ruta-absoluta.json> [--smoke]",
    );
  }
  return Object.freeze({ requestPath: argv[1], smoke: argv.length === 3 });
}

async function main() {
  const { requestPath, smoke } = parseOpenSourceCheckArguments(
    process.argv.slice(2),
  );
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const head = spawnSync("/usr/bin/git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (head.status !== 0 || head.error || head.signal)
    throw new Error("No se pudo verificar HEAD.");
  const request = readExceptionalReleaseRequestFile({
    requestPath,
    worktreeRoot: root,
    currentHead: head.stdout.trim(),
  });
  if (request.releaseMode !== "OPEN_UPDATE")
    throw new Error("Se requiere un request OPEN_UPDATE v2.");
  let certifiedSource;
  if (existsSync(deriveOpenUpdateEvidencePath(requestPath))) {
    const artifactManifest = readExceptionalReleaseArtifactForReview({
      requestPath,
      worktreeRoot: root,
      expectedHead: request.head,
      expectedRequestHash: exceptionalReleaseRequestHash(request),
      expectedPolicyHash: request.policyHash,
      expectedPolicyVersion: request.policyVersion,
    });
    const certificate = readOpenUpdateEvidenceFile({
      requestPath,
      worktreeRoot: root,
      request,
      artifactManifest,
      requirePromotionReady: true,
    });
    certifiedSource = {
      certificate,
      expectedCertificateHash: certificate.contentSha256,
      request,
      artifactManifest,
    };
  }
  if (smoke) {
    await runOpenSourceProductionSmoke({
      baseline: request.openSourceBaseline,
      expectedBaselineSha256: request.openSourceBaselineSha256,
      ...(certifiedSource ? { certifiedSource } : {}),
    });
  } else {
    const token = await loadWranglerOAuthToken();
    const snapshot = await collectCloudflareState({
      oauthToken: token,
      fetchImpl: globalThis.fetch,
    });
    const observedAtUtc = new Date().toISOString();
    if (certifiedSource)
      assertOpenUpdateCertifiedSourceSnapshot({
        ...certifiedSource,
        snapshot,
        now: observedAtUtc,
      });
    else
      assertOpenReleaseBaselineMatches({
        baseline: request.openSourceBaseline,
        expectedBaselineSha256: request.openSourceBaselineSha256,
        snapshot,
        observedAtUtc,
        nowUtc: observedAtUtc,
      });
  }
  console.log(
    smoke ? "OPEN source GET/HEAD smoke: PASS" : "OPEN source unchanged: PASS",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error(
      "OPEN source: BLOCKED. No se acreditó el estado público esperado.",
    );
    process.exitCode = 1;
  });
}
