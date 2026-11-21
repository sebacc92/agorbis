import { expect, test } from "@playwright/test";
import {
  localAccountAdmin,
  testAccountPassword,
} from "./account-followup-fixtures";

/**
 * D121: el alta se entiende sola en un teléfono. Registro con "Paso 1 de 5" y
 * aviso de dominio mal escrito; acuerdos explicados; nombre con vista previa;
 * lugar con el buscador primero y los continentes plegados; y cada paso navega
 * como documento, así que el botón nunca queda girando.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("el registro dice cuántos pasos son y avisa un dominio mal escrito", async ({
  page,
}) => {
  await page.goto("/registro/");
  const progress = page.getByRole("navigation", {
    name: "Progreso del registro",
  });
  await expect(progress).toContainText("Paso 1 de 5");
  await expect(page.getByText("Cinco pasos cortos")).toBeVisible();

  const email = page.getByLabel("Correo electrónico");
  await email.fill("dai@gmial.com");
  const suggestion = page.getByRole("button", { name: "dai@gmail.com" });
  await expect(suggestion).toBeVisible();
  await suggestion.click();
  await expect(email).toHaveValue("dai@gmail.com");
  await expect(page.getByText("¿Quisiste decir")).toHaveCount(0);
});

test("acuerdos, nombre y comunidad: cada paso se explica y navega como documento", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = localAccountAdmin();
  const email = `alta-${crypto.randomUUID()}@agorbis.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: testAccountPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("No se creó la cuenta.");
  try {
    await page.goto("/ingresar/");
    await page.getByLabel("Correo electrónico").fill(email);
    await page.locator('input[name="password"]').fill(testAccountPassword);
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();

    // Paso 3: los acuerdos, con la explicación de por qué se vuelven a marcar.
    await expect(page).toHaveURL(/\/consentimiento/);
    await expect(
      page.getByRole("navigation", { name: "Progreso del registro" }),
    ).toContainText("Paso 3 de 5");
    await expect(page.getByText(/Ya los marcaste al crear la cuenta/)).toBeVisible();
    for (const box of await page.getByRole("checkbox").all()) await box.check();
    const loads: string[] = [];
    page.on("load", () => loads.push(page.url()));
    await page
      .getByRole("button", { name: "Aceptar y continuar", exact: true })
      .click();

    // Paso 4: el nombre, con la vista previa en vivo.
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(
      page.getByRole("navigation", { name: "Progreso del registro" }),
    ).toContainText("Paso 4 de 5");
    const preview = page.locator("[data-name-preview]");
    await expect(preview).toContainText("Tu correo no se muestra en ningún lado.");
    await page.getByLabel("Nombre para mostrar", { exact: true }).fill("Dai Lentz");
    await expect(preview).toContainText("Dai Lentz");
    await expect(preview).toContainText("@dai_lentz");
    const username = `dai_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
    await page
      .getByRole("textbox", { name: "Nombre de usuario", exact: true })
      .fill(username);
    await expect(preview).toContainText(`@${username}`);
    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    // Paso 5: el lugar, buscador primero y continentes plegados.
    await expect(page).toHaveURL(/paso=lugar/);
    const search = page.getByRole("searchbox", {
      name: "Buscar ciudad, barrio o municipio por nombre",
    });
    await expect(search).toBeVisible();
    const summary = page.getByText("Explorar por continente");
    await expect(summary).toBeVisible();
    await expect(page.getByRole("link", { name: /África/ })).toBeHidden();
    const gps = page.getByRole("button", { name: "Usar mi ubicación actual" });
    await expect(gps).toBeVisible();
    // El GPS va después del buscador: alternativa, no camino principal.
    const searchBox = await search.boundingBox();
    const gpsBox = await gps.boundingBox();
    expect(gpsBox!.y).toBeGreaterThan(searchBox!.y);

    await search.fill("Miramar");
    await search.press("Enter");
    await page.getByRole("link", { name: /Miramar/ }).first().click();
    await expect(page).toHaveURL(/paso=confirmar/);
    await page
      .getByRole("button", { name: "Confirmar y entrar", exact: true })
      .click();
    await expect(page).toHaveURL(/\/inicio/);

    // Tres pasos, tres navegaciones de documento: acuerdos, nombre, confirmar
    // (la búsqueda y la elección son GET nativos y también cuentan).
    expect(loads.length).toBeGreaterThanOrEqual(3);
  } finally {
    await admin.auth.admin.deleteUser(data.user.id);
  }
});
