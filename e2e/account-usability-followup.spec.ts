import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";

function localAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Esta prueba sólo puede escribir fixtures en Supabase local.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function login(page: Page, next: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === next.split("?")[0].replace(/\/$/, ""));
}

test("las publicaciones propias recorren empates entre tipos y conservan la actividad y el historial", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const db = localAdmin();
  const { data: community, error } = await db.from("communities").select("id").eq("slug", "mar-del-plata").single();
  expect(error).toBeNull();
  const claims = Array.from({ length: 25 }, () => crypto.randomUUID());
  const projects = Array.from({ length: 10 }, () => crypto.randomUUID());
  const expected = [
    ...projects.sort().reverse().map((id) => `/proyectos/${id}`),
    ...claims.sort().reverse().map((id) => `/reclamos/${id}`),
  ];
  const firstHref = "/perfil/?seccion=publicaciones&origen=e2e&actividad_filtro=apoyo&actividad_antes=2099-01-01T00%3A00%3A00Z&actividad_id=ffffffff-ffff-4fff-8fff-ffffffffffff&actividad_tipo=apoyo";
  let nativeContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    localCommunityFixture(`
      begin;
      insert into public.claims(id, community_id, author_id, title, description, category, created_at)
      values ${claims.map((id) => `('${id}', '${community!.id}', '${owner}', 'Publicación anterior ${id}', 'Fixture local de historial propio.', 'otro', '2090-01-01T12:00:00Z')`).join(",")};
      insert into public.projects(id, community_id, author_id, title, summary, plan, created_at)
      values ${projects.map((id) => `('${id}', '${community!.id}', '${owner}', 'Proyecto anterior ${id}', 'Fixture local de historial propio.', 'Revisar todas las publicaciones anteriores.', '2090-01-01T12:00:00Z')`).join(",")};
      commit;
    `);
    await login(page, firstHref);
    const publications = page.locator("[data-profile-publications] a");
    const readLinks = () => publications.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    await expect(publications).toHaveCount(20);
    await expect(page.getByRole("link", { name: "Publicaciones y Actividad", exact: true })).toHaveAccessibleName("Publicaciones y Actividad");
    await expect.poll(readLinks).toEqual(expected.slice(0,20));
    const activityBefore = await page.locator("[data-activity-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-activity-id")));
    await page.getByRole("link", { name: "Ver publicaciones anteriores", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.has("publicaciones_antes"));
    const readFixtureLinks = async () => (await readLinks()).filter((href) => expected.includes(href!));
    await expect.poll(readFixtureLinks).toEqual(expected.slice(20));
    await expect(page.getByRole("link", { name: "Publicaciones y Actividad", exact: true })).toHaveAccessibleName("Publicaciones y Actividad");
    const second = await readFixtureLinks();
    expect(new Set([...expected.slice(0,20), ...second]).size).toBe(35);
    expect(new URL(page.url()).searchParams.get("actividad_filtro")).toBe("apoyo");
    expect(new URL(page.url()).searchParams.get("actividad_id")).toBe("ffffffff-ffff-4fff-8fff-ffffffffffff");
    await expect.poll(() => page.locator("[data-activity-id]").evaluateAll((items) => items.map((item) => item.getAttribute("data-activity-id")))).toEqual(activityBefore);
    await page.reload();
    await expect.poll(readFixtureLinks).toEqual(second);
    await page.getByRole("link", { name: "Volver a mis publicaciones recientes", exact: true }).click();
    await expect(page).not.toHaveURL(/publicaciones_antes=/);
    await expect.poll(readLinks).toEqual(expected.slice(0,20));
    expect(new URL(page.url()).searchParams.get("origen")).toBe("e2e");
    await page.goBack();
    await expect(page).toHaveURL(/publicaciones_antes=/);
    await expect.poll(readFixtureLinks).toEqual(second);

    nativeContext = await browser.newContext({ baseURL, ...nativeContextOptions, storageState: await page.context().storageState() });
    const native = await nativeContext.newPage();
    await native.goto(firstHref);
    await native.getByRole("link", { name: "Ver publicaciones anteriores", exact: true }).click();
    await expect(native).toHaveURL(/publicaciones_antes=/);
    await expect.poll(async () => (await native.locator("[data-profile-publications] a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).filter((href) => expected.includes(href!))).toEqual(second);
  } finally {
    await nativeContext?.close();
    expect((await db.from("notifications").delete().in("entity_id", [...claims,...projects])).error).toBeNull();
    expect((await db.from("claims").delete().in("id", claims)).error).toBeNull();
    expect((await db.from("projects").delete().in("id", projects)).error).toBeNull();
  }
});

test("plegar los filtros de notificaciones conserva todas las opciones editadas", async ({ page }) => {
  await login(page, "/notificaciones/");
  const toggle = page.locator('summary[aria-controls="notification-filters"]');
  await expect(toggle).toHaveText("Más filtros");
  await expect(toggle.locator("..")).not.toHaveAttribute("open");
  const panelId = await toggle.getAttribute("aria-controls");
  expect(panelId).toBeTruthy();
  const form = page.locator(`#${panelId}`);
  await toggle.click();
  await form.getByLabel("Tipo de notificación").selectOption("poll_closed");
  await form.getByLabel("Sólo sin leer").check();
  const communitySelect = form.locator('select[name="comunidad"]');
  const community = await communitySelect.inputValue();
  await expect(toggle).toHaveText("Ocultar filtros");
  await toggle.click();
  await expect(form).toBeHidden();
  await expect(toggle.locator("..")).not.toHaveAttribute("open");
  await toggle.click();
  await expect(form.getByLabel("Tipo de notificación")).toHaveValue("poll_closed");
  await expect(form.getByLabel("Sólo sin leer")).toBeChecked();
  await expect(communitySelect).toHaveValue(community);
  await expect(toggle).toHaveText("Ocultar filtros");
  await toggle.click();
  await toggle.click();
  await form.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("tipo") === "poll_closed" && url.searchParams.get("sin_leer") === "1");
});

