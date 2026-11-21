import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("inicio filtra antes de paginar y conserva los filtros en la navegación", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  ) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const prefix = `Inicio E2E ${crypto.randomUUID()}`;
  // El service role no tiene EXECUTE sobre la función de los índices de
  // búsqueda. Las fixtures van por PostgreSQL local, sin cambiar sus grants.
  const localFixtureQuery = (sql: string) =>
    execFileSync(
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

  try {
    localFixtureQuery(`
      begin;
      insert into public.claims(community_id, title, description, category, created_at)
      select c.id, '${prefix} reclamo ' || n, 'Fixture de filtros del inicio.',
        'otro', timestamptz '2090-01-01 00:00:00+00'
      from public.communities c cross join generate_series(1, 30) n
      where c.slug = 'mar-del-plata';
      insert into public.polls(community_id, question, type, results_visibility, closes_at, created_at)
      select c.id, '${prefix} encuesta ' || n, 'binary', 'after_close',
        timestamptz '2020-01-01 00:00:00+00', timestamptz '2091-01-01 00:00:00+00'
      from public.communities c cross join generate_series(1, 28) n
      where c.slug = 'earth';
      commit;
    `);

    await page.goto(
      "/ingresar/?next=%2Finicio%2F%3Fcomunidad%3Dmar-del-plata%26tipo%3Dclaim",
    );
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(
      (target) =>
        target.pathname === "/inicio/" &&
        target.searchParams.get("tipo") === "claim",
    );
    const fixtureCards = page
      .locator("main ol li")
      .filter({ has: page.getByRole("heading", { name: new RegExp(prefix) }) });
    await expect(fixtureCards).toHaveCount(24);
    const contentTypes = page.getByRole("navigation", {
      name: "Tipos de contenido",
    });
    await expect(
      contentTypes.getByRole("link", { name: "Reclamos", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: /^📣 Reclamos/ }),
    ).toHaveCount(0);
    await expect(page.getByText("Filtro rápido:", { exact: true })).toHaveCount(
      0,
    );
    const firstIds = await fixtureCards
      .locator("a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    await page
      .getByRole("link", { name: "Ver publicaciones más antiguas" })
      .click();
    await expect(page).toHaveURL(
      (target) =>
        target.searchParams.has("antes") &&
        target.searchParams.get("comunidad") === "mar-del-plata" &&
        target.searchParams.get("tipo") === "claim",
    );
    await expect(fixtureCards).toHaveCount(6);
    const secondIds = await fixtureCards
      .locator("a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
    expect(new Set([...firstIds, ...secondIds]).size).toBe(30);
    await page.getByRole("link", { name: "← Volver a lo último" }).click();
    await expect(page).toHaveURL(
      (target) =>
        !target.searchParams.has("antes") &&
        target.searchParams.get("comunidad") === "mar-del-plata" &&
        target.searchParams.get("tipo") === "claim",
    );
    await expect(fixtureCards).toHaveCount(24);

    await page.goto("/inicio/?comunidad=earth&tipo=poll");
    const expired = fixtureCards.first();
    await expect(expired).toContainText("Cerrada");
    await expect(expired).toContainText("Ver encuesta");
    await expect(expired).toContainText("Sin resultados por baja participación");
    await expect(expired).not.toContainText("Participar del voto");
  } finally {
    localFixtureQuery(`
      begin;
      delete from public.claims where title like '${prefix}%';
      delete from public.polls where question like '${prefix}%';
      commit;
    `);
  }
});
