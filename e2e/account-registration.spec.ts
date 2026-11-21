import { expect, test } from "@playwright/test";
import { nativeContextOptions } from "./native-context";

const password = "UnaComunidad-2026!";
// Casilla unificada de LegalConsentFields (desde 2ed0a3d el alta es un solo
// paso: datos, acuerdos y transferencias en el mismo formulario).
const legalConsent = /Confirmo que tengo 18 años o más, acepto los/;
const transferConsent = /Consiento expresamente las transferencias internacionales/;

test("el registro conserva la publicación al alternar con ingresar y reenviar confirmación", async ({ page }) => {
  const next = "/c/barrio/reclamos/nuevo?categoria=veredas#descripcion";
  const suffix = `?next=${encodeURIComponent(next)}`;
  await page.goto(`/registro/${suffix}`);
  const headerLogin = page.locator("header").getByRole("link", { name: "Ingresá", exact: true });
  await expect(headerLogin).toHaveAttribute("href", `/ingresar${suffix}`);
  await headerLogin.click();
  const headerRegistration = page.locator("header").getByRole("link", { name: "Crear cuenta", exact: true });
  await expect(headerRegistration).toHaveAttribute("href", `/registro${suffix}`);
  await headerRegistration.click();
  await expect(page.locator('form').filter({ has: page.getByLabel("Correo electrónico") }).locator('input[name="next"]')).toHaveValue(next);
  await expect(page.locator("main").getByRole("link", { name: "Ingresá", exact: true })).toHaveAttribute("href", `/ingresar${suffix}`);
  await page.locator("main").getByRole("link", { name: "Ingresá", exact: true }).click();
  await expect(page.locator('input[name="next"]').first()).toHaveValue(next);
  await expect(page.getByRole("link", { name: "Creá una", exact: true })).toHaveAttribute("href", `/registro${suffix}`);

  await page.goto(`/reenviar-confirmacion/${suffix}`);
  await expect(page.locator('input[name="next"]')).toHaveValue(next);
  await expect(page.getByRole("link", { name: "Volver a ingresar", exact: true })).toHaveAttribute("href", `/ingresar${suffix}`);
});

test("el encabezado de acceso no propaga un next externo", async ({ page }) => {
  await page.goto(`/registro/?next=${encodeURIComponent("//example.invalid")}`);
  await expect(page.locator("header").getByRole("link", { name: "Ingresá", exact: true })).toHaveAttribute("href", "/ingresar");
});

test("el registro no envía nada sin los acuerdos y conserva lo escrito", async ({ page }) => {
  await page.goto("/registro/");
  await expect(page.getByText("Faltan 12 caracteres")).toHaveCount(0);

  const legal = page.getByLabel(legalConsent);
  const transfers = page.getByLabel(transferConsent);
  await expect(legal).toHaveAttribute("required", "");
  await expect(transfers).toHaveAttribute("required", "");
  await expect(legal).not.toBeChecked();
  await expect(transfers).not.toBeChecked();
  for (const name of ["age_confirmed", "terms_accepted", "privacy_acknowledged", "community_rules_accepted"]) {
    await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue("");
  }
  const agreements = page.getByRole("group", { name: "Antes de continuar" });
  await expect(agreements.getByRole("link", { name: "Términos" })).toHaveAttribute("href", /\/terminos\/?$/);
  await expect(agreements.getByRole("link", { name: "Política de privacidad" })).toHaveAttribute("href", /\/privacidad\/?$/);
  await expect(agreements.getByRole("link", { name: "Normas comunitarias" })).toHaveAttribute("href", /\/normas-comunitarias\/?$/);

  await page.getByLabel("Correo electrónico").fill("vecina@example.com");
  // D101: letras y números. Sin número no cumple; con 13 caracteres de letras
  // y números cumple; la contraseña completa, con mayúsculas y símbolo, es
  // además más fuerte, sin que la UI la llame "excelente".
  // D108: la pista guía el campo vacío; con texto, la lista de chequeo ya la
  // reemplaza y no se repite.
  const passwordHint = page.getByText("Usá al menos 12 caracteres, con letras y números.");
  await expect(passwordHint).toBeVisible();
  await page.locator("input#password").fill("solominusculas");
  await expect(passwordHint).toHaveCount(0);
  await expect(page.getByText("Todavía no cumple los requisitos")).toBeVisible();
  await page.locator("input#password").fill("solominus2026");
  await expect(page.getByText("Cumple los requisitos", { exact: true })).toBeVisible();
  await page.locator("input#password").fill(password);
  await expect(page.getByText("Cumple los requisitos y es más fuerte")).toBeVisible();

  const posts: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()); });

  // Sin acuerdos el navegador frena el envío y lleva el foco a la casilla
  // legal; con los acuerdos pero sin transferencias, a la de transferencias.
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(legal).toBeFocused();
  await legal.check();
  for (const name of ["age_confirmed", "terms_accepted", "privacy_acknowledged", "community_rules_accepted"]) {
    await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue("si");
  }
  await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
  await expect(transfers).toBeFocused();
  expect(posts).toEqual([]);

  // Desmarcar el acuerdo legal vuelve a vaciar los campos derivados.
  await legal.uncheck();
  for (const name of ["age_confirmed", "terms_accepted", "privacy_acknowledged", "community_rules_accepted"]) {
    await expect(page.locator(`input[type="hidden"][name="${name}"]`)).toHaveValue("");
  }
  await expect(page.getByLabel("Correo electrónico")).toHaveValue("vecina@example.com");
  await expect(page.locator("input#password")).toHaveValue(password);
  expect(posts).toEqual([]);
});

for (const locale of ["es", "en"]) {
  test(`el registro y su encabezado caben a 320px en ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`/registro/?lang=${locale}`);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("h1")).toBeInViewport();
    await expect(page.locator('input[type="email"]')).toBeInViewport();
    await expect(page.locator('aside[aria-label]')).toBeHidden();
    await expect(page.locator("header").getByRole("searchbox")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    const header = page.locator("header");
    for (const link of await header.getByRole("link").all()) {
      const bounds = await link.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    }
  });
}

test("sin JavaScript el formulario nunca envía credenciales por GET", async ({ browser }) => {
  const context = await browser.newContext({ ...nativeContextOptions });
  try {
    const page = await context.newPage();
    await page.goto("/registro/");
    await page.getByLabel("Correo electrónico").fill("vecina@example.com");
    await page.locator("input#password").fill(password);
    // Los acuerdos son `required` también sin JavaScript: sin marcarlos el
    // navegador no envía el formulario.
    await page.getByLabel(legalConsent).check();
    await page.getByLabel(transferConsent).check();
    let posted = false;
    await page.route("**/registro/**", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().url()).not.toContain("vecina");
      expect(route.request().url()).not.toContain(password);
      const body = route.request().postData() ?? "";
      // urlencoded o multipart: lo que importa es que viajen las casillas.
      expect(body).toMatch(/legal_consent(?:=si|"\r\n\r\nsi)/);
      expect(body).toMatch(/international_transfers_consented(?:=si|"\r\n\r\nsi)/);
      posted = true;
      await route.fulfill({ status: 200, contentType: "text/html", body: "<p>POST recibido</p>" });
    });
    await page.getByRole("button", { name: "Crear cuenta", exact: true }).click();
    await expect(page.getByText("POST recibido")).toBeVisible();
    expect(posted).toBe(true);
  } finally {
    await context.close();
  }
});
