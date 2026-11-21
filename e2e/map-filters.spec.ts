import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { nativeContextOptions } from "./native-context";

function localFixtureQuery(sql: string) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  )
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_agorbis",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  );
}

test.describe("búsqueda del mapa mediante HTML", () => {
  test.use({ ...nativeContextOptions });
  test("busca literalmente en todos los títulos y ubicaciones antes del límite y preserva filtros", async ({
    page,
  }) => {
    const prefix = `Mapa E2E ${crypto.randomUUID()}`;
    const term = `${prefix} .*%_ "(x),status.neq.removed"`;
    try {
      localFixtureQuery(`
        begin;
        insert into public.claims(community_id,title,description,category,location_text,lat,lng,created_at)
        select c.id,'${prefix} reciente ' || n,'Fixture fuera de la búsqueda.','otro','Sin coincidencia',c.lat,c.lng,timestamptz '2091-01-01 00:00:00+00' from public.communities c cross join generate_series(1,110) n where c.slug='mar-del-plata';
        insert into public.claims(community_id,title,description,category,location_text,lat,lng,created_at)
        select c.id,'${prefix} ubicación ' || n,'Fixture por ubicación.','otro','${term}',c.lat,c.lng,timestamptz '2090-01-01 00:00:00+00' from public.communities c cross join generate_series(1,3) n where c.slug='mar-del-plata';
        insert into public.claims(community_id,title,description,category,location_text,lat,lng,created_at)
        select c.id,'${term}','Fixture por título.','otro','Otro lugar',c.lat,c.lng,timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata';
        insert into public.claims(community_id,title,description,category,status,location_text,lat,lng,created_at)
        select c.id,'${prefix} otra categoría','Fixture excluida.','servicios','open','${term}',c.lat,c.lng,timestamptz '2092-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata'
        union all
        select c.id,'${prefix} resuelto','Fixture excluida.','otro','resolved','${term}',c.lat,c.lng,timestamptz '2092-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata';
        commit;
      `);
      await page.goto("/c/mar-del-plata/mapa/?categoria=otro&estado=abiertos");
      const form = page.getByRole("search");
      await form
        .getByRole("searchbox", {
          name: "Buscar reclamos en el mapa",
          exact: true,
        })
        .fill(term);
      await form.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("q") === term &&
          url.searchParams.get("categoria") === "otro" &&
          url.searchParams.get("estado") === "abiertos",
      );
      await expect(page.locator("#map-claims > button")).toHaveCount(4);
      await expect(
        page.getByRole("status").filter({ hasText: "Mostrando" }),
      ).toContainText("Mostrando 4 reclamos");
      await page.reload();
      await expect(page.locator("#map-claims > button")).toHaveCount(4);
      const status = page.getByRole("navigation", {
        name: "Filtrar por estado",
        exact: true,
      });
      // D126: el Chip marca aria-current="page" y el trofeo es un ícono SVG
      // decorativo, fuera del nombre accesible.
      await expect(
        status.getByRole("link", {
          name: "Abiertos / En demanda",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "page");
      await status
        .getByRole("link", { name: "Resueltos (Victorias)", exact: true })
        .click();
      await expect(page.locator("#map-claims > button")).toHaveCount(1);
      await expect(page.locator("#map-claims > button")).toContainText(
        `${prefix} resuelto`,
      );
      await expect(page).toHaveURL(
        (url) =>
          url.searchParams.get("q") === term &&
          url.searchParams.get("categoria") === "otro" &&
          url.searchParams.get("estado") === "resueltos",
      );
      const categories = page.getByRole("navigation", {
        name: "Filtrar reclamos por categoría",
        exact: true,
      });
      await categories
        .getByRole("link", { name: "Servicios", exact: true })
        .click();
      await expect(page.locator("#map-claims > button")).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await form
        .getByRole("link", { name: "Limpiar búsqueda", exact: true })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          !url.searchParams.has("q") &&
          url.searchParams.get("categoria") === "servicios" &&
          url.searchParams.get("estado") === "resueltos",
      );
    } finally {
      localFixtureQuery(
        `delete from public.claims where title like '${prefix}%';`,
      );
    }
  });
});

test("el mapa anuncia radio y selección con teclado y ofrece controles táctiles", async ({
  page,
}) => {
  const prefix = `Mapa teclado ${crypto.randomUUID()}`;
  try {
    localFixtureQuery(
      `insert into public.claims(community_id,title,description,category,lat,lng,created_at) select c.id,'${prefix} ' || n,'Fixture de navegación.','otro',c.lat,c.lng,timestamptz '2090-01-01 00:00:00+00' from public.communities c cross join generate_series(1,2) n where c.slug='mar-del-plata';`,
    );
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(`/c/mar-del-plata/mapa/?q=${encodeURIComponent(prefix)}`);
    const initial = page.getByRole("button", {
      name: "1 km",
      exact: true,
    });
    const next = page.getByRole("button", {
      name: "500 m",
      exact: true,
    });
    await expect(initial).toHaveAttribute("aria-pressed", "true");
    await expect(initial).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(next).toHaveAttribute("aria-pressed", "true");
    await expect(initial).toHaveAttribute("aria-pressed", "false");
    const cards = page.locator("#map-claims > button");
    await expect(cards).toHaveCount(2);
    await cards.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "false");
    const dimensions = await next.boundingBox();
    expect(dimensions?.height).toBeGreaterThanOrEqual(44);
    const category = page
      .getByRole("navigation", {
        name: "Filtrar reclamos por categoría",
        exact: true,
      })
      .getByRole("link", { name: "Todas las categorías", exact: true });
    expect((await category.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    localFixtureQuery(
      `delete from public.claims where title like '${prefix}%';`,
    );
  }
});
