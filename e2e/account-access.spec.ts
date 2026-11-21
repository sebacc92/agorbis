import { expect, test } from "@playwright/test";

test("las pantallas de cuenta anónimas no se guardan en caché", async ({ request }) => {
  for (const route of ["/ingresar/", "/registro/", "/recuperar/", "/reenviar-confirmacion/"]) {
    for (const method of ["GET", "HEAD"] as const) {
      const response = await request.fetch(route, { method });
      expect(response.status(), `${method} ${route}`).toBe(200);
      expect(response.headers()["cache-control"], route).toContain("no-store");
      // `same-origin` en las cuatro: conserva el `Origin` de los POST nativos
      // para el chequeo CSRF (D89) y no manda Referer a terceros.
      expect(response.headers()["referrer-policy"], route).toBe("same-origin");
    }
  }
});

test("el ingreso conserva el correo al cambiar de método con el teclado", async ({
  page,
}) => {
  await page.goto("/ingresar/?next=%2Fperfil");
  await page.getByLabel("Correo electrónico").fill("vecina@example.com");

  const passwordTab = page.getByRole("tab", { name: "Con contraseña" });
  const linkTab = page.getByRole("tab", { name: "Con un enlace" });
  await passwordTab.focus();
  await page.keyboard.press("ArrowRight");

  await expect(linkTab).toBeFocused();
  await expect(linkTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Con un enlace");
  await expect(page.getByLabel("Correo electrónico")).toHaveValue(
    "vecina@example.com",
  );
  await expect(page.locator('input[name="password"]')).toHaveCount(0);
  await expect(
    page.getByRole("tabpanel").locator('input[name="next"]'),
  ).toHaveValue("/perfil");

  await page.getByLabel("Correo electrónico").fill("otra@example.com");
  await linkTab.focus();
  await page.keyboard.press("ArrowLeft");

  await expect(passwordTab).toBeFocused();
  await expect(passwordTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Correo electrónico")).toHaveValue(
    "otra@example.com",
  );
  await expect(
    page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }),
  ).toHaveAttribute("href", /\/recuperar\/?$/);
});

for (const provider of ["Google", "Facebook"]) {
  test(`${provider} exige aviso disponible y consentimiento antes de iniciar el acceso`, async ({
    page,
  }) => {
    await page.goto("/ingresar/");
    const option = page.getByRole("button", {
      name: `Continuar con ${provider}`,
      exact: true,
    });
    if (provider === "Google" && String(process.env.PUBLIC_GOOGLE_AUTH_ENABLED) === "true")
      await expect(option).toBeVisible();
    test.skip(
      (await option.count()) === 0,
      "El proveedor requiere habilitación explícita en este entorno.",
    );

    await page.getByLabel("Correo electrónico").fill("vecina@example.com");
    await expect(
      page.locator('input[name="international_transfers_consented"]'),
    ).toHaveCount(0);
    await option.click();

    const consent = page.getByRole("region", {
      name: "Otras formas de ingresar",
    });
    await expect(consent.getByRole("heading")).toBeFocused();
    await expect(page.getByRole("tablist")).toBeHidden();
    await expect(
      consent.locator('input[name="international_transfers_consented"]'),
    ).toHaveCount(1);
    await expect(consent.getByRole("checkbox")).toHaveCount(provider === "Google" ? 4 : 3);
    if (provider === "Google") {
      const googleDecision = consent.locator('input[name="google_auth_consented"]');
      await expect(googleDecision).not.toBeChecked();
      await expect(googleDecision).toHaveAccessibleName(/Consiento expresamente el tratamiento de mis datos para acceder con Google y las transferencias internacionales descriptas en este aviso\./);
      await expect(consent.locator('input[name="google_notice_version"]')).toHaveValue("2026-09-09.1");
      const noticeHash = await consent.locator('input[name="google_notice_hash"]').inputValue();
      expect(noticeHash).toBe("b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3");
      await expect(consent.getByRole("link", { name: "Aviso versión 2026-09-09.1", exact: true })).toHaveAttribute("href", `/acceso-google?version=2026-09-09.1&hash=${noticeHash}`);
    }

    const posts: string[] = [];
    page.on("request", (request) => {
      const target = new URL(request.url());
      if (
        request.method() === "POST" &&
        target.origin === new URL(page.url()).origin &&
        target.pathname.replace(/\/$/, "") === "/ingresar"
      ) {
        posts.push(request.url());
      }
    });
    await consent
      .getByRole("button", { name: `Continuar con ${provider}`, exact: true })
      .click();
    await expect(consent.getByRole("checkbox").first()).toBeFocused();
    await expect(page).toHaveURL(/\/ingresar\/$/);
    expect(posts).toEqual([]);

    await consent.getByRole("button", { name: "Volver a las opciones" }).click();
    await expect(option).toBeFocused();
    await expect(page.getByLabel("Correo electrónico")).toHaveValue(
      "vecina@example.com",
    );
    await expect(consent.getByRole("checkbox")).toHaveCount(0);
  });
}

test("Google conserva el foco al montar los acuerdos con JavaScript demorado", async ({ page }) => {
  test.skip(String(process.env.PUBLIC_GOOGLE_AUTH_ENABLED) !== "true", "Google requiere habilitación explícita en este entorno.");
  test.setTimeout(45_000);
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  let delayedChunks = 0;
  await page.route(/\/build\/[^/?]+\.js(?:\?.*)?$/, async route => {
    delayedChunks += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto("/ingresar/");
  const option = page.getByRole("button", { name: "Continuar con Google", exact: true });
  await expect(option).toBeVisible();
  await option.click();
  const consent = page.getByRole("region", { name: "Otras formas de ingresar" });
  await expect(consent.getByRole("heading")).toBeFocused();
  await expect(page.getByRole("tablist")).toBeHidden();
  await consent.getByRole("button", { name: "Volver a las opciones" }).click();
  await expect(option).toBeFocused();
  await page.getByRole("tab", { name: "Con un enlace" }).click();
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Con un enlace");
  await expect(option).toBeVisible();
  expect(delayedChunks).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});
