import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

async function login(page: Page, id: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(`/encuestas/${id}/`)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/encuestas/${id}/?$`));
}

for (const native of [false, true])
  test(`cerrar encuesta conserva confirmación y reserva real ${native ? "por HTML nativo" : "con JavaScript"}`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const id = crypto.randomUUID();
    try {
      localCommunityFixture(`insert into public.polls(id,community_id,author_id,question,type,category,closes_at)
      select '${id}'::uuid,id,'33333333-3333-4333-8333-333333333333','¿Cómo priorizamos estas propuestas?','single','comunidad',now()+interval '1 day' from public.communities where slug='mar-del-plata';
      insert into public.poll_options(poll_id,label,sort_order) values ('${id}'::uuid,'Primera opción',0),('${id}'::uuid,'Segunda opción',1);`);
      await login(page, id);
      const context = native
        ? await browser.newContext({
            baseURL,
            ...nativeContextOptions,
            storageState: await page.context().storageState(),
          })
        : undefined;
      try {
        const target = context ? await context.newPage() : page;
        if (context) await target.goto(`/encuestas/${id}/`);
        // D124: Cerrar vive dentro del panel único "Zona del autor".
        const author = target.locator('[data-author-action="close"]');
        await author.locator("summary").click();
        await expect(
          author.getByRole("button", {
            name: "Sí, cerrar la votación",
            exact: true,
          }),
        ).toBeVisible();
        await author
          .getByRole("link", { name: "Cancelar", exact: true })
          .click();
        await expect(
          author.getByRole("button", {
            name: "Sí, cerrar la votación",
            exact: true,
          }),
        ).toBeHidden();
        expect(
          localCommunityFixture(
            `select status from public.polls where id='${id}'::uuid;`,
          ),
        ).toContain("active");
        await author.locator("summary").click();
        await author
          .getByRole("button", { name: "Sí, cerrar la votación", exact: true })
          .focus();
        await target.keyboard.press("Enter");
        await expect(author.getByRole("status")).toHaveText(
          "La encuesta se cerró.",
        );
        await expect(
          target.getByRole("button", { name: "Votar", exact: true }),
        ).toHaveCount(0);
        if (!native)
          await target
            .getByRole("link", {
              name: "Consultar resultados finales",
              exact: true,
            })
            .click();
        await expect(
          target.getByText(
            "La ronda cerró, pero los resultados siguen ocultos porque participaron menos de 5 personas. No mostramos el número exacto.",
            { exact: true },
          ),
        ).toBeVisible();
        expect(
          localCommunityFixture(
            `select status from public.polls where id='${id}'::uuid;`,
          ),
        ).toContain("closed");
      } finally {
        await context?.close();
      }
    } finally {
      localCommunityFixture(`delete from public.polls where id='${id}'::uuid;`);
    }
  });
