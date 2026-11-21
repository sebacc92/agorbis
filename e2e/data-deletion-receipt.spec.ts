import { expect, test } from "@playwright/test";

// Sólo entradas ficticias inválidas: la validación local evita incluso la RPC.
test.use({ trace: "off", video: "off", screenshot: "off" });

for (const language of ["es", "en"] as const) {
  test(`el recibo privado usa POST y una respuesta genérica sin identificar cuentas (${language})`, async ({ page }) => {
    const response = await page.goto(`/eliminar-datos/seguimiento/?lang=${language}`);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    expect(response?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page).toHaveURL(/\/eliminar-datos\/seguimiento\/$/);
    const content = page.locator("article");
    await expect(content.getByRole("heading", { level: 1 })).toHaveText(
      language === "es" ? "Consultar una solicitud de eliminación" : "Check a deletion request",
    );
    await expect(content.locator("form")).toHaveAttribute("method", "post");
    await content.getByLabel(language === "es" ? "Referencia de solicitud" : "Request reference").fill("fixture-reference-invalid");
    await content.getByLabel(language === "es" ? "Código privado de consulta" : "Private access code").fill("fixture-code-invalid");
    const post = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/eliminar-datos/seguimiento/");
    await content.getByRole("button", { name: language === "es" ? "Consultar recibo" : "Check receipt", exact: true }).click();
    const request = await post;
    expect(request.url()).not.toContain("fixture-reference-invalid");
    expect(request.url()).not.toContain("fixture-code-invalid");
    await expect(content.getByRole("alert")).toContainText(
      language === "es" ? "No pudimos consultar el recibo." : "We could not retrieve the receipt.",
    );
    await expect(page).toHaveURL(/\/eliminar-datos\/seguimiento\/$/);
    await expect(content.locator("dl")).toHaveCount(0);
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
}
