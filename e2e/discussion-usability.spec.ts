import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";

const debateId = "c0000000-0000-4000-8000-000000000001";
async function signIn(page: Page) {
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

test("un visitante vuelve del ingreso al reporte del comentario con consulta y fragmento", async ({ page }) => {
  test.setTimeout(60_000);
  const commentId = "d0000000-0000-4000-8000-000000000001";
  await page.goto(`/debates/${debateId}?orden=recientes&comentario=${commentId}#comment-${commentId}`);
  await page.locator(`#comment-${commentId}`).getByRole("link", { name: "Ingresá para reportar este contenido", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "/ingresar");
  const next = new URL(new URL(page.url()).searchParams.get("next")!, page.url());
  expect(next.searchParams.get("orden")).toBe("recientes");
  expect(next.searchParams.get("reportar")).toBe(`debate_comment:${commentId}`);
  expect(next.hash).toBe(`#comment-${commentId}`);
  await signIn(page);
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === `/debates/${debateId}` && url.hash === `#comment-${commentId}`);
  const target = page.locator(`#comment-${commentId}`);
  await expect(target.locator(`#reporte-${commentId}`)).toHaveJSProperty("open", true);
  await expect(target.locator(`summary[aria-controls="reporte-form-${commentId}"]`)).toHaveText(/^\s*Cancelar reporte\s*$/);
  await expect(target.getByRole("textbox", { name: "¿Qué problema tiene?", exact: true })).toBeVisible();
  await expect(target.getByText("Volviste para reportar este contenido. Contá el problema y enviá el reporte cuando quieras.", { exact: true })).toBeVisible();
  await expect(page.getByText("Reporte enviado. Gracias por cuidar el espacio.", { exact: true })).toHaveCount(0);
});

test("citar preserva el comentario propio y su contador, respeta el límite y no modifica un reporte", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/ingresar/?next=${encodeURIComponent(`/debates/${debateId}`)}`);
  await signIn(page);
  await expect(page).toHaveURL(new RegExp(`/debates/${debateId}/?$`));
  await page.locator(`summary[aria-controls="reporte-form-${debateId}"]`).click();
  const report = page.locator("form").filter({ has: page.locator('input[name="target_type"][value="debate"]') }).getByRole("textbox");
  await report.fill("Este texto pertenece al formulario de reporte.");
  const draft = page.getByRole("textbox", { name: "Escribir un comentario en la columna Buenos Aires", exact: true });
  await draft.fill("Antes de citar.");
  const draftId = await draft.getAttribute("id");
  const counter = page.locator(`[id="${draftId}-count"]`);
  await page.getByRole("button", { name: /Citas destacadas del debate/ }).click();
  await expect(page.getByText("Destino de la cita: tu comentario de Buenos Aires.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Citar en mi comentario", exact: true }).first().click();
  await expect(draft).toHaveValue(/^Antes de citar\.\n\n> /);
  await expect(counter).toHaveText(`${(await draft.inputValue()).length}/1000`);
  await expect(report).toHaveValue("Este texto pertenece al formulario de reporte.");

  await draft.fill("a".repeat(990));
  await page.getByRole("button", { name: "Citar en mi comentario", exact: true }).first().click();
  await expect(page.getByText("La cita no entra en el límite de 1000 caracteres. Tu comentario se conserva; podés copiar la cita y acortarla.", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("a".repeat(990));
  await expect(counter).toHaveText("990/1000");

  await page.getByRole("button", { name: "Propuestas", exact: true }).click();
  await expect(page.getByRole("button", { name: "Propuestas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Busca palabras de propuesta en español o inglés/)).toBeVisible();
});

test("las novedades no consumen reclamos ocultos por filtros y sólo recuerdan tarjetas vistas", async ({ page }) => {
  test.setTimeout(60_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Esta prueba sólo puede escribir fixtures en Supabase local.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: column, error: columnError } = await db.from("communities").select("id").eq("slug", "caba").single();
  const { data: author, error: authorError } = await db.from("profiles").select("id").eq("username", "elena_caba").single();
  expect(columnError).toBeNull(); expect(authorError).toBeNull();
  const marker = `Historial visible ${crypto.randomUUID()}`;
  const rows = ["infraestructura", "ambiente"].map((category, index) => ({ id: crypto.randomUUID(), community_id: column!.id, author_id: author!.id, category, status: "open", title: `${marker} ${index}`, description: "Fixture local para comprobar el historial de tarjetas visibles." }));
  await page.addInitScript(() => {
    const key = "agorbis-last-visit-caba";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 2, ids: [] }));
  });
  const seen = () => page.evaluate(() => (JSON.parse(localStorage.getItem("agorbis-last-visit-caba") ?? '{"ids":[]}') as { ids: string[] }).ids);
  try {
    // La búsqueda derivada no concede ejecución a service_role. Preparar
    // fixtures por el PostgreSQL local conserva esos permisos de producción.
    const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
    localCommunityFixture(`insert into public.claims (id, community_id, author_id, category, status, title, description) values ${rows.map((row) => `(${[row.id, row.community_id, row.author_id, row.category, row.status, row.title, row.description].map(literal).join(",")})`).join(",")};`);
    await page.setViewportSize({ width: 390, height: 740 });
    await page.goto(`/c/caba/reclamos/?q=${encodeURIComponent(marker)}&categoria=infraestructura`);
    const first = page.locator(`#listado-reclamos a[href="/reclamos/${rows[0].id}"]`);
    await expect(first).toHaveCount(1);
    await expect.poll(async () => (await seen()).includes(rows[1].id)).toBe(false);
    await first.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await seen()).includes(rows[0].id)).toBe(true);
    expect(await seen()).not.toContain(rows[1].id);

    await page.locator('a[href*="categoria=ambiente"]').first().click();
    await expect(page).toHaveURL((url) => url.searchParams.get("categoria") === "ambiente");
    const second = page.locator(`#listado-reclamos a[href="/reclamos/${rows[1].id}"]`);
    await expect(second).toHaveCount(1);
    await second.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await seen()).includes(rows[1].id)).toBe(true);
    await page.locator('a[href*="categoria=infraestructura"]').first().click();
    await expect(page.getByText(/reclamos? de esta página fuera de tu historial reciente/)).toHaveCount(0);
  } finally {
    expect((await db.from("notifications").delete().in("entity_id", rows.map((row) => row.id))).error).toBeNull();
    expect((await db.from("claims").delete().in("id", rows.map((row) => row.id))).error).toBeNull();
  }
});
