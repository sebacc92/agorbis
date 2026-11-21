import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("la navegación móvil indica sólo la página actual para visitantes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/explorar/");
  const nav = page.getByRole("navigation", { name: "Navegación principal inferior" });
  await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Explorar", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Inicio", exact: true })).not.toHaveAttribute("aria-current");
});

for (const width of [390, 820]) {
  test(`las acciones del reclamo quedan accesibles sobre la navegación (${width}px)`, async ({ page }) => {
    const url = process.env.PUBLIC_SUPABASE_URL;
    const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
      throw new Error("Se requiere Supabase local para buscar el reclamo de prueba.");
    }
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await db.from("claims").select("id").neq("status", "removed").limit(1).single();
    expect(error).toBeNull();
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/reclamos/${data!.id}/`);
    const actions = page.locator("[data-claim-actions]");
    await expect(actions).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navegación principal inferior", includeHidden: true });
    await expect.poll(async () => {
      const bar = await actions.boundingBox();
      const navBox = await nav.boundingBox();
      return bar ? bar.y + bar.height <= (navBox?.y ?? 844) + 1 : false;
    }).toBe(true);
    await expect(actions.getByRole("button", { name: "Compartir", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const preferences = page.locator("footer").getByRole("button", { name: "Opciones de accesibilidad cívica" });
    await expect(preferences).toBeInViewport();
    // Estar dentro del viewport no basta: la barra fija puede taparlo.
    expect(await preferences.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
  });
}

test("sin sesión, la barra del reclamo abierto ofrece ingresar y volver a apoyarlo", async ({ page }) => {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Se requiere Supabase local para buscar el reclamo de prueba.");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("claims").select("id").in("status", ["open", "under_review"]).limit(1).single();
  expect(error).toBeNull();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/reclamos/${data!.id}/`);
  const actions = page.locator("[data-claim-actions]");
  const signIn = actions.getByRole("link", { name: "Ingresar para apoyar", exact: true });
  await expect(signIn).toBeInViewport();
  const destination = new URL((await signIn.getAttribute("href"))!, "http://localhost");
  expect(destination.pathname).toBe("/ingresar");
  expect(destination.searchParams.get("next")).toBe(`/reclamos/${data!.id}`);
  await expect(actions.getByRole("button", { name: "Compartir", exact: true })).toBeInViewport();
});

test("el reclamo reúne compartir e imprimibles en un solo Difundir", async ({ page }) => {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Se requiere Supabase local para buscar el reclamo de prueba.");
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("claims").select("id").in("status", ["open", "under_review"]).limit(1).single();
  expect(error).toBeNull();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/reclamos/${data!.id}/`);
  await expect(page.getByText("Enviar a grupo de WhatsApp")).toHaveCount(0);
  const spread = page.locator("details[data-claim-spread]");
  await expect(spread).toHaveCount(1);
  await expect(spread).not.toHaveAttribute("open");
  // D124: el menú de Compartir también es un <details>; el summary del bloque es el hijo directo.
  await spread.locator("> summary").click();
  for (const path of ["afiche", "nota-formal", "dossier", "planilla"]) {
    await expect(spread.locator(`a[href="/reclamos/${data!.id}/${path}"]`)).toBeVisible();
  }
  await expect(spread.getByRole("button", { name: "Compartir", exact: true })).toBeVisible();
});

test("la comunidad prioriza participación y agrupa las herramientas secundarias", async ({ page }) => {
  await page.goto("/c/earth/");
  const primary = page.getByRole("navigation", { name: "Acciones principales de la comunidad" });
  await expect(primary.getByRole("link")).toHaveCount(4);
  const tools = page.locator("details[data-community-tools]");
  await expect(tools).not.toHaveAttribute("open");
  await expect(tools.getByRole("navigation", { name: "Herramientas de la comunidad", includeHidden: true })).toBeHidden();
  await tools.locator("summary").click();
  await expect(tools.getByRole("navigation", { name: "Herramientas de la comunidad" })).toBeVisible();
});

test("Publicar ofrece los cuatro tipos en la comunidad actual y devuelve el foco", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/earth/");
  const publish = page.getByRole("navigation", { name: "Navegación principal inferior" }).getByRole("button", { name: "Publicar", exact: true });
  await publish.click();
  const dialog = page.getByRole("dialog", { name: "¿Qué querés publicar?" });
  await expect(dialog).toBeVisible();
  await expect(publish).toHaveAttribute("aria-expanded", "true");
  // Sin sesión el enlace ya apunta a ingresar con el formulario como destino
  // (D115): antes iba al formulario y el servidor redirigía a mitad del dibujo.
  for (const [title, path] of [["Encuesta", "encuestas/nueva"], ["Debate", "debates/nuevo"], ["Reclamo", "reclamos/nuevo"], ["Proyecto", "proyectos/nuevo"]]) {
    await expect(dialog.getByRole("link", { name: new RegExp(`^${title}`) })).toHaveAttribute("href", `/ingresar?next=${encodeURIComponent(`/c/earth/${path}`)}`);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(publish).toBeFocused();
  await publish.click();
  await dialog.getByRole("link", { name: /^Debate/ }).click();
  await expect(page).toHaveURL(/\/ingresar\/?\?next=/);
  expect(new URL(page.url()).searchParams.get("next")).toMatch(/^\/c\/earth\/debates\/nuevo\/?$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Publicar orienta a elegir comunidad cuando aún no hay contexto", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/explorar/");
  await page.getByRole("navigation", { name: "Navegación principal inferior" }).getByRole("button", { name: "Publicar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "¿Qué querés publicar?" });
  await expect(dialog).toContainText("Primero elegí una comunidad.");
  await expect(dialog.getByRole("link", { name: "Explorar comunidades", exact: true })).toHaveAttribute("href", "/explorar");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("Publicar usa la residencia al abrirlo desde Inicio", async ({ page }) => {
  test.setTimeout(60_000);
  const localUrl = process.env.PUBLIC_SUPABASE_URL;
  if (!localUrl || !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)) throw new Error("Se requiere Supabase local.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/$/);
  await page.getByRole("navigation", { name: "Navegación principal inferior" }).getByRole("button", { name: "Publicar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "¿Qué querés publicar?" });
  await expect(dialog).toContainText("Publicarás en Mar del Plata.");
  await expect(dialog.getByRole("link", { name: /^Proyecto/ })).toHaveAttribute("href", "/c/mar-del-plata/proyectos/nuevo");
});