test("comprometer, corregir y retirar actualiza el aporte real y conserva el borrador rechazado", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const db = localAdmin();
  const projectId = crypto.randomUUID();
  const { data: community, error } = await db.from("communities").select("id").eq("slug", "mar-del-plata").single();
  expect(error).toBeNull();
  let nativeContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    localCommunityFixture(`insert into public.projects(id,community_id,author_id,title,summary,plan,budget_amount,currency,status) values ('${projectId}','${community!.id}','${owner}','Compromisos comprobables','Fixture local de compromisos.','Reunir apoyo para un plan comunitario.',10000,'ARS','funding');`);
    await login(page, `/proyectos/${projectId}`);
    const panel = page.locator("#aporte-proyecto");
    const amount = panel.locator('input[name="amount"]');
    const message = panel.getByRole("textbox", { name: "Mensaje", exact: true });
    await amount.fill("1200");
    await message.fill("Primer compromiso.");
    await panel.getByRole("button", { name: "Comprometer aporte", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Tu compromiso se guardó.");
    await expect(amount).toHaveCount(0);
    await expect(panel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
    await expect(panel.getByText("Primer compromiso.", { exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Cambiar monto", exact: true }).click();
    await expect(amount).toHaveValue("1200");
    await amount.evaluate((input) => input.removeAttribute("max"));
    await amount.fill("1000000001");
    await message.fill("Un borrador que debe conservarse.");
    await panel.getByRole("button", { name: "Actualizar compromiso", exact: true }).click();
    await expect(panel.getByText("El monto máximo por compromiso es 1.000.000.000.", { exact: true })).toBeVisible();
    await expect(amount).toHaveValue("1000000001");
    await expect(message).toHaveValue("Un borrador que debe conservarse.");
    const previous = await db.from("project_pledges").select("amount,message").eq("project_id", projectId).eq("user_id", owner).single();
    expect(previous.error).toBeNull();
    expect(Number(previous.data!.amount)).toBe(1200);
    expect(previous.data!.message).toBe("Primer compromiso.");
    await amount.fill("2300");
    await message.fill("Compromiso actualizado.");
    await panel.getByRole("button", { name: "Actualizar compromiso", exact: true }).click();
    await expect(amount).toHaveCount(0);
    await expect(panel.getByRole("status")).toContainText("Tu compromiso se guardó.");
    await expect(panel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "23");
    await expect(panel.getByText("Compromiso actualizado.", { exact: true })).toBeVisible();
    await expect(panel.getByText("Primer compromiso.", { exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Retirar compromiso", exact: true }).click();
    await panel.getByRole("button", { name: "Sí, retirar", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText("Tu compromiso se retiró.");
    await expect(amount).toHaveValue("");
    await expect(message).toHaveValue("");
    await expect(panel.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect((await db.from("project_pledges").select("id").eq("project_id", projectId)).data).toEqual([]);
    await page.reload();
    await expect(amount).toHaveValue("");
    await expect(panel.getByText("Quiénes se sumaron", { exact: true })).toHaveCount(0);

    nativeContext = await browser.newContext({ baseURL, ...nativeContextOptions, storageState: await page.context().storageState() });
    const native = await nativeContext.newPage();
    await native.goto(`/proyectos/${projectId}`);
    await native.locator('#aporte-proyecto input[name="amount"]').fill("1000");
    await native.locator('#aporte-proyecto textarea[name="message"]').fill("Compromiso nativo.");
    await native.getByRole("button", { name: "Comprometer aporte", exact: true }).click();
    await expect(native.locator("#aporte-proyecto").getByRole("status")).toContainText("Tu compromiso se guardó.");
    await expect(native.locator("#aporte-proyecto").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  } finally {
    await nativeContext?.close();
    expect((await db.from("notifications").delete().eq("entity_id", projectId)).error).toBeNull();
    expect((await db.from("projects").delete().eq("id", projectId)).error).toBeNull();
  }
});
