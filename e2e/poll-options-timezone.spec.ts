import { expect, test, type Page } from "@playwright/test";
import { nativeContextOptions } from "./native-context";

async function login(page: Page) {
  test.setTimeout(120_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Esta prueba requiere Supabase local.");
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
}

test("la encuesta conserva ambas listas de opciones y la zona al recargar un borrador", async ({
  page,
}) => {
  await login(page);
  await page.goto("/c/mar-del-plata/encuestas/nueva/");
  await page.evaluate(() =>
    localStorage.removeItem(
      "agorbis:draft:33333333-3333-4333-8333-333333333333:poll:mar-del-plata",
    ),
  );
  await page.reload();
  await page
    .locator('input[name="question"]')
    .fill("¿Qué servicios priorizamos?");
  await page
    .getByRole("button", { name: "+ Agregar opción", exact: true })
    .click();
  await expect(page.locator('input[name="options[]"]').nth(3)).toBeFocused();
  for (const [index, value] of [
    "Salud",
    "Educación",
    "Transporte",
    "Ambiente",
  ].entries())
    await page.locator('input[name="options[]"]').nth(index).fill(value);
  await page
    .locator('input[name="type"][value="binary"]')
    .locator("..")
    .click();
  await expect(page.locator('input[name="options[]"]')).toHaveCount(2);
  await page.locator('input[name="options[]"]').nth(0).fill("Avanzar");
  await page.locator('input[name="options[]"]').nth(1).fill("Revisar");
  await page
    .locator('select[name="time_zone"]')
    .selectOption("Pacific/Auckland");
  await page.locator('input[name="closes_at"]').fill("2030-08-01T19:15");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = localStorage.getItem(
          "agorbis:draft:33333333-3333-4333-8333-333333333333:poll:mar-del-plata",
        );
        return value ? JSON.parse(value) : null;
      }),
    )
    .toEqual(
      expect.objectContaining({
        timeZone: "Pacific/Auckland",
        closesAt: "2030-08-01T19:15",
        options: ["Avanzar", "Revisar"],
        listOptions: ["Salud", "Educación", "Transporte", "Ambiente"],
      }),
    );
  await page.reload();
  await expect(page.locator('select[name="time_zone"]')).toHaveValue(
    "Pacific/Auckland",
  );
  await expect(page.locator('input[name="closes_at"]')).toHaveValue(
    "2030-08-01T19:15",
  );
  await page
    .locator('input[name="type"][value="multiple"]')
    .locator("..")
    .click();
  await expect(page.locator('input[name="options[]"]')).toHaveCount(4);
  for (const [index, value] of [
    "Salud",
    "Educación",
    "Transporte",
    "Ambiente",
  ].entries())
    await expect(
      page.locator('input[name="options[]"]').nth(index),
    ).toHaveValue(value);
  await page
    .locator('input[name="type"][value="binary"]')
    .locator("..")
    .click();
  await expect(page.locator('input[name="options[]"]').nth(0)).toHaveValue(
    "Avanzar",
  );
  await expect(page.locator('input[name="options[]"]').nth(1)).toHaveValue(
    "Revisar",
  );
});

test("sin JavaScript el cierre respeta la zona elegida y rechaza horas inexistentes o ambiguas", async ({
  page,
  browser,
}) => {
  await login(page);
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
    ...nativeContextOptions,
    locale: "es-AR",
    timezoneId: "Pacific/Auckland",
  });
  const native = await context.newPage();
  const submit = async () => {
    const response = native.waitForResponse(
      (result) =>
        result.request().isNavigationRequest() &&
        result.request().method() === "POST",
    );
    await native
      .getByRole("button", { name: "Revisar antes de publicar", exact: true })
      .focus();
    await native.keyboard.press("Enter");
    return response;
  };
  try {
    await native.goto("/c/mar-del-plata/encuestas/nueva/");
    await native
      .locator('input[name="question"]')
      .fill("¿Qué servicios priorizamos?");
    await native.locator('input[name="options[]"]').nth(0).fill("Salud");
    await native.locator('input[name="options[]"]').nth(1).fill("Educación");
    await native
      .locator('select[name="time_zone"]')
      .selectOption("America/New_York");
    await native.locator('input[name="closes_at"]').fill("2030-03-10T02:30");
    expect((await submit()).status()).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Esa hora no existe en la zona elegida",
    );
    await native.locator('input[name="closes_at"]').fill("2030-11-03T01:30");
    expect((await submit()).status()).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Esa hora ocurre dos veces en la zona elegida",
    );
    await native
      .locator('select[name="time_zone"]')
      .selectOption("Pacific/Auckland");
    await native.locator('input[name="closes_at"]').fill("2030-08-01T19:15");
    const review = await submit();
    expect(review.status()).toBe(200);
    expect(await review.text()).toContain("2030-08-01T07:15:00.000Z");
    await expect(native.getByText(/^Cierra el /)).toContainText(
      /07:15\s+p\.\s*m\./,
    );
    await expect(native.getByText(/^Cierra el /)).toContainText("GMT+12");
    await expect(native.getByText(/^Cierra el /)).toContainText(
      "Pacific/Auckland",
    );
    await native
      .getByRole("button", { name: "Volver a editar", exact: true })
      .focus();
    await native.keyboard.press("Enter");
    await expect(native.locator('select[name="time_zone"]')).toHaveValue(
      "Pacific/Auckland",
    );
    await expect(native.locator('input[name="closes_at"]')).toHaveValue(
      "2030-08-01T19:15",
    );
  } finally {
    await context.close();
  }
});
