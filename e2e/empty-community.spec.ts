import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Mejora 6 de D112 (D116): una comunidad vacía muestra algo que ya se puede
 * hacer y no afirma una residencia que nadie declaró.
 * `ba-25-de-mayo` no tiene publicaciones en el seed; su cadena (Buenos Aires,
 * Argentina, Sudamérica, Tierra) tiene varias encuestas abiertas, y la de
 * Argentina es la que cierra antes.
 */
const emptyCommunity = "/c/ba-25-de-mayo/";
const argentinaPoll = "/encuestas/a0000000-0000-4000-8000-000000000002";

test("la comunidad vacía enlaza las encuestas abiertas de su cadena sin conteos", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(emptyCommunity);
  const section = page.getByRole("region", { name: /todavía no tiene publicaciones/ });
  // Sin sesión no se promete el voto: el título es el neutro.
  await expect(section.getByRole("heading", { name: "Encuestas abiertas en las comunidades que la contienen" })).toBeVisible();
  await expect(section).not.toContainText("ya podés votar");
  const link = section.getByRole("link", { name: /prioridad número uno/ });
  await expect(link).toHaveAttribute("href", argentinaPoll);
  await expect(link).toContainText("Argentina");
  await expect(section).not.toContainText(/\d+ votos?/);
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${argentinaPoll}/?$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText("prioridad número uno");
});

test("Más herramientas no tiene casillas que marcar ni felicita por marcarlas", async ({ page }) => {
  await page.goto(emptyCommunity);
  const tools = page.locator("[data-community-tools]");
  await tools.getByText("Más herramientas").click();
  await expect(tools.getByRole("heading", { name: "Qué podés hacer acá" })).toBeVisible();
  await expect(tools.getByRole("button", { name: /^Marcar como/ })).toHaveCount(0);
  await expect(tools).not.toContainText("Felicitaciones");
});

test("una cuenta sin residencia lee que falta elegirla, no una 'residencia declarada'", async ({ page }) => {
  test.setTimeout(120_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `sin-residencia-${crypto.randomUUID()}@agorbis.test`;
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
    await expect(page.getByText("Todavía no elegiste dónde vivís")).toBeVisible();
    await expect(page.getByText("elegí tu residencia para publicar")).toBeVisible();
    await expect(page.getByText("residencia declarada")).toHaveCount(0);
    // Destino exacto: al elegir residencia vuelve a esta comunidad.
    await expect(page.getByRole("link", { name: "Elegir mi residencia" })).toHaveAttribute(
      "href",
      `/onboarding?next=${encodeURIComponent(emptyCommunity)}`,
    );
  } finally {
    // Un fallo al borrar no debe tapar el error real de la prueba.
    try {
      await admin.auth.admin.deleteUser(data.user!.id);
    } catch (cleanupError) {
      console.error(`No se pudo borrar la cuenta de prueba ${data.user!.id}`, cleanupError);
    }
  }
});

test("quien vive en otra comunidad lee 'residencia declarada' y puede revisarla", async ({ page }) => {
  // Sofía vive en Mar del Plata: tiene residencia, pero no en 25 de Mayo.
  await page.goto(`/ingresar/?next=${encodeURIComponent(emptyCommunity)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${emptyCommunity}$`), { timeout: 20_000 });
  await expect(page.getByText(/Tu residencia declarada no pertenece a/)).toBeVisible();
  await expect(page.getByText("Todavía no elegiste dónde vivís")).toHaveCount(0);
  await expect(page.getByText("revisá tu residencia para publicar")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar mi residencia" })).toHaveAttribute(
    "href",
    "/perfil/residencia?parent=ba-25-de-mayo",
  );
});
