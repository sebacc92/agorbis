import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { crc32 } from "node:zlib";
import { nativeContextOptions } from "./native-context";

const ownerId = "33333333-3333-4333-8333-333333333333";
const privateMetadata = "GPS=123.456;Author=No publicar";

function imageWithMetadata() {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const payload = Buffer.from(`Comment\0${privateMetadata}`);
  const chunk = Buffer.alloc(payload.length + 12);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write("tEXt", 4, "ascii");
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(chunk.subarray(4, chunk.length - 4)),
    chunk.length - 4,
  );
  return {
    name: "evidencia.png",
    mimeType: "image/png",
    buffer: Buffer.concat([png.subarray(0, -12), chunk, png.subarray(-12)]),
  };
}

function localAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !secret ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  ) {
    throw new Error("Estas pruebas sólo pueden escribir en Supabase local.");
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function nativeSession(page: Page, browser: Browser) {
  test.setTimeout(150_000);
  localAdmin();
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
  // Turnstile requiere scripts. El recorrido nativo empieza con una sesión
  // existente y desactiva JavaScript antes de abrir cualquier formulario.
  const context = await browser.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
    ...nativeContextOptions,
    locale: "es-AR",
  });
  return { context, native: await context.newPage() };
}

async function submitNative(page: Page, label: string) {
  const received = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() &&
      response.request().method() === "POST",
  );
  // La animación hover puede cambiar la caja mientras Playwright intenta
  // hacer clic. Enter comprueba el mismo envío HTML nativo con teclado.
  await page.getByRole("button", { name: label, exact: true }).focus();
  await page.keyboard.press("Enter");
  return received;
}

test("sin JavaScript el proyecto conserva errores e importe local, revisa y publica", async ({
  page,
  browser,
}) => {
  const admin = localAdmin();
  const title = `Proyecto nativo ${crypto.randomUUID()}`;
  const { context, native } = await nativeSession(page, browser);
  try {
    await native.goto("/c/mar-del-plata/proyectos/nuevo/");
    await expect(native.locator('textarea[name="plan"]')).toBeVisible();
    await expect(native.locator('input[name="budget_amount"]')).toBeVisible();
    await expect(
      native.getByRole("button", { name: "Seguir con el plan" }),
    ).toBeHidden();
    await expect(
      native.getByText("Tu borrador se guarda en este dispositivo", {
        exact: true,
      }),
    ).toBeHidden();
    const action = await native
      .locator('input[name="community_slug"]')
      .locator("..")
      .getAttribute("action");
    expect(action).toBeTruthy();
    const actionUrl = new URL(action!, native.url());
    const form = {
      community_slug: "mar-del-plata",
      title,
      summary: "Resumen",
      plan: "Plan",
      budget_amount: "",
      budget_locale: "es",
      currency: "ARS",
    };
    const forged = await native.request.post(actionUrl.href, {
      headers: { Origin: "https://otro.example", Accept: "text/html" },
      form,
      maxRedirects: 0,
    });
    expect(forged.status()).toBe(403);
    const anonymous = await browser.newContext({ ...nativeContextOptions });
    try {
      const unauthenticated = await anonymous.request.post(actionUrl.href, {
        headers: { Origin: actionUrl.origin, Accept: "text/html" },
        form,
        maxRedirects: 0,
      });
      expect(unauthenticated.status()).toBe(302);
      expect(unauthenticated.headers().location).toMatch(/^\/ingresar\?next=/);
    } finally {
      await anonymous.close();
    }
    await native.locator('input[name="title"]').fill(title);
    await native
      .locator('textarea[name="summary"]')
      .fill("Un espacio seguro para las bicicletas.");
    await native.locator('input[name="budget_amount"]').fill("2.500,50");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Explicá cómo se llevaría a cabo.",
    );
    await expect(native.locator('input[name="title"]')).toHaveValue(title);
    await expect(native.locator('input[name="budget_amount"]')).toHaveValue(
      "2.500,50",
    );
    await native
      .locator('textarea[name="plan"]')
      .fill("Relevar escuelas e instalar los bicicleteros.");
    await native.locator('input[name="budget_amount"]').fill("2.50");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(400);
    await expect(native.locator("#budget-error")).toContainText("2.500,50");
    await expect(native.locator('textarea[name="plan"]')).toHaveValue(
      "Relevar escuelas e instalar los bicicleteros.",
    );
    await native.locator('input[name="budget_amount"]').fill("2.500,50");
    await native.locator('select[name="currency"]').selectOption("USD");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", {
        name: "Confirmá tu proyecto",
        exact: true,
      }),
    ).toBeVisible();
    await expect(native.locator('input[name="budget_amount"]')).toHaveValue(
      "2500.5",
    );
    expect(
      (
        await admin
          .from("projects")
          .select("id")
          .eq("author_id", ownerId)
          .eq("title", title)
      ).data,
    ).toEqual([]);
    expect((await submitNative(native, "Volver a editar")).status()).toBe(200);
    await expect(native.locator('input[name="title"]')).toHaveValue(title);
    await expect(native.locator('input[name="budget_amount"]')).toHaveValue(
      "2.500,50",
    );
    await expect(native.locator('input[name="budget_locale"]')).toHaveValue(
      "es",
    );
    await expect(native.locator('select[name="currency"]')).toHaveValue("USD");
    await native
      .locator('textarea[name="summary"]')
      .fill("Un espacio seguro y accesible para las bicicletas.");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", {
        name: "Confirmá tu proyecto",
        exact: true,
      }),
    ).toBeVisible();
    expect((await submitNative(native, "Publicar proyecto")).status()).toBe(
      303,
    );
    await expect(native).toHaveURL(/\/proyectos\/[0-9a-f-]{36}\/?\?publicado=1$/);
    await expect(
      native.getByRole("heading", {
        name: "Tu proyecto ya está publicado",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      native.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const stored = await admin
      .from("projects")
      .select("budget_amount,currency")
      .eq("author_id", ownerId)
      .eq("title", title)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data).toEqual({ budget_amount: 2500.5, currency: "USD" });
  } finally {
    await context.close();
    expect(
      (
        await admin
          .from("projects")
          .delete()
          .eq("author_id", ownerId)
          .eq("title", title)
      ).error,
    ).toBeNull();
  }
});

