import { expect, test, type Page } from "@playwright/test";

// Rutas públicas que entraron en octubre de 2026 sin ningún e2e. tsc, eslint y
// vitest no ven una CSP que bloquea un QR, un iframe en blanco o un error de
// hidratación: este recorrido anónimo sí, porque corre contra el build de
// preview con las cabeceras reales (playwright.config.ts).
//
// Datos del seed local (supabase/seed.sql), los mismos que usan smoke y
// publication-drafts: el primer reclamo es de Mar del Plata y el primer
// proyecto también.
const seededCommunitySlug = "mar-del-plata";
const seededClaimId = "e0000000-0000-4000-8000-000000000001";
const seededProjectId = "f0000000-0000-4000-8000-000000000001";

const routes = [
  `/reclamos/${seededClaimId}/afiche/`,
  `/reclamos/${seededClaimId}/dossier/`,
  `/reclamos/${seededClaimId}/planilla/`,
  `/reclamos/${seededClaimId}/nota-formal/`,
  `/proyectos/${seededProjectId}/afiche/`,
  `/c/${seededCommunitySlug}/victorias/`,
  `/c/${seededCommunitySlug}/rendicion/`,
  `/c/${seededCommunitySlug}/comparativa/`,
  `/c/${seededCommunitySlug}/mapa/`,
  `/c/${seededCommunitySlug}/instituciones/`,
] as const;

interface CspViolation {
  blockedURI: string;
  violatedDirective: string;
  sourceFile: string;
}

declare global {
  interface Window {
    __agorbisCspViolations?: CspViolation[];
  }
}

async function collectProblems(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  // Se registra antes de cualquier script de la página para no perder las
  // violaciones que ocurren durante el primer render.
  await page.addInitScript(() => {
    window.__agorbisCspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__agorbisCspViolations?.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        sourceFile: event.sourceFile,
      });
    });
  });
  return { pageErrors, consoleErrors };
}

test.describe("rutas públicas nuevas (anónimo)", () => {
  for (const route of routes) {
    test(`${route} carga sin errores ni violaciones de CSP`, async ({ page }) => {
      const { pageErrors, consoleErrors } = await collectProblems(page);

      const response = await page.goto(route);
      expect(response?.status(), route).toBe(200);
      await expect(page.locator("main#contenido")).toBeVisible();
      // Da tiempo a que carguen imágenes, iframes y las tareas visibles.
      await page.waitForLoadState("networkidle");

      const violations = await page.evaluate(
        () => window.__agorbisCspViolations ?? [],
      );
      expect(violations, `${route}: violaciones de CSP`).toEqual([]);
      expect(pageErrors, `${route}: errores no capturados`).toEqual([]);
      expect(consoleErrors, `${route}: console.error`).toEqual([]);
    });
  }
});
