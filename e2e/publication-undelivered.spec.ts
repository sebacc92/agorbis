import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Mejora 10 de D112 (D114): un envío nunca queda mudo. Con la red cortada el
 * aviso aparece, el botón vuelve y el velo se va; un doble toque manda un solo
 * POST y crea un solo reclamo.
 */

const formPath = "/c/mar-del-plata/reclamos/nuevo/";

function adminClient() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signInAndReview(page: Page, title: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(formPath)}`);
  // El guardián corrió: si el nonce o la CSP lo frenaran, acá se vería.
  await expect(page.locator("html")).toHaveAttribute("data-action-guard", "on");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${formPath}$`), { timeout: 20_000 });
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="description"]').fill("Descripción de prueba para el guardián de envíos: bastante larga.");
  await page.getByRole("button", { name: "Revisar antes de publicar" }).click();
  await expect(page.getByRole("heading", { name: "Confirmá tu reclamo" })).toBeVisible();
}

test("con la red cortada el aviso dice que no se sabe, el botón vuelve y el velo se va", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const title = `Sin red E2E ${crypto.randomUUID()}`;
  try {
    await signInAndReview(page, title);
    await page.route("**/*qaction=*", (route) =>
      route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
    );
    await page.getByRole("button", { name: "Publicar reclamo" }).click();

    const alert = page.getByRole("alert").filter({ hasText: "No sabemos si se publicó" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Se cortó la conexión mientras se enviaba");
    await expect(alert).not.toContainText(/no se (guardó|publicó|envió)/i);
    await expect(alert).toBeFocused();
    // La revisión venía del servidor, así que el formulario vuelve a la edición
    // con lo escrito intacto y un botón habilitado: nada queda "Enviando…" ni
    // "Cargando página…".
    const review = page.getByRole("button", { name: "Revisar antes de publicar" });
    await expect(review).toBeEnabled();
    await expect(review).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByText("Cargando página…")).toHaveCount(0);
    await expect(page.locator('input[name="title"]')).toHaveValue(title);
    // Y no se creó nada: el POST nunca salió.
    const { data } = await admin.from("claims").select("id").eq("title", title);
    expect(data ?? []).toHaveLength(0);
  } finally {
    await page.unroute("**/*qaction=*").catch(() => {});
    await admin.from("claims").delete().eq("title", title);
  }
});

test("un doble toque manda un solo POST, avisa Publicado y crea un solo reclamo", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = adminClient();
  const title = `Doble toque E2E ${crypto.randomUUID()}`;
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("qaction=")) posts.push(request.url());
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  let releaseDetail = () => {};
  const detailHeld = new Promise<void>((resolve) => (releaseDetail = resolve));
  try {
    await signInAndReview(page, title);
    // Ingresar y Revisar también son POST de acción: se cuenta desde Publicar.
    posts.length = 0;
    // La ficha abre tan rápido que el aviso no se alcanza a ver: se retienen las
    // cargas de datos de la navegación interna hasta observarlo.
    await page.route(/\/reclamos\/[0-9a-f-]{36}/, async (route) => {
      if (route.request().resourceType() === "document") return route.continue();
      await detailHeld;
      await route.continue().catch(() => {});
    });
    // Se retiene la respuesta para que los otros toques lleguen con el primero en vuelo.
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await held;
      await route.continue().catch(() => {});
    });
    const publish = page.getByRole("button", { name: "Publicar reclamo" });
    await publish.dispatchEvent("click");
    await publish.dispatchEvent("click");
    await page.waitForTimeout(400);
    await publish.dispatchEvent("click");
    await page.waitForTimeout(400);
    expect(posts).toHaveLength(1);
    release();
    const status = page.getByRole("status").filter({ hasText: "Publicado. Abriendo la publicación…" });
    await expect(status).toBeVisible();
    await expect(status.getByRole("link", { name: "Abrir la publicación" })).toBeVisible();
    // Publicado: la revisión ya no viene en el resultado, se ve la edición con
    // su botón bloqueado hasta que abra la ficha.
    await expect(page.getByRole("button", { name: "Revisar antes de publicar" })).toBeDisabled();
    releaseDetail();
    await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]{36}\/?\?publicado=1$/, { timeout: 20_000 });
    expect(posts).toHaveLength(1);
    const { data } = await admin.from("claims").select("id").eq("title", title);
    expect(data ?? []).toHaveLength(1);
  } finally {
    release();
    releaseDetail();
    await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await admin.from("claims").delete().eq("title", title);
  }
});
