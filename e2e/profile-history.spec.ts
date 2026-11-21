import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";

const owner = "33333333-3333-4333-8333-333333333333";
function localClient() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function openProfile(page: Page, section: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(`/perfil/?seccion=${section}&origen=e2e`)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/\?seccion=/, { timeout: 20_000 });
}
async function signedClient() {
  const db = localClient();
  const { error } = await db.auth.signInWithPassword({ email: "sofia@agorbis.test", password: "AgorbisLocal-2026!", options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" } });
  expect(error).toBeNull();
  return db;
}

test("el perfil permite conservar o descartar cambios y un guardado confirmado deja de bloquear", async ({ page }) => {
  test.setTimeout(90_000);
  const db = await signedClient();
  const { data: initial, error } = await db.from("profiles").select("display_name, bio").eq("id", owner).single();
  expect(error).toBeNull();
  const pending = `Nombre pendiente ${Date.now()}`;
  try {
    await openProfile(page, "cuenta");
    const display = page.getByRole("textbox", { name: "Nombre para mostrar", exact: true });
    await display.fill(pending);
    await expect(page.getByText("Tenés cambios sin guardar.", { exact: true })).toBeVisible();
    const sections = page.getByRole("navigation", { name: "Secciones del perfil" });
    page.once("dialog", (dialog) => dialog.dismiss());
    await sections.getByRole("link", { name: /Guardados y Comunidades/ }).click();
    await expect(page).toHaveURL(/seccion=cuenta/);
    await expect(display).toHaveValue(pending);
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await sections.getByRole("link", { name: /Guardados y Comunidades/ }).click();
    await expect(page).toHaveURL(/seccion=guardados/);
    await sections.getByRole("link", { name: "Configuración y Cuenta" }).click();
    await expect(display).toHaveValue(initial!.display_name ?? "");
    await display.fill(pending);
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByText("Guardado.", { exact: true })).toBeVisible();
    await expect(page.getByText("Tenés cambios sin guardar.", { exact: true })).toHaveCount(0);
    const { data: saved } = await db.from("profiles").select("display_name").eq("id", owner).single();
    expect(saved?.display_name).toBe(pending);
    expect(await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    })).toBe(false);
    await sections.getByRole("link", { name: /Guardados y Comunidades/ }).click();
    await expect(page).toHaveURL(/seccion=guardados/);
  } finally {
    expect((await db.from("profiles").update(initial!).eq("id", owner)).error).toBeNull();
    await db.auth.signOut();
  }
});

