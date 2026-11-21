import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    if (!/\.(?:ts|tsx)$/.test(entry.name) || /\.spec\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [readFileSync(path, "utf8")];
  });
}

describe("límites de la arquitectura Turnstile A/B", () => {
  it.each([
    "src/routes/perfil/contrasena/index.tsx",
    "src/routes/perfil/seguridad/index.tsx",
    "src/routes/perfil/eliminar/index.tsx",
  ])("%s no incorpora CAPTCHA", (route) => {
    expect(source(route)).not.toMatch(
      /turnstile|captcha_?token|cf-turnstile-response/i,
    );
  });

  it("el código de producción sólo conoce la site key pública del Widget A", () => {
    const appSource = productionSources(join(root, "src")).join("\n");
    const siteKeyIdentifiers = new Set(
      (appSource.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? []).filter(
        (identifier) =>
          identifier.includes("TURNSTILE") &&
          identifier.includes("SITE") &&
          identifier.includes("KEY"),
      ),
    );

    expect([...siteKeyIdentifiers]).toEqual(["PUBLIC_TURNSTILE_SITE_KEY"]);
    expect(appSource).not.toMatch(
      /\b(?:0x4[A-Za-z0-9_-]{16,}|[123]x0{20}[A-Z]{2})\b/,
    );
  });
});