test("sin JavaScript el reclamo multipart conserva el texto tras un error y publica al confirmar", async ({
  page,
  browser,
}) => {
  const admin = localAdmin();
  const title = `Reclamo nativo ${crypto.randomUUID()}`;
  const uploads: string[] = [];
  const { context, native } = await nativeSession(page, browser);
  try {
    await native.goto("/c/mar-del-plata/reclamos/nuevo/");
    await expect(native.locator('input[name="location_text"]')).toBeVisible();
    await native.locator('input[name="title"]').fill("a");
    await native
      .locator('textarea[name="description"]')
      .fill("La vereda está rota frente a la plaza.");
    await native
      .locator('input[name="location_text"]')
      .fill("Frente a la plaza central");
    await native.locator('input[name="category"][value="ambiente"]').check();
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Mínimo 3 caracteres.",
    );
    await expect(native.locator('textarea[name="description"]')).toHaveValue(
      "La vereda está rota frente a la plaza.",
    );
    await expect(native.locator('input[name="location_text"]')).toHaveValue(
      "Frente a la plaza central",
    );
    await expect(
      native.locator('input[name="category"][value="ambiente"]'),
    ).toBeChecked();
    await native.locator('input[name="title"]').fill(title);
    // Simulamos coordenadas no confiables en el POST: el servidor debe
    // cuantizarlas antes de devolver HTML, restaurar campos o publicar.
    await native
      .locator('input[name="lat"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "-38.000123";
      });
    await native
      .locator('input[name="lng"]')
      .evaluate((input: HTMLInputElement) => {
        input.value = "-57.549876";
      });
    await native
      .locator('input[name="images"]')
      .setInputFiles(imageWithMetadata());
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", { name: "Confirmá tu reclamo", exact: true }),
    ).toBeVisible();
    await expect(native.locator('input[name="lat"]')).toHaveValue("-38");
    await expect(native.locator('input[name="lng"]')).toHaveValue("-57.55");
    for (const input of await native.locator('input[name="image_paths"]').all())
      uploads.push(await input.inputValue());
    const image = await native
      .locator('img[src^="/media/reclamos/pendientes/"]')
      .getAttribute("src");
    expect(image).toBeTruthy();
    const sanitized = await native.request.get(
      new URL(image!, native.url()).href,
    );
    expect(sanitized.status()).toBe(200);
    expect(
      (await sanitized.body()).includes(Buffer.from(privateMetadata)),
    ).toBe(false);
    expect(
      (
        await admin
          .from("claims")
          .select("id")
          .eq("author_id", ownerId)
          .eq("title", title)
      ).data,
    ).toEqual([]);
    expect((await submitNative(native, "Volver a editar")).status()).toBe(200);
    await expect(native.locator('input[name="title"]')).toHaveValue(title);
    await expect(native.locator('input[name="location_text"]')).toHaveValue(
      "Frente a la plaza central",
    );
    await expect(
      native.locator('input[name="category"][value="ambiente"]'),
    ).toBeChecked();
    await expect(native.locator('input[name="lat"]')).toHaveValue("-38");
    await expect(native.locator('input[name="lng"]')).toHaveValue("-57.55");
    await expect(
      native
        .getByRole("status")
        .filter({ hasText: "Volvé a seleccionar las fotos" }),
    ).toBeVisible();
    await native
      .locator('textarea[name="description"]')
      .fill("La vereda está rota y necesita una reparación accesible.");
    await native
      .locator('input[name="images"]')
      .setInputFiles(imageWithMetadata());
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", { name: "Confirmá tu reclamo", exact: true }),
    ).toBeVisible();
    for (const input of await native.locator('input[name="image_paths"]').all())
      uploads.push(await input.inputValue());
    expect((await submitNative(native, "Publicar reclamo")).status()).toBe(303);
    await expect(native).toHaveURL(/\/reclamos\/[0-9a-f-]{36}\/?\?publicado=1$/);
    await expect(
      native.getByRole("heading", {
        name: "Tu reclamo ya está publicado",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      native.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    // La foto publicada también se abre con un nombre reconocible por lector
    // de pantalla, y Escape devuelve el foco a su miniatura.
    const claimHref = native.url();
    const nativePhoto = native.getByRole("link", { name: /Ampliar imagen/ }).first();
    const fullImageHref = await nativePhoto.getAttribute("href");
    expect(fullImageHref).toMatch(/^\/media\/reclamos\/[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp|avif)$/);
    const imageResponse = native.waitForResponse((response) => response.request().isNavigationRequest() && new URL(response.url()).pathname === fullImageHref);
    await nativePhoto.click();
    expect((await imageResponse).status()).toBe(200);
    await expect(native).toHaveURL(new URL(fullImageHref!, claimHref).href);
    await page.goto(claimHref);
    const photo = page.getByRole("link", { name: /Ampliar imagen/ }).first();
    await photo.click();
    const gallery = page.getByRole("dialog", {
      name: `Imágenes del reclamo: ${title}`,
      exact: true,
    });
    await expect(gallery).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(gallery).not.toBeVisible();
    await expect(photo).toBeFocused();
  } finally {
    await context.close();
    expect(
      (
        await admin
          .from("claims")
          .delete()
          .eq("author_id", ownerId)
          .eq("title", title)
      ).error,
    ).toBeNull();
    if (uploads.length)
      expect(
        (await admin.storage.from("claims").remove(uploads)).error,
      ).toBeNull();
  }
});

