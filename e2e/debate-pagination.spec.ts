import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function localDatabase() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Esta prueba sólo puede escribir fixtures en Supabase local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

test("cada columna carga todos sus comentarios sin saltar empates, duplicar enlaces ni perder votos o posición", async ({ page }) => {
  test.setTimeout(120_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Esta prueba sólo puede escribir fixtures en Supabase local.");
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const debateId = "c0000000-0000-4000-8000-000000000001";
  const { data: column, error: columnError } = await db.from("communities").select("id, name").eq("slug", "caba").single();
  const { data: author, error: authorError } = await db.from("profiles").select("id").eq("username", "elena_caba").single();
  expect(columnError).toBeNull();
  expect(authorError).toBeNull();
  const marker = `Paginación de debate ${crypto.randomUUID()}`;
  const rows = Array.from({ length: 66 }, (_, index) => ({
    id: crypto.randomUUID(),
    debate_id: debateId,
    column_community_id: column!.id,
    user_id: author!.id,
    body: `${marker} ${index}`,
    score: index < 20 ? 100_000 : -10_000,
    // Empate exacto que obliga a usar id además de fecha en todas las páginas.
    created_at: "2020-01-01T12:00:00Z",
    status: index === 65 ? "removed" : "visible",
  }));
  const linked = rows[64];
  try {
    expect((await db.from("debate_comments").insert(rows)).error).toBeNull();
    await page.goto(`/ingresar/?next=${encodeURIComponent(`/debates/${debateId}?comentario=${linked.id}#comment-${linked.id}`)}`);
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/debates/${debateId}`));
    const region = page.locator(`#debate-column-${column!.id}`);
    const cards = region.locator('article[id^="comment-"]');
    await expect(cards).toHaveCount(21);
    await expect(region.locator(`#comment-${linked.id}`)).toHaveCount(1);
    const first = region.locator(`#comment-${rows[0].id}`);
    const up = first.getByRole("button", { name: "Votar a favor", exact: true });
    await up.click();
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(up).toBeEnabled();
    const score = first.locator('span[aria-label^="Puntaje "]');
    const votedScore = await score.textContent();
    const scroller = region.getByRole("region", { name: `Comentarios de ${column!.name}`, exact: true });
    await scroller.evaluate((element) => { element.scrollTop = 120; });
    const more = region.getByRole("button", { name: "Cargar más comentarios", exact: true });
    await more.scrollIntoViewIfNeeded();
    await more.focus();
    const before = await scroller.evaluate((element) => element.scrollTop);
    const pageTop = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("Enter");
    await expect(cards).toHaveCount(41);
    await expect(more).toBeFocused();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeCloseTo(before, 0);
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(pageTop, 0);
    for (let attempt = 0; attempt < 8 && await more.count(); attempt++) {
      const count = await cards.count();
      await more.click();
      await expect.poll(() => cards.count()).toBeGreaterThan(count);
      await expect(region.getByRole("button", { name: /Cargar más comentarios|Todos los comentarios cargados/, exact: true })).toHaveAttribute("aria-busy", "false");
    }
    await expect(region.getByRole("button", { name: "Todos los comentarios cargados", exact: true })).toHaveAttribute("aria-disabled", "true");
    const shownIds = await cards.evaluateAll((elements) => elements.map((element) => element.id));
    expect(new Set(shownIds).size).toBe(shownIds.length);
    for (const row of rows.slice(0, 65)) expect(shownIds).toContain(`comment-${row.id}`);
    expect(shownIds).not.toContain(`comment-${rows[65].id}`);
    await expect(up).toHaveAttribute("aria-pressed", "true");
    await expect(score).toHaveText(votedScore!);
    // Continuar leyendo otra comunidad no habilita su formulario de escritura.
    await expect(region.locator('textarea[name="body"]')).toHaveCount(0);
  } finally {
    expect((await db.from("debate_comments").delete().in("id", rows.map((row) => row.id))).error).toBeNull();
    expect((await db.from("notifications").delete().in("dedupe_key", rows.map((row) => `debate-comment:${row.id}:author`))).error).toBeNull();
  }
});

test("publicar fuera de los destacados conserva páginas cargadas y muestra el nuevo comentario una sola vez", async ({ page }) => {
  test.setTimeout(90_000);
  const db = localDatabase();
  const debateId = "c0000000-0000-4000-8000-000000000001";
  const { data: column, error: columnError } = await db.from("communities").select("id, name").eq("slug", "buenos-aires").single();
  const { data: author, error: authorError } = await db.from("profiles").select("id").eq("username", "sofia_mdq").single();
  expect(columnError).toBeNull();
  expect(authorError).toBeNull();
  const marker = `Publicación paginada ${crypto.randomUUID()}`;
  const rows = Array.from({ length: 23 }, (_, index) => ({
    id: crypto.randomUUID(),
    debate_id: debateId,
    column_community_id: column!.id,
    user_id: author!.id,
    body: `${marker} destacado ${index}`,
    score: index < 20 ? 100_000 : -10_000,
    created_at: "2020-01-01T12:00:00Z",
  }));
  const published = `${marker} aporte nuevo`;
  const cleanupIds = rows.map((row) => row.id);
  try {
    expect((await db.from("debate_comments").insert(rows)).error).toBeNull();
    await page.goto(`/ingresar/?next=${encodeURIComponent(`/debates/${debateId}`)}`);
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/debates/${debateId}/?$`));
    const region = page.locator(`#debate-column-${column!.id}`);
    await region.getByRole("button", { name: "Cargar más comentarios", exact: true }).click();
    for (const row of rows) await expect(region.locator(`#comment-${row.id}`)).toHaveCount(1);
    const draft = region.getByRole("textbox", { name: `Escribir un comentario en la columna ${column!.name}`, exact: true });
    await draft.fill(published);
    await region.getByRole("button", { name: "Publicar", exact: true }).click();
    await expect(region.getByText("Listo, tu comentario ya está en la columna.", { exact: true })).toBeVisible();
    await expect(draft).toHaveValue("");
    await expect(region.getByText(published, { exact: true })).toHaveCount(1);
    for (const row of rows) await expect(region.locator(`#comment-${row.id}`)).toHaveCount(1);
    const { data: saved, error } = await db.from("debate_comments").select("id").eq("debate_id", debateId).eq("body", published).single();
    expect(error).toBeNull();
    cleanupIds.push(saved!.id);
  } finally {
    const { data: saved } = await db.from("debate_comments").select("id").eq("debate_id", debateId).eq("body", published);
    cleanupIds.push(...(saved ?? []).map((row) => row.id));
    expect((await db.from("debate_comments").delete().in("id", cleanupIds)).error).toBeNull();
    expect((await db.from("notifications").delete().in("dedupe_key", cleanupIds.map((id) => `debate-comment:${id}:author`))).error).toBeNull();
  }
});
