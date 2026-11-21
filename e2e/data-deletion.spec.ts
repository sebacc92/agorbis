import { expect, test } from "@playwright/test";
import { nativeContextOptions } from "./native-context";

for (const language of ["es", "en"] as const) {
  test(`las instrucciones de borrado son públicas sin JavaScript (${language})`, async ({ browser }) => {
    const context = await browser.newContext({ ...nativeContextOptions });
    try {
      const page = await context.newPage();
      const response = await page.goto(`/eliminar-datos/?lang=${language}`);
      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(/\/eliminar-datos\/$/);
      const content = page.locator("article");
      await expect(content.getByRole("heading", { level: 1 })).toHaveText(
        language === "es" ? "Eliminar tu cuenta y tus datos" : "Delete your account and data",
      );
      await expect(content.getByRole("heading", {
        name: language === "es" ? "Solicitar el borrado sin ingresar" : "Request deletion without signing in",
      })).toBeVisible();
      await expect(content.getByRole("heading", {
        name: language === "es" ? "Si usaste Facebook para ingresar" : "If you used Facebook to sign in",
      })).toBeVisible();
      const mailLink = content.locator('a[href^="mailto:"]').first();
      const href = await mailLink.getAttribute("href");
      expect(new URL(href!).searchParams.get("subject")).toBe(
        language === "es" ? "Solicitud de eliminación de cuenta o datos de Agorbis" : "Request to delete an Agorbis account or data",
      );
      await expect(content.locator('a[href="/perfil/eliminar"]')).toBeVisible();
      await expect(content.locator('a[href="/privacidad"]')).toBeVisible();
      await expect(content.locator("form")).toHaveCount(0);
      await expect(content.locator('input[type="password"]')).toHaveCount(0);
      await expect(page.locator("footer").locator('a[href="/eliminar-datos"]')).toHaveCount(1);
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    } finally {
      await context.close();
    }
  });
}
