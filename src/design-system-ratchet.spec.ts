import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trinquete del sistema de diseño (D96): lo que ya se limpió no vuelve.
 *
 * - Texto en píxeles (`text-[11px]`). No crece con la escala de
 *   Accesibilidad, que cambia el `font-size` de `<html>`, ni con la letra
 *   del navegador. Para lo chico están `text-2xs` y `text-3xs` (`global.css`).
 * - Colores crudos de la paleta de Tailwind (`amber-100`, `slate-500`). D36
 *   ordenó la paleta en familias semánticas con contraste revisado por tema
 *   (`success` es esmeralda, `accent` ámbar, `warn` naranja, `danger` rosa),
 *   pero unos 480 usos crudos la esquivaban. Los esmeralda ya pasaron a
 *   `success`. El resto queda congelado por archivo: se puede bajar, no subir,
 *   y un archivo nuevo empieza en cero.
 *
 * Los imprimibles quedan afuera: se diseñan para papel, con tamaños y tintas
 * fijas que no deben cambiar con las preferencias de la pantalla.
 */
const PRINTABLE = /^src\/routes\/.*\/(afiche|nota-formal|planilla|dossier)\//;

const PIXEL_TEXT = /(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g;

const RAW_PALETTE =
  /(?<![\w-])-?(?:bg|text|border(?:-[xytrblse])?|ring(?:-offset)?|outline|divide|from|via|to|fill|stroke|shadow|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|[1-9]00|950)(?![\w-])/g;

/**
 * Usos crudos permitidos por archivo. Al migrar uno a tokens, bajá su número
 * (o borrá la línea si llegó a cero): la prueba lo pide para que el margen
 * liberado no lo vuelva a ocupar otro cambio.
 */
const RAW_PALETTE_BASELINE: Record<string, number> = {
  "src/components/budget/BudgetCostEstimatorWizard.tsx": 5,
  "src/components/budget/BudgetSandboxSimulator.tsx": 1,
  "src/components/budget/ProposalComparisonModal.tsx": 1,
  "src/components/claims/BeforeAfterSlider.tsx": 3,
  "src/components/claims/SocialFlyerModal.tsx": 1,
  "src/components/community/CivicSummaryCardModal.tsx": 10,
  "src/components/debates/AssertiveCivicToneAssistant.tsx": 10,
  "src/components/forms/FormShell.tsx": 11,
  "src/components/profile/SavedBookmarksCard.tsx": 4,
  "src/components/ui/Toast.tsx": 6,
  "src/routes/c/[slug]/debates/index.tsx": 5,
  "src/routes/c/[slug]/index.tsx": 42,
  "src/routes/c/[slug]/presupuesto/index.tsx": 30,
  "src/routes/c/[slug]/reclamos/nuevo/index.tsx": 2,
  "src/routes/c/[slug]/rendicion/index.tsx": 39,
  "src/routes/instituciones/[slug]/index.tsx": 6,
  "src/routes/registro/index.tsx": 6,
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });
}

function screenSources() {
  return sourceFiles("src")
    .map((path) => relative(process.cwd(), path).split("\\").join("/"))
    .filter((file) => !PRINTABLE.test(file))
    .map((file) => ({ file, source: readFileSync(file, "utf8") }));
}

describe("trinquete del sistema de diseño", () => {
  const sources = screenSources();

  it("recorre las pantallas y deja afuera los imprimibles", () => {
    expect(sources.length).toBeGreaterThan(300);
    expect(sources.some(({ file }) => PRINTABLE.test(file))).toBe(false);
  });

  it("ningún texto de pantalla se mide en píxeles", () => {
    const found = sources.flatMap(({ file, source }) =>
      [...source.matchAll(PIXEL_TEXT)].map((match) => `${file}: ${match[0]}`),
    );
    expect(found, "usá text-2xs, text-3xs o un valor en rem").toEqual([]);
  });

  it("los colores crudos de Tailwind no suben de lo congelado", () => {
    const current = new Map(
      sources
        .map(({ file, source }) => [
          file,
          (source.match(RAW_PALETTE) ?? []).length,
        ] as const)
        .filter(([, count]) => count > 0),
    );
    const grew = [...current]
      .filter(([file, count]) => count > (RAW_PALETTE_BASELINE[file] ?? 0))
      .map(
        ([file, count]) =>
          `${file}: ${count} (congelado en ${RAW_PALETTE_BASELINE[file] ?? 0})`,
      );
    expect(
      grew,
      "usá los tokens del tema (brand, accent, data, success, warn, danger, mist)",
    ).toEqual([]);

    const loosened = Object.entries(RAW_PALETTE_BASELINE)
      .filter(([file, allowed]) => (current.get(file) ?? 0) < allowed)
      .map(
        ([file, allowed]) =>
          `${file}: quedan ${current.get(file) ?? 0} de ${allowed}`,
      );
    expect(
      loosened,
      "bajá el número congelado de estos archivos en RAW_PALETTE_BASELINE",
    ).toEqual([]);
  });
});
