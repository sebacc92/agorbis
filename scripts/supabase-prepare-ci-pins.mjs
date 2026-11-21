#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPABASE_VERSION_PIN_FILES,
  materializeSupabaseVersionPins,
} from "./supabase-version-pins-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedCliVersion = "2.115.0";

function main() {
  if (process.argv.length !== 2) {
    throw new Error(
      "La preparación CI no admite argumentos ni rutas externas.",
    );
  }
  if (process.env.CI !== "true" || process.env.GITHUB_ACTIONS !== "true") {
    throw new Error(
      "La materialización de pins está limitada al checkout efímero de GitHub Actions.",
    );
  }
  if (process.versions.node.split(".")[0] !== "22") {
    throw new Error("La preparación CI requiere Node 22.x.");
  }
  const packageConfiguration = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  if (packageConfiguration.devDependencies?.supabase !== expectedCliVersion) {
    throw new Error(
      `package.json debe fijar Supabase CLI exactamente en ${expectedCliVersion}.`,
    );
  }
  materializeSupabaseVersionPins(root);
  console.log(
    `Supabase CI pins: PASS (${SUPABASE_VERSION_PIN_FILES.length}/5 archivos no secretos, inventario exacto).`,
  );
}

try {
  main();
} catch (error) {
  console.error(
    `Supabase CI pins: BLOQUEADO — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
