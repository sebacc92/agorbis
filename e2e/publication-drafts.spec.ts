import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("el rechazo conserva el borrador privado, enfoca el error y publicar sólo borra el propio", async ({ page }) => {
  test.setTimeout(90_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const title = `Borrador E2E ${crypto.randomUUID()}`;
  const description = "Descripción que debe sobrevivir al rechazo del servidor.";
  const formPath = "/c/mar-del-plata/reclamos/nuevo/";
  const draftKey = "agorbis:draft:33333333-3333-4333-8333-333333333333:claim:mar-del-plata";
  const otherDraftKey = "agorbis:draft:44444444-4444-4444-8444-444444444444:claim:mar-del-plata";
  const legacyDraftKey = "agorbis:draft:claim:mar-del-plata";
  const foreignDraft = JSON.stringify({ title: "Texto privado de otra cuenta", description: "Este borrador no se debe restaurar ni eliminar." });
  page.on("dialog", (dialog) => dialog.accept());
  // Una sola pantalla: la única revisión es la del servidor.
  const reviewClaim = async () => {
    await page.getByRole("button", { name: "Revisar antes de publicar" }).click();
  };

  try {
    await page.goto(`/ingresar/?next=${encodeURIComponent(formPath)}`);
    await page.evaluate(({ otherDraftKey, legacyDraftKey, foreignDraft }) => {
      localStorage.setItem(otherDraftKey, foreignDraft);
      localStorage.setItem(legacyDraftKey, foreignDraft);
    }, { otherDraftKey, legacyDraftKey, foreignDraft });
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${formPath}$`), { timeout: 20_000 });

    // Un navegador compartido no importa texto de otra cuenta ni el antiguo
    // borrador sin dueño. La recarga posterior sí debe restaurar el propio.
    await expect(page.locator('input[name="title"]')).toHaveValue("");
    await expect(page.locator('textarea[name="description"]')).toHaveValue("");
    await expect(page.locator('#images')).toHaveAttribute("aria-describedby", "claim-images-help claim-images-draft-help");
    await expect(page.locator('#claim-images-draft-help')).toBeVisible();
    await expect(page.locator('#claim-images-draft-help')).toContainText("Las fotos no se guardan en el borrador.");

    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="description"]').fill(description);
    await reviewClaim();
    await expect(page.getByRole("heading", { name: "Confirmá tu reclamo" })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toContain(title);

    // Un rechazo real de la acción tras revisar: no se simula un éxito ni se
    // interfiere con RLS. La comunidad inexistente provoca un 404 controlado.
    await page.locator('input[name="community_slug"]').evaluate((input: HTMLInputElement) => {
      input.value = "comunidad-e2e-inexistente";
    });
    await page.getByRole("button", { name: "Publicar reclamo" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "No se publicó todavía" });
    await expect(summary).toContainText("Esa comunidad no existe.");
    await expect(summary).toBeFocused();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toContain(description);

    await page.reload();
    await expect(page.locator('input[name="title"]')).toHaveValue(title);
    await expect(page.locator('textarea[name="description"]')).toHaveValue(description);
    await page.locator('input[name="title"]').fill("a");
    // Sin pasos, el título corto lo rechaza el servidor como sin JavaScript:
    // el resumen recibe el foco y el error queda junto al campo.
    await page.getByRole("button", { name: "Revisar antes de publicar", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "No se publicó todavía" })).toBeFocused();
    await expect(page.getByRole("alert").filter({ hasText: "Mínimo 3 caracteres." }).last()).toBeVisible();

    await page.locator('input[name="title"]').fill(title);
    await reviewClaim();
    await page.getByRole("button", { name: "Publicar reclamo" }).click();
    await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]{36}\/?\?publicado=1$/);
    await expect(page.getByRole("heading", { name: "Tu reclamo ya está publicado", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull();
    await page.goto(formPath);
    await expect(page.locator('input[name="title"]')).toHaveValue("");
    expect(await page.evaluate(({ otherDraftKey, legacyDraftKey }) => [
      localStorage.getItem(otherDraftKey), localStorage.getItem(legacyDraftKey),
    ], { otherDraftKey, legacyDraftKey })).toEqual([foreignDraft, foreignDraft]);
  } finally {
    const { error } = await admin.from("claims").delete().eq("author_id", "33333333-3333-4333-8333-333333333333").eq("title", title);
    expect(error, "limpieza de la publicación E2E local").toBeNull();
  }
});

async function openLocalForm(page: import("@playwright/test").Page, path: string) {
  test.setTimeout(60_000);
  const localUrl = process.env.PUBLIC_SUPABASE_URL;
  if (!localUrl || !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)) {
    throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  }
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/ingresar/?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 20_000 });
}

test("el borrador se guarda al escribir y antes de navegar dentro de la app", async ({ page }) => {
  const path = "/c/mar-del-plata/reclamos/nuevo/";
  const key = "agorbis:draft:33333333-3333-4333-8333-333333333333:claim:mar-del-plata";
  await openLocalForm(page, path);
  await page.locator('input[name="title"]').fill("Una plaza accesible");
  await page.locator('textarea[name="description"]').fill("Texto guardado sin enviar el formulario.");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toContain("Texto guardado sin enviar");
  await expect(page.getByText("Borrador guardado en este dispositivo", { exact: true }).first()).toBeVisible();

  await page.evaluate(() => { (window as Window & { draftProbe?: boolean }).draftProbe = true; });
  await page.locator('textarea[name="description"]').fill("Última modificación antes de salir.");
  await page.locator('header a[href="/inicio"]').first().click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
  expect(await page.evaluate(() => (window as Window & { draftProbe?: boolean }).draftProbe)).toBe(true);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toContain("Última modificación antes de salir.");
  await page.goBack();
  await expect(page.locator('textarea[name="description"]')).toHaveValue("Última modificación antes de salir.");
});

test("el proyecto valida cada paso, recupera todo y permite volver a editar la revisión", async ({ page }) => {
  const path = "/c/mar-del-plata/proyectos/nuevo/";
  const key = "agorbis:draft:33333333-3333-4333-8333-333333333333:project:mar-del-plata";
  await openLocalForm(page, path);
  await page.getByRole("button", { name: "Seguir con el plan" }).click();
  await expect(page.locator('input[name="title"]')).toBeFocused();
  await page.locator('input[name="title"]').fill("Bicicleteros en las escuelas");
  await page.locator('textarea[name="summary"]').fill("Un espacio seguro para las bicicletas.");
  await page.getByRole("button", { name: "Seguir con el plan" }).click();
  await page.getByRole("button", { name: "Seguir con el presupuesto" }).click();
  await expect(page.locator('textarea[name="plan"]')).toBeFocused();
  await page.locator('textarea[name="plan"]').fill("Relevar escuelas y construir los bicicleteros.");
  await page.getByRole("button", { name: "Seguir con el presupuesto" }).click();
  await page.locator('input[name="budget_amount"]').fill("2500");
  await page.locator('select[name="currency"]').selectOption("USD");
  await page.locator('textarea[name="resources_needed"]').fill("Dos personas y materiales.");
  await page.locator('input[name="time_estimate"]').fill("9 meses");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toContain('"timeEstimate":"9 meses"');
  await page.reload();
  await expect(page.locator('input[name="title"]')).toHaveValue("Bicicleteros en las escuelas");
  await page.getByRole("button", { name: "Seguir con el plan" }).click();
  await page.getByRole("button", { name: "Seguir con el presupuesto" }).click();
  await expect(page.locator('select[name="currency"]')).toHaveValue("USD");
  await expect(page.locator('textarea[name="resources_needed"]')).toHaveValue("Dos personas y materiales.");
  await expect(page.locator('input[name="time_estimate"]')).toHaveValue("9 meses");
  await page.getByRole("button", { name: "Revisar antes de publicar" }).click();
  await expect(page.getByRole("heading", { name: "Confirmá tu proyecto" })).toBeVisible();
  await page.getByRole("link", { name: "Volver a editar" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible();
  await expect(page.locator('input[name="time_estimate"]')).toHaveValue("9 meses");
});

test("la encuesta recupera opciones, tipo, categoría, selección y cierre", async ({ page }) => {
  const path = "/c/mar-del-plata/encuestas/nueva/";
  const key = "agorbis:draft:33333333-3333-4333-8333-333333333333:poll:mar-del-plata";
  await openLocalForm(page, path);
  await page.locator('input[name="question"]').fill("¿Dónde instalamos los bicicleteros?");
  await page.locator('textarea[name="description"]').fill("Elegí hasta dos escuelas.");
  await page.locator('input[name="type"][value="multiple"]').locator("..").click();
  await page.locator('input[name="category"][value="transporte"]').locator("..").click();
  await page.getByRole("button", { name: "Agregar opción" }).click();
  for (const [index, label] of ["Escuela norte", "Escuela sur", "Escuela este", "Escuela oeste"].entries()) {
    await page.locator('input[name="options[]"]').nth(index).fill(label);
  }
  await page.locator('input[name="max_choices"]').fill("2");
  await page.locator('input[name="closes_at"]').fill("2030-08-01T10:30");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toContain("Escuela oeste");
  await page.reload();
  await expect(page.locator('input[name="options[]"]')).toHaveCount(4);
  await expect(page.locator('input[name="options[]"]').nth(3)).toHaveValue("Escuela oeste");
  await expect(page.locator('input[name="type"][value="multiple"]')).toBeChecked();
  await expect(page.locator('input[name="category"][value="transporte"]')).toBeChecked();
  await expect(page.locator('input[name="max_choices"]')).toHaveValue("2");
  await expect(page.locator('input[name="closes_at"]')).toHaveValue("2030-08-01T10:30");
});

test("si falla el almacenamiento avisa y permite cancelar la salida sin perder el texto", async ({ page }) => {
  const path = "/c/mar-del-plata/reclamos/nuevo/";
  await openLocalForm(page, path);
  page.removeAllListeners("dialog");
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("agorbis:draft:")) throw new DOMException("Storage blocked", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await page.locator('input[name="title"]').fill("Un texto que sigue sin guardar");
  await expect(page.getByText("No pudimos guardar el borrador en este dispositivo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Borrador guardado en este dispositivo", { exact: true })).toHaveCount(0);
  const confirmation = page.waitForEvent("dialog");
  const click = page.locator('header a[href="/inicio"]').first().click();
  const dialog = await confirmation;
  expect(dialog.type()).toBe("confirm");
  expect(dialog.message()).toContain("No pudimos guardar tu borrador");
  await dialog.dismiss();
  await click;
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await expect(page.locator('input[name="title"]')).toHaveValue("Un texto que sigue sin guardar");
});

test("al cambiar de comunidad por SPA se recupera y escribe sólo el borrador de destino", async ({ page }) => {
  await openLocalForm(page, "/c/mar-del-plata/proyectos/nuevo/");
  const source = "agorbis:draft:33333333-3333-4333-8333-333333333333:project:mar-del-plata";
  const destination = "agorbis:draft:33333333-3333-4333-8333-333333333333:project:argentina";
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ title: "Proyecto nacional independiente", currency: "USD" })), destination);
  await page.locator('input[name="title"]').fill("Proyecto municipal independiente");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), source)).toContain("Proyecto municipal independiente");
  await page.getByRole("button", { name: "Cambiar nivel" }).click();
  await page.locator('#selector-nivel a[href="/c/argentina/proyectos/nuevo"]').click();
  await expect(page.locator('input[name="community_slug"]')).toHaveValue("argentina");
  await expect(page.locator('input[name="title"]')).toHaveValue("Proyecto nacional independiente");
  await page.locator('input[name="title"]').fill("Cambio sólo nacional");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), destination)).toContain("Cambio sólo nacional");
  expect(await page.evaluate((key) => localStorage.getItem(key), source)).toContain("Proyecto municipal independiente");
  expect(await page.evaluate((key) => localStorage.getItem(key), source)).not.toContain("Cambio sólo nacional");
  await page.goBack();
  await expect(page.locator('input[name="community_slug"]')).toHaveValue("mar-del-plata");
  await expect(page.locator('input[name="title"]')).toHaveValue("Proyecto municipal independiente");
});

test("descartar un reclamo también restaura la categoría y no revive el borrador", async ({ page }) => {
  await openLocalForm(page, "/c/mar-del-plata/reclamos/nuevo/");
  const key = "agorbis:draft:33333333-3333-4333-8333-333333333333:claim:mar-del-plata";
  await page.locator('input[name="title"]').fill("Un reclamo para descartar");
  await page.locator('input[name="category"][value="salud"]').locator("..").click();
  await page.getByRole("button", { name: "Descartar borrador" }).click();
  await expect(page.locator('input[name="title"]')).toHaveValue("");
  await expect(page.locator('input[name="category"][value="infraestructura"]')).toBeChecked();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  // Da margen al debounce que estaba pendiente antes del descarte.
  await page.waitForTimeout(800);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
});

test("se puede revisar un proyecto sin presupuesto porque el importe es opcional", async ({ page }) => {
  await openLocalForm(page, "/c/mar-del-plata/proyectos/nuevo/");
  await page.locator('input[name="title"]').fill("Voluntariado sin presupuesto definido");
  await page.locator('textarea[name="summary"]').fill("Un proyecto que todavía no requiere una estimación de dinero.");
  await page.getByRole("button", { name: "Seguir con el plan" }).click();
  await page.locator('textarea[name="plan"]').fill("Convocar personas y definir las primeras tareas.");
  await page.getByRole("button", { name: "Seguir con el presupuesto" }).click();
  await expect(page.locator('input[name="budget_amount"]')).toHaveValue("");
  await page.getByRole("button", { name: "Revisar antes de publicar" }).click();
  await expect(page.getByRole("heading", { name: "Confirmá tu proyecto" })).toBeVisible();
  await expect(page.locator('input[name="budget_amount"]')).toHaveValue("");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("cerrar sesión desde un formulario no vuelve a crear sus borradores personales", async ({ page }) => {
  await openLocalForm(page, "/c/mar-del-plata/reclamos/nuevo/");
  const key = "agorbis:draft:33333333-3333-4333-8333-333333333333:claim:mar-del-plata";
  await page.locator('input[name="title"]').fill("Texto privado antes de cerrar sesión");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toContain("Texto privado");
  await page.getByRole("button", { name: /Menú de/ }).click();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  const signedOutHome = new URL("/?sesion=cerrada", page.url()).href;
  await expect(page).toHaveURL(signedOutHome);
  await expect(page.getByRole("link", { name: "Crear cuenta", exact: true }).first()).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await page.waitForTimeout(800);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
  await expect(page).toHaveURL(signedOutHome);
});
