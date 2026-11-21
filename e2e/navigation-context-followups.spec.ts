import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

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

test("las búsquedas recientes conservan territorio, tipo, estado y orden y reinician la página", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("agorbis_recent_searches", JSON.stringify(["agua"]));
  });
  await page.goto(
    "/buscar/?q=salud&tipo=claim&estado=open&comunidad=argentina&orden=recientes&pagina=2",
  );
  const recent = page
    .locator('[aria-labelledby="busquedas-recientes"]')
    .getByRole("link", { name: "agua", exact: true });
  const target = new URL((await recent.getAttribute("href")) ?? "", page.url());
  expect(Object.fromEntries(target.searchParams)).toEqual({
    q: "agua",
    tipo: "claim",
    estado: "open",
    comunidad: "argentina",
    orden: "recientes",
  });
  await recent.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "agua" &&
      url.searchParams.get("comunidad") === "argentina" &&
      url.searchParams.get("tipo") === "claim" &&
      url.searchParams.get("estado") === "open" &&
      url.searchParams.get("orden") === "recientes" &&
      !url.searchParams.has("pagina"),
  );
  await expect(
    page.getByRole("searchbox", { name: "Buscar en Agorbis", exact: true }),
  ).toHaveValue("agua");
});

test("Victorias explica filtros vacíos y la revisión barrial sólo invita a recorrer", async ({
  page,
  browser,
  baseURL,
}) => {
  const slug = `navegacion-${crypto.randomUUID()}`;
  const title = `Victoria ${crypto.randomUUID()}`;
  try {
    localCommunityFixture(`
      insert into public.communities(slug,name,level,parent_id,path) select '${slug}','Barrio de navegación',4,id,path || '.${slug}' from public.communities where slug='buenos-aires';
      insert into public.claims(community_id,title,description,category,status) select id,'${title}','Reclamo resuelto de la prueba de filtros.','otro','resolved' from public.communities where slug='${slug}';
    `);
    await page.goto(`/c/${slug}/victorias/`);
    await page.getByRole("button", { name: /Proyectos completados/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "No hay victorias con estos filtros",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Todavía no hay victorias registradas",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();
    const all = page.getByRole("button", { name: /Todas las victorias/ });
    await expect(all).toHaveAttribute("aria-pressed", "true");
    await expect(all).toBeFocused();
    await expect(
      page.getByRole("heading", {
        name: "No hay victorias con estos filtros",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /Reclamos solucionados/ }).click();
    await page.getByRole("button", { name: "Transporte", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "No hay victorias con estos filtros",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Limpiar filtros", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, level: 3, exact: true }),
    ).toBeVisible();
    await page.goto(`/c/${slug}/mapa/`);
    await page.getByRole("button", { name: /Revisar mi barrio/ }).click();
    await expect(
      page.getByRole("heading", {
        name: "Una invitación a recorrer el barrio",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Este panel no identifica zonas sin reclamos.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Detector de Zonas Silenciosas y Cuadras sin Cobertura", {
        exact: true,
      }),
    ).toHaveCount(0);
    const native = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
    });
    try {
      const current = await native.newPage();
      await current.goto(`/c/${slug}/victorias/`);
      await expect(
        current.getByRole("heading", { name: title, level: 3, exact: true }),
      ).toBeVisible();
      await expect(
        current.getByRole("heading", {
          name: "Todavía no hay victorias registradas",
          exact: true,
        }),
      ).toHaveCount(0);
    } finally {
      await native.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.claims where title='${title}'; delete from public.communities where slug='${slug}';`,
    );
  }
});

test("las etiquetas de CUIT y teléfono identifican y enfocan su control con y sin JavaScript", async ({
  page,
  browser,
  baseURL,
}) => {
  await login(page);
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled,
      storageState: await page.context().storageState(),
    });
    try {
      const current = await context.newPage();
      await current.goto("/instituciones/solicitar/");
      for (const [label, value] of [
        ["CUIT / Identificador", "30123456789"],
        ["Teléfono de contacto", "1123456789"],
      ]) {
        const input = current.getByLabel(label, { exact: true });
        await current.getByText(label, { exact: true }).click();
        await expect(input).toBeFocused();
        await input.fill(value);
        await expect(input).not.toHaveValue("");
      }
    } finally {
      await context.close();
    }
  }
});
