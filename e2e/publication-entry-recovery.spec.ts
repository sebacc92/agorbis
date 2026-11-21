import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Mejora 5 de D112 (D115): los llamados a publicar llegan. Una navegación
 * interna a una ruta que redirige en el servidor no termina en "Se rompió
 * algo de esta página".
 */

// Comunidad vacía del seed local (sin encuestas, debates, reclamos ni proyectos).
const emptyCommunity = "/c/ba-25-de-mayo/";

test("una visitante que toca 'Crear la primera encuesta' llega a ingresar, sin pantalla rota", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(emptyCommunity);
  const call = page.getByRole("link", { name: /Crear la primera encuesta/ });
  await expect(call).toBeVisible();
  // El enlace ya sabe a dónde ir: nada de redirección interna a mitad del dibujo.
  await expect(call).toHaveAttribute(
    "href",
    `/ingresar?next=${encodeURIComponent("/c/ba-25-de-mayo/encuestas/nueva")}`,
  );
  await call.click();
  await expect(page).toHaveURL(/\/ingresar\/?\?next=/);
  await expect(page.getByLabel("Correo electrónico")).toBeVisible();
  await expect(page.getByText("Se rompió algo de esta página")).toHaveCount(0);
});

/**
 * Navegación SPA real a una ruta que redirige: el manejador de `Link` lee
 * `elm.href` al hacer clic, así que basta reapuntar un `Link` existente. Un
 * ancla inyectada no sirve: el router sólo intercepta anclas al mismo camino y
 * la navegación sería nativa, sin la carrera.
 */
async function spaNavigateViaLink(page: Page, href: string) {
  const link = page
    .getByRole("navigation", { name: "Navegación principal inferior" })
    .getByRole("link", { name: "Explorar" });
  await expect(link).toBeVisible();
  await link.evaluate((anchor, target) => anchor.setAttribute("href", target), href);
  await link.dispatchEvent("click");
}

test("una navegación interna a una ruta que redirige se recupera: termina en ingresar, sin pantalla rota ni velo", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(emptyCommunity);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // La recuperación es una recarga única: tras el clic tiene que haber
  // exactamente una carga de documento (`framenavigated` también cuenta los
  // pushState del router). Si el beta deja de romper, esto falla y avisa que
  // el rodeo sobra (D75).
  let documentLoads = 0;
  page.on("load", () => {
    documentLoads += 1;
  });
  await spaNavigateViaLink(page, "/c/ba-25-de-mayo/encuestas/nueva");
  await expect(page).toHaveURL(/\/ingresar\/?\?next=/, { timeout: 20_000 });
  await expect(page.getByLabel("Correo electrónico")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Se rompió algo de esta página")).toHaveCount(0);
  await expect(page.getByText("Cargando página…")).toHaveCount(0);
  await expect(page.getByText("Un momento…")).toHaveCount(0);
  await expect.poll(() => documentLoads, { timeout: 10_000 }).toBe(1);
});

test("una cuenta nueva sin residencia llega a elegir residencia, sin pantalla rota", async ({ page }) => {
  // La reproducción de la auditoría de D112: la redirección del servidor
  // llega a mitad del dibujo, el render falla con `insertBefore` y el router
  // queda trabado. Sin el límite que se recupera quedaban "Se rompió algo" y
  // "Cargando página…" para siempre.
  test.setTimeout(120_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `nueva-${crypto.randomUUID()}@agorbis.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "AgorbisLocal-2026!", email_confirm: true });
  if (error) throw error;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ingresar/?next=${encodeURIComponent(emptyCommunity)}`);
    await page.getByLabel("Correo electrónico").fill(email);
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).not.toHaveURL(/\/ingresar/, { timeout: 20_000 });
    await page.goto(emptyCommunity);
    // El llamado de la capa A ya apunta a elegir residencia; acá se fuerza la
    // navegación interna al formulario, que redirige, para ejercitar la capa B.
    await spaNavigateViaLink(page, "/c/ba-25-de-mayo/encuestas/nueva");
    await expect(page).toHaveURL(/\/onboarding\/?\?next=/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Se rompió algo de esta página")).toHaveCount(0);
    await expect(page.getByText("Cargando página…")).toHaveCount(0);
  } finally {
    await admin.auth.admin.deleteUser(data.user!.id);
  }
});
