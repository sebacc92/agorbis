import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

test("Actividad enlaza y muestra el comentario propio fuera de destacados, también por HTML", async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  const debateId = "c0000000-0000-4000-8000-000000000001";
  const marker = `Destino de actividad ${crypto.randomUUID()}`;
  const ids = Array.from({ length: 21 }, () => crypto.randomUUID());
  const targetId = ids[20];
  const href = `/debates/${debateId}?comentario=${targetId}#comment-${targetId}`;
  try {
    localCommunityFixture(`
      insert into public.debate_comments(id, debate_id, column_community_id, user_id, body, score, created_at)
      select t.id, '${debateId}', c.id, '33333333-3333-4333-8333-333333333333',
        '${marker} ' || n, case when n < 21 then 1000 else -1000 end, now()
      from public.communities c cross join unnest(array[${ids.map((id) => `'${id}'::uuid`).join(",")}]) with ordinality t(id,n)
      where c.slug='buenos-aires';
    `);
    await page.goto(`/ingresar/?next=${encodeURIComponent("/perfil/?seccion=publicaciones&actividad_filtro=comentario")}`);
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil\/\?seccion=publicaciones/);
    const link = page.locator(`[data-activity-id="comentario:${targetId}"] a`);
    await expect(link).toHaveAttribute("href", href);
    const state = await page.context().storageState();
    await link.click();
    await expect(page).toHaveURL((url) => url.searchParams.get("comentario") === targetId && url.hash === `#comment-${targetId}`);
    await expect(page.locator(`#comment-${targetId}`)).toContainText(`${marker} 21`);
    await expect(page.locator(`#comment-${targetId}`)).toBeInViewport();
    await expect(page.locator(`#comment-${targetId}`)).toBeFocused();

    const nativeContext = await browser.newContext({ baseURL, ...nativeContextOptions, storageState: state });
    try {
      const native = await nativeContext.newPage();
      await native.goto("/perfil/?seccion=publicaciones&actividad_filtro=comentario");
      const nativeLink = native.locator(`[data-activity-id="comentario:${targetId}"] a`);
      await expect(nativeLink).toHaveAttribute("href", href);
      await nativeLink.click();
      await expect(native.locator(`#comment-${targetId}`)).toContainText(`${marker} 21`);
      await expect(native.locator(`#comment-${targetId}`)).toBeInViewport();
    } finally {
      await nativeContext.close();
    }
  } finally {
    localCommunityFixture(`delete from public.debate_comments where id in (${ids.map((id) => `'${id}'`).join(",")});`);
  }
});
