import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findKnownSecrets } from "./secret-patterns.mjs";

// Revisa exactamente lo que podría entrar al próximo commit: archivos ya
// trackeados y nuevos no ignorados. `.env.local` queda fuera por `.gitignore`.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
)
  .split("\0")
  .filter(Boolean);

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue;
  }
  if (content.includes(0)) continue;
  const source = content.toString("utf8");

  for (const finding of findKnownSecrets(source)) {
    const line = source.slice(0, finding.index).split("\n").length;
    findings.push(`${file}:${line} · ${finding.label}`);
  }
}

if (findings.length) {
  console.error("Posibles secretos versionables detectados:");
  // Nunca imprimir el valor detectado: el log de CI también es persistente.
  for (const finding of findings) console.error(`  ✗ ${finding}`);
  process.exit(1);
}

console.log(
  `✓ sin secretos de formato conocido · ${files.length} archivos revisados`,
);
