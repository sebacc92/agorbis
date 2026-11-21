import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const viewerId = "33333333-3333-4333-8333-333333333333";
async function login(page: Page) {
  await page.goto("/ingresar/?next=%2Fperfil");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/?$/);
}

test("seguir y retirar conservan su estado confirmado con JavaScript y por POST nativo", async ({
  page,
  browser,
  baseURL,
}) => {
  const slug = `seguimiento-${crypto.randomUUID()}`;
  try {
    localCommunityFixture(
      `insert into public.communities(slug,name,level,parent_id,path) select '${slug}','Comunidad de seguimiento',4,id,path || '.${slug}' from public.communities where slug='buenos-aires';`,
    );
    await login(page);
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled,
        storageState: await page.context().storageState(),
      });
      try {
        const current = await context.newPage();
        await current.goto(`/c/${slug}/`);
        await current
          .getByRole("button", { name: "Seguir", exact: true })
          .click();
        await expect(
          current.getByRole("button", { name: "Siguiendo", exact: true }),
        ).toBeVisible();
        await expect(
          current
            .getByRole("status")
            .filter({ hasText: "Ahora seguís Comunidad de seguimiento" }),
        ).toHaveCount(1);
        await current.reload();
        await current
          .getByRole("button", { name: "Siguiendo", exact: true })
          .click();
        await expect(
          current.getByRole("button", { name: "Seguir", exact: true }),
        ).toBeVisible();
        await expect(
          current
            .getByRole("status")
            .filter({ hasText: "Dejaste de seguir Comunidad de seguimiento" }),
        ).toHaveCount(1);
        await current.reload();
        await expect(
          current.getByRole("button", { name: "Seguir", exact: true }),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    }
  } finally {
    localCommunityFixture(
      `delete from public.communities where slug='${slug}';`,
    );
  }
});

test("cambiar visibilidad revalida la lista conservando búsqueda y anonimato con y sin JavaScript", async ({
  page,
  browser,
  baseURL,
}) => {
  const original = localCommunityFixture(
    `copy (select coalesce((select v.is_anonymous::text from public.community_visibility v join public.communities c on c.id=v.community_id where v.user_id='${viewerId}' and c.slug='mar-del-plata'),'missing')) to stdout;`,
  ).trim();
  try {
    await login(page);
    for (const javaScriptEnabled of [true, false]) {
      localCommunityFixture(
        `insert into public.community_visibility(user_id,community_id,is_anonymous) select '${viewerId}',id,true from public.communities where slug='mar-del-plata' on conflict(user_id,community_id) do update set is_anonymous=true;`,
      );
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled,
        storageState: await page.context().storageState(),
      });
      try {
        const current = await context.newPage();
        await current.goto("/c/mar-del-plata/miembros/?q=Sof%C3%ADa");
        const person = current.getByRole("link", {
          name: /Sofía Rearte.*@sofia_mdq/,
        });
        await expect(person).toHaveCount(0);
        await current
          .getByRole("button", {
            name: "👻 Aparecés anónimo — mostrarme",
            exact: true,
          })
          .click();
        await expect(
          current.getByRole("button", {
            name: "👤 Aparecés en la lista — ocultarme",
            exact: true,
          }),
        ).toBeVisible();
        await expect(person).toHaveCount(1);
        await expect(
          current
            .getByRole("status")
            .filter({ hasText: "Ahora aparecés en la lista de Mar del Plata" }),
        ).toHaveCount(1);
        await expect(
          current.getByRole("searchbox", {
            name: "Buscar vecino por nombre o usuario",
            exact: true,
          }),
        ).toHaveValue("Sofía");
        await current
          .getByRole("button", {
            name: "👤 Aparecés en la lista — ocultarme",
            exact: true,
          })
          .click();
        await expect(
          current.getByRole("button", {
            name: "👻 Aparecés anónimo — mostrarme",
            exact: true,
          }),
        ).toBeVisible();
        await expect(person).toHaveCount(0);
        await expect(
          current
            .getByRole("status")
            .filter({
              hasText: "Ahora aparecés como anónimo en Mar del Plata",
            }),
        ).toHaveCount(1);
        await current.reload();
        await expect(person).toHaveCount(0);
      } finally {
        await context.close();
      }
    }
  } finally {
    localCommunityFixture(
      `delete from public.community_visibility where user_id='${viewerId}' and community_id=(select id from public.communities where slug='mar-del-plata'); ${original === "true" || original === "false" ? `insert into public.community_visibility(user_id,community_id,is_anonymous) select '${viewerId}',id,${original} from public.communities where slug='mar-del-plata';` : ""}`,
    );
  }
});

test("cada victoria destacada abre y comparte su reclamo exacto", async ({
  page,
  browser,
  baseURL,
}) => {
  const prefix = `Victoria ${crypto.randomUUID()}`;
  const claimIds = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    localCommunityFixture(
      `insert into public.claims(id,community_id,title,description,category,status,created_at) select '${claimIds[0]}'::uuid,id,'${prefix} primera','Fixture de victoria con destino propio.','otro','resolved',timestamptz '2099-01-01 00:00:00+00' from public.communities where slug='mar-del-plata' union all select '${claimIds[1]}'::uuid,id,'${prefix} segunda','Fixture de otra victoria.','otro','resolved',timestamptz '2099-01-02 00:00:00+00' from public.communities where slug='mar-del-plata';`,
    );
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (payload: ShareData) => {
          Reflect.set(window, "sharedVictory", payload);
        },
      });
    });
    await page.goto("/c/mar-del-plata/victorias/?categoria=otro#resultados");
    for (const [index, suffix] of ["primera", "segunda"].entries()) {
      const title = `${prefix} ${suffix}`;
      const link = page
        .locator("h4")
        .getByRole("link", { name: title, exact: true });
      await expect(link).toHaveAttribute(
        "href",
        `/reclamos/${claimIds[index]}`,
      );
      await page
        .getByRole("button", {
          name: `Compartir victoria: ${title}`,
          exact: true,
        })
        .click();
      await expect
        .poll(() => page.evaluate(() => Reflect.get(window, "sharedVictory")))
        .toMatchObject({
          title,
          url: new URL(`/reclamos/${claimIds[index]}`, baseURL).href,
          text: expect.stringContaining(`/reclamos/${claimIds[index]}`),
        });
    }
    const native = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
    });
    try {
      const current = await native.newPage();
      await current.goto("/c/mar-del-plata/victorias/");
      await current
        .locator("h4")
        .getByRole("link", { name: `${prefix} segunda`, exact: true })
        .click();
      await expect(current).toHaveURL(
        new RegExp(`/reclamos/${claimIds[1]}/?$`),
      );
      await expect(
        current
          .getByRole("heading", { name: `${prefix} segunda`, exact: true })
          .first(),
      ).toBeVisible();
    } finally {
      await native.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.claims where title like '${prefix}%';`,
    );
  }
});
