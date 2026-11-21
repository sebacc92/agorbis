import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readExceptionalReleaseRequestFile } from "./exceptional-release-act.mjs";
import {
  createExceptionalProductionSmokeLegalProfile,
  parseProductionSmokeArguments,
  runProductionReadOnlySmoke,
} from "./production-smoke-policy.mjs";

try {
  const { exceptionalRequestPath } = parseProductionSmokeArguments(
    process.argv.slice(2),
  );
  let legalProfile;
  if (exceptionalRequestPath) {
    const root = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
    );
    const git = spawnSync("/usr/bin/git", ["rev-parse", "--verify", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
    });
    if (git.error || git.signal || git.status !== 0) {
      throw new Error(
        "No se pudo verificar el HEAD para el smoke excepcional.",
      );
    }
    const currentHead = git.stdout.trim();
    const request = readExceptionalReleaseRequestFile({
      requestPath: exceptionalRequestPath,
      worktreeRoot: root,
      currentHead,
    });
    legalProfile = createExceptionalProductionSmokeLegalProfile({
      request,
      currentHead,
    });
  }
  const result = await runProductionReadOnlySmoke({
    supabaseOrigin: process.env.PUBLIC_SUPABASE_URL?.trim(),
    publishableKey: process.env.PUBLIC_SUPABASE_ANON_KEY?.trim(),
    legalProfile,
  });
  console.log(
    `Smoke público read-only: PASS (${result.completed.length} controles).`,
  );
  if (result.legalStatus === "pending-external-evidence") {
    console.log(
      "Perfil legal excepcional: evidencia externa pendiente; este smoke no acredita aprobación AAIP, salvaguardas ni cumplimiento jurídico.",
    );
  }
  for (const completed of result.completed) console.log(`  ✓ ${completed}`);
} catch (error) {
  console.error("Smoke público read-only: FAIL");
  console.error(
    `  ✗ ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
