import { expect, test } from "@playwright/test";
import { nativeContextOptions } from "./native-context";

const profileId = "33333333-3333-4333-8333-333333333333";

test("el enlace UUID anterior redirige temporalmente al nombre público y no se cachea", async ({ request }) => {
  const response = await request.get(`/u/${profileId}/`, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toMatch(/^\/u\/sofia_mdq\/?$/);
  expect(response.headers()["cache-control"]).toContain("no-store");
});

for (const language of ["es", "en"] as const) {
  test(`el perfil por nombre es público a 320px sin JavaScript (${language})`, async ({ browser }) => {
    const context = await browser.newContext({ ...nativeContextOptions, viewport: { width: 320, height: 740 } });
    try {
      const page = await context.newPage();
      const response = await page.goto(`/u/sofia_mdq/?lang=${language}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sofía Rearte");
      await expect(page.locator("main").getByText("@sofia_mdq", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", {
        name: language === "es" ? "Lo que publicó" : "What they published",
      })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
      await expect(page.locator("main")).not.toContainText("Bioquímica, ciclista urbana y fanática del invierno en la costa.");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    } finally {
      await context.close();
    }
  });
}

test("un nombre desconocido responde 404 sin redirigir a otra cuenta", async ({ request }) => {
  const response = await request.get("/u/unknown_handle_0065/", { maxRedirects: 0 });
  expect(response.status()).toBe(404);
  expect(response.headers().location).toBeUndefined();
});