test("actividad y comunidades seguidas paginan sin repetir filas ni perder sus totales", async ({ page }) => {
  test.setTimeout(120_000);
  const db = await signedClient();
  const { data: currentFollows, error: followsError } = await db.from("follows").select("community_id").eq("user_id", owner);
  expect(followsError).toBeNull();
  const { data: communities, error: communitiesError } = await db.from("communities").select("id").limit(100);
  expect(communitiesError).toBeNull();
  const addedFollows = communities!.filter((community) => !currentFollows!.some((follow) => follow.community_id === community.id)).slice(0, 26).map((community) => community.id);
  expect(addedFollows).toHaveLength(26);
  const { data: debate, error: debateError } = await db.from("debates").select("id").eq("id", "c0000000-0000-4000-8000-000000000001").single();
  expect(debateError).toBeNull();
  const { data: column, error: columnError } = await db.from("communities").select("id").eq("slug", "buenos-aires").single();
  expect(columnError).toBeNull();
  const prefix = `Actividad E2E ${crypto.randomUUID()}`;
  const commentIds = Array.from({ length: 30 }, () => crypto.randomUUID());
  try {
    localCommunityFixture(`
      begin;
      insert into public.follows (user_id, community_id, created_at) values ${addedFollows.map((id) => `('${owner}', '${id}', '2026-01-01T12:00:00Z')`).join(",")};
      insert into public.debate_comments (id, debate_id, column_community_id, user_id, body, created_at) values ${commentIds.map((id, index) => `('${id}', '${debate!.id}', '${column!.id}', '${owner}', '${prefix} ${index}', '2026-01-01T12:00:00Z')`).join(",")};
      commit;
    `);
    await openProfile(page, "guardados");
    const following = page.getByRole("heading", { name: "Comunidades que seguís", exact: true }).locator("..");
    const firstFollows = await following.locator("ul a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(firstFollows).toHaveLength(25);
    await expect(following).toContainText(`de ${currentFollows!.length + 26} comunidades seguidas.`);
    await following.getByRole("link", { name: "Ver más comunidades seguidas" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.has("seguidos_antes") && url.searchParams.get("origen") === "e2e");
    await expect(following.locator("ul a")).toHaveCount(currentFollows!.length + 26 - 25);
    const secondFollows = await following.locator("ul a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(secondFollows.some((href) => firstFollows.includes(href))).toBe(false);
    expect(firstFollows.length + secondFollows.length).toBe(currentFollows!.length + 26);
    await page.reload();
    await expect(following).toContainText(`de ${currentFollows!.length + 26} comunidades seguidas.`);
    await following.getByRole("link", { name: "Volver a las comunidades más recientes" }).click();
    await expect(page).not.toHaveURL(/seguidos_antes=/);
    await expect(following.locator("ul a")).toHaveCount(25);

    await page.getByRole("navigation", { name: "Secciones del perfil" }).getByRole("link", { name: /Publicaciones y Actividad/ }).click();
    const activity = page.getByRole("heading", { name: "Tu actividad", exact: true }).locator("..");
    await expect(activity.locator("[data-activity-id]")).toHaveCount(25);
    const firstActivity = await activity.locator("[data-activity-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-activity-id")));
    expect(firstActivity).toHaveLength(25);
    const totalBefore = (await activity.innerText()).match(/de (\d+) actividades en total/)!;
    expect(Number(totalBefore[1])).toBeGreaterThanOrEqual(30);
    await activity.getByRole("link", { name: "Ver actividad anterior" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.has("actividad_antes") && url.searchParams.get("origen") === "e2e");
    await expect(activity.locator("[data-activity-id]")).toHaveCount(Number(totalBefore[1]) - 25);
    const secondActivity = await activity.locator("[data-activity-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-activity-id")));
    expect(secondActivity.some((id) => firstActivity.includes(id))).toBe(false);
    expect(firstActivity.length + secondActivity.length).toBe(Number(totalBefore[1]));
    await expect(activity).toContainText(`de ${totalBefore[1]} actividades en total.`);
    await activity.getByRole("link", { name: "Volver a la actividad reciente" }).click();
    await expect(page).not.toHaveURL(/actividad_antes=/);
    await expect(activity.locator("[data-activity-id]")).toHaveCount(25);
    await activity.getByRole("link", { name: "Comentarios", exact: true }).click();
    await expect(page).toHaveURL(/actividad_filtro=comentario/);
    await expect(activity.getByRole("link", { name: "Comentarios", exact: true })).toHaveAttribute("aria-current", "true");
    expect(await activity.locator("[data-activity-id]").evaluateAll((items) => items.every((item) => item.getAttribute("data-activity-id")?.startsWith("comentario:")))).toBe(true);
    const filteredTotal = (await activity.innerText()).match(/de (\d+) actividades en total/)!;
    await activity.getByRole("link", { name: "Ver actividad anterior" }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("actividad_filtro") === "comentario" && url.searchParams.has("actividad_antes"));
    await expect(activity.locator("[data-activity-id]")).toHaveCount(Number(filteredTotal[1]) - 25);
    expect(await activity.locator("[data-activity-id]").count()).toBeGreaterThan(0);
  } finally {
    localCommunityFixture(`delete from public.follows where user_id='${owner}' and community_id in (${addedFollows.map((id) => `'${id}'`).join(",")}); delete from public.debate_comments where user_id='${owner}' and id in (${commentIds.map((id) => `'${id}'`).join(",")});`);
    await db.auth.signOut();
  }
});

test("el mapa de actividad tiene una parada de teclado y una fecha táctil con publicaciones navegables", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/u/sofia_mdq/");
  const days = page.getByRole("group", { name: "Actividad por día" });
  await expect(days.locator('button[tabindex="0"]')).toHaveCount(1);
  expect(await days.getByRole("button").evaluateAll((buttons) => buttons.filter((button) => (button as HTMLButtonElement).tabIndex === 0).length)).toBe(1);
  const firstIndex = Number(await days.locator('button[tabindex="0"]').getAttribute("data-day-index"));
  await days.locator('button[tabindex="0"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(days.locator(`button[data-day-index="${firstIndex - 7}"]`)).toBeFocused();
  await expect(days.locator('button[tabindex="0"]')).toHaveCount(1);
  expect(await days.getByRole("button").evaluateAll((buttons) => buttons.filter((button) => (button as HTMLButtonElement).tabIndex === 0).length)).toBe(1);
  await page.keyboard.press("Control+Home");
  await expect(days.locator('button[data-day-index="0"]')).toBeFocused();
  const publishedDay = days.getByRole("button", { name: /: [1-9]\d* publicaciones$/ }).first();
  const date = (await publishedDay.getAttribute("aria-label"))!.slice(0, 10);
  const picker = page.getByLabel("Elegí un día", { exact: true });
  await picker.fill(date);
  const detail = page.getByRole("region", { name: "Publicaciones del día elegido" });
  await expect(detail).toContainText(date);
  await expect(detail.getByRole("link").first()).toBeVisible();
  expect((await picker.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