test("sin JavaScript el debate devuelve errores legibles, conserva el planteo y exige confirmación", async ({
  page,
  browser,
}) => {
  const { context, native } = await nativeSession(page, browser);
  try {
    await native.goto("/c/argentina/debates/nuevo/");
    await native.locator('input[name="title"]').fill("a");
    await native
      .locator('textarea[name="body"]')
      .fill("Comparar propuestas de todas las provincias.");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Mínimo 3 caracteres.",
    );
    await expect(native.locator('textarea[name="body"]')).toHaveValue(
      "Comparar propuestas de todas las provincias.",
    );
    await native
      .locator('input[name="title"]')
      .fill("¿Cómo mejoramos el transporte entre provincias?");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", { name: "Confirmá tu debate", exact: true }),
    ).toBeVisible();
    await expect(
      native.getByRole("button", { name: "Abrir debate", exact: true }),
    ).toBeVisible();
    expect((await submitNative(native, "Volver a editar")).status()).toBe(200);
    await expect(native.locator('textarea[name="body"]')).toHaveValue(
      "Comparar propuestas de todas las provincias.",
    );
  } finally {
    await context.close();
  }
});

test("sin JavaScript la encuesta conserva opciones y fecha al corregir un error del servidor", async ({
  page,
  browser,
}) => {
  const { context, native } = await nativeSession(page, browser);
  try {
    await native.goto("/c/mar-del-plata/encuestas/nueva/");
    await native
      .locator('input[name="question"]')
      .fill("¿Qué zona necesita más bicicleteros?");
    await native.locator('input[name="category"][value="transporte"]').check();
    await native.locator('input[name="options[]"]').nth(0).fill("Centro");
    await native.locator('input[name="options[]"]').nth(1).fill("Centro");
    await native.locator('input[name="closes_at"]').fill("2030-08-01T10:30");
    await native
      .locator('select[name="time_zone"]')
      .selectOption("America/Buenos_Aires");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(400);
    await expect(native.getByRole("alert").first()).toContainText(
      "Hay opciones repetidas.",
    );
    await expect(native.locator('input[name="options[]"]').nth(0)).toHaveValue(
      "Centro",
    );
    await expect(native.locator('input[name="closes_at"]')).toHaveValue(
      "2030-08-01T10:30",
    );
    await expect(
      native.locator('input[name="category"][value="transporte"]'),
    ).toBeChecked();
    await native.locator('input[name="options[]"]').nth(1).fill("Puerto");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(
      native.getByRole("heading", {
        name: "Confirmá tu encuesta",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      native.getByRole("button", { name: "Publicar encuesta", exact: true }),
    ).toBeVisible();
    await expect(native.getByText(/^Cierra el /)).toContainText("10:30");
    await expect(native.getByText(/^Cierra el /)).toContainText(
      "America/Buenos_Aires",
    );
    expect((await submitNative(native, "Volver a editar")).status()).toBe(200);
    await expect(native.locator('input[name="options[]"]').nth(1)).toHaveValue(
      "Puerto",
    );
    await expect(native.locator('select[name="time_zone"]')).toHaveValue(
      "America/Buenos_Aires",
    );
    await expect(native.locator('input[name="max_choices"]')).toBeHidden();
    await native.locator('input[name="type"][value="multiple"]').check();
    await expect(native.locator('input[name="max_choices"]')).toBeVisible();
    await native.locator('input[name="max_choices"]').fill("2");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(native.locator('input[name="type"]')).toHaveValue("multiple");
    await expect(native.locator('input[name="max_choices"]')).toHaveValue("2");
    expect((await submitNative(native, "Volver a editar")).status()).toBe(200);
    await native.locator('input[name="type"][value="binary"]').check();
    await expect(native.locator('input[name="max_choices"]')).toBeHidden();
    await native.locator('input[name="options[]"]').nth(0).fill("Sí");
    await native.locator('input[name="options[]"]').nth(1).fill("No");
    expect(
      (await submitNative(native, "Revisar antes de publicar")).status(),
    ).toBe(200);
    await expect(native.locator('input[name="type"]')).toHaveValue("binary");
    await expect(native.locator('input[name="options[]"]')).toHaveCount(2);
  } finally {
    await context.close();
  }
});
