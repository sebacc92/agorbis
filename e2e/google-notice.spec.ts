import { expect, test } from "@playwright/test";

test("el aviso Google aprobado es público y conserva los límites informados", async ({ page }) => {
  const response = await page.goto("/acceso-google/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.getByRole("heading", { name: "Acceso opcional con Google", exact: true })).toBeVisible();
  await expect(page.getByText("Versión 2026-09-09.1", { exact: false })).toBeVisible();
  await expect(page.getByText("El acceso con Google todavía no está disponible. Podés continuar por correo.", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/no contamos con una lista completa de países ni con todos los plazos de borrado confirmados/)).toBeVisible();
  await expect(page.getByText(/No elimina ni desvincula la identidad Google y no deshace el tratamiento anterior/)).toBeVisible();
  await expect(page.getByText(/Google opera infraestructura global y puede procesar información fuera de tu país/)).toBeVisible();
  // Reading the public notice cannot record a decision or start OAuth.
  await expect(page.locator('input[name="google_auth_consented"]')).toHaveCount(0);
  await expect(page.locator('input[name="google_notice_hash"]')).toHaveCount(0);
  await page.goto("/ingresar/");
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
});

test("un enlace Google vencido no muestra silenciosamente otro aviso", async ({ page }) => {
  await page.goto("/acceso-google/?version=unpublished&hash=" + "0".repeat(64));
  await expect(page.getByText("Este enlace corresponde a otra versión del aviso de Google. Leé el aviso vigente y recargá el formulario de acceso antes de continuar.", { exact: true })).toBeVisible();
  await expect(page.getByText("Versión 2026-09-09.1", { exact: false })).toHaveCount(0);
  await page.getByRole("link", { name: "Ver aviso vigente", exact: true }).click();
  await expect(page.getByText("Versión 2026-09-09.1", { exact: false })).toBeVisible();
});
