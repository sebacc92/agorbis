import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { nativeContextOptions } from "./native-context";

function localFixtureQuery(sql: string) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!url || !["127.0.0.1", "localhost"].includes(new URL(url).hostname) || new URL(url).port !== "54821") {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  return execFileSync("docker", ["exec", "-i", "supabase_db_agorbis", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  });
}

// Se ejecuta sin JavaScript para comprobar que la búsqueda no depende de
// filtrar en el navegador las veinte filas ya descargadas.
test.describe("búsqueda completa de reclamos", () => {
  test.use({ ...nativeContextOptions });

  test("busca antes del límite y conserva todos los filtros al avanzar y volver", async ({ page }) => {
    const prefix = `Reclamos E2E ${crypto.randomUUID()}`;
    const term = `${prefix} coincidencia`;
    const literal = `${prefix} .*%_ "(x),status.neq.removed" \\`;
    try {
      localFixtureQuery(`
        begin;
        insert into public.claims(community_id, title, description, category, created_at)
        select c.id, '${prefix} sin coincidencia ' || n, 'Otra descripción.',
          'otro', timestamptz '2091-01-01 00:00:00+00'
        from public.communities c cross join generate_series(1, 30) n where c.slug = 'mar-del-plata';
        insert into public.claims(community_id, title, description, category, created_at)
        select c.id, '${prefix} resultado ' || n, '${term}',
          'otro', timestamptz '2090-01-01 00:00:00+00'
        from public.communities c cross join generate_series(1, 30) n where c.slug = 'mar-del-plata';
        insert into public.claims(community_id, title, description, category, status, created_at)
        select c.id, '${term} otra categoría', 'Fuera del filtro.', 'servicios', 'open', timestamptz '2092-01-01 00:00:00+00' from public.communities c where c.slug = 'mar-del-plata'
        union all
        select c.id, '${term} resuelto', 'Fuera del filtro.', 'otro', 'resolved', timestamptz '2092-01-01 00:00:00+00' from public.communities c where c.slug = 'mar-del-plata';
        insert into public.claims(community_id, title, description, category, created_at)
        select c.id, '${literal}', 'Búsqueda literal.', 'otro', timestamptz '2089-01-01 00:00:00+00' from public.communities c where c.slug = 'mar-del-plata';
        commit;
      `);
      await page.goto("/c/mar-del-plata/reclamos/?categoria=otro&estado=abiertos");
      const search = page.getByRole("search");
      await search.getByRole("searchbox", { name: "Buscar reclamos", exact: true }).fill(term);
      await search.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("q") === term && url.searchParams.get("categoria") === "otro" && url.searchParams.get("estado") === "abiertos" && !url.searchParams.has("antes"));
      const cards = page.locator("#listado-reclamos > li");
      await expect(cards).toHaveCount(20);
      await expect(cards.first()).toContainText(`${prefix} resultado`);
      const first = await cards.locator("h3 a, a h3").evaluateAll((items) => items.map((item) => item.textContent));
      await page.getByRole("link", { name: "Ver reclamos más antiguos", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.has("antes") && url.searchParams.get("q") === term && url.searchParams.get("categoria") === "otro" && url.searchParams.get("estado") === "abiertos");
      await expect(cards).toHaveCount(10);
      const second = await cards.locator("h3 a, a h3").evaluateAll((items) => items.map((item) => item.textContent));
      expect(new Set([...first, ...second]).size).toBe(30);
      await page.getByRole("link", { name: "← Volver al principio", exact: true }).click();
      await expect(cards).toHaveCount(20);
      await expect(page).toHaveURL((url) => !url.searchParams.has("antes") && url.searchParams.get("q") === term && url.searchParams.get("estado") === "abiertos");
      await page.getByRole("link", { name: "Más apoyados", exact: true }).first().click();
      await expect(page).toHaveURL((url) => url.searchParams.get("orden") === "apoyados" && url.searchParams.get("q") === term && url.searchParams.get("categoria") === "otro" && url.searchParams.get("estado") === "abiertos");
      await search.getByRole("searchbox", { name: "Buscar reclamos", exact: true }).fill(literal);
      await search.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(cards).toHaveCount(1);
      await expect(cards.first()).toContainText(literal);
      await expect(page).toHaveURL((url) => url.searchParams.get("q") === literal && url.searchParams.get("orden") === "apoyados");
      await search.getByRole("link", { name: "Limpiar búsqueda", exact: true }).click();
      await expect(page).toHaveURL((url) => !url.searchParams.has("q") && url.searchParams.get("orden") === "apoyados" && url.searchParams.get("categoria") === "otro" && url.searchParams.get("estado") === "abiertos");
    } finally {
      localFixtureQuery(`delete from public.claims where title like '${prefix}%';`);
    }
  });
});

test("la consulta rápida omite vencidas y retira la invitación cuando llega el cierre", async ({ page }) => {
  const prefix = `Consulta E2E ${crypto.randomUUID()}`;
  try {
    localFixtureQuery(`
      begin;
      insert into public.polls(community_id, question, type, results_visibility, closes_at, created_at)
      select c.id, '${prefix} vencida', 'binary', 'after_close', timestamptz '2020-01-01 00:00:00+00', timestamptz '2091-01-01 00:00:00+00' from public.communities c where c.slug = 'mar-del-plata';
      insert into public.polls(community_id, question, type, results_visibility, closes_at, created_at)
      select c.id, '${prefix} abierta', 'binary', 'after_close', now() + interval '2 minutes', timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug = 'mar-del-plata';
      insert into public.poll_options(poll_id, label, sort_order)
      select p.id, 'Opción de prueba ' || n, n from public.polls p cross join generate_series(0,1) n where p.question = '${prefix} abierta';
      commit;
    `);
    await page.clock.install({ time: new Date() });
    await page.goto("/c/mar-del-plata/");
    const card = page.locator("article, section, div").filter({ has: page.getByRole("heading", { name: `${prefix} abierta`, exact: true }) }).filter({ has: page.getByRole("link", { name: "Votar en esta encuesta", exact: true }) }).last();
    await expect(page.getByRole("heading", { name: `${prefix} abierta`, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: `${prefix} vencida`, exact: true })).toHaveCount(0);
    await expect(card).toContainText("Resultados al cierre");
    await expect(card).not.toContainText("votos emitidos");
    await expect(page.getByRole("link", { name: "Opción de prueba 0", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Votar en esta encuesta", exact: true }).scrollIntoViewIfNeeded();
    await page.clock.runFor(1_000);
    await page.clock.fastForward(125_000);
    await expect(page.getByRole("heading", { name: `${prefix} abierta`, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Votar en esta encuesta", exact: true })).toHaveCount(0);
  } finally {
    localFixtureQuery(`delete from public.polls where question like '${prefix}%';`);
  }
});

test("el directorio local enlaza perfiles y la solicitud de acreditación", async ({ page }) => {
  const suffix = crypto.randomUUID();
  const name = `Institución E2E ${suffix}`;
  const slug = `institucion-e2e-${suffix}`;
  try {
    localFixtureQuery(`
      insert into public.organizations(community_id, name, slug, type, verified_at)
      select c.id, '${name}', '${slug}', 'institution', now() from public.communities c where c.slug = 'mar-del-plata';
    `);
    await page.goto("/c/mar-del-plata/instituciones/");
    await expect(page.getByRole("link", { name: "Acreditar una institución", exact: true })).toHaveAttribute("href", "/instituciones/solicitar");
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/instituciones/${slug}/?$`));
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  } finally {
    localFixtureQuery(`delete from public.organizations where slug = '${slug}';`);
  }
});
