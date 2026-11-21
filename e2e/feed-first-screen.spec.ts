import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

/**
 * Mejora 7 de D112 (D117): en el teléfono, el inicio muestra una publicación
 * en la primera pantalla, dice qué filtro está puesto y no le pide participar
 * a quien ya votó. Sofía vive en Mar del Plata y en el seed ya votó las
 * encuestas de la Tierra, Argentina y Mar del Plata; los reclamos se siembran
 * acá para que las specs vecinas, que corren en paralelo, no los tapen.
 */
const ARGENTINA_POLL = "a0000000-0000-4000-8000-000000000002";

async function signInSofia(page: Page, next: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL((target) => target.pathname === "/inicio/");
}

test("el inicio muestra una publicación en la primera pantalla y marca lo votado y lo apoyado", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const prefix = `Inicio primera pantalla ${crypto.randomUUID()}`;
  try {
    // Fixtures propias con fecha posterior a cualquier otra. Las specs
    // vecinas corren en paralelo y siembran reclamos en Mar del Plata y
    // encuestas en la Tierra, así que los reclamos van a la provincia, que
    // también está en la cadena de Sofía. El apoyo se inserta directo, como
    // hace el seed.
    localCommunityFixture(`
      begin;
      insert into public.polls(community_id, question, type, results_visibility, closes_at, created_at)
      select c.id, '${prefix} encuesta sin votar', 'binary', 'after_close',
        timestamptz '2093-01-01 00:00:00+00', timestamptz '2092-01-01 00:00:00+00'
      from public.communities c where c.slug = 'mar-del-plata';
      insert into public.claims(community_id, author_id, title, description, category, created_at)
      select c.id, p.id, '${prefix} reclamo apoyado', 'Fixture de marcas del inicio.',
        'otro', timestamptz '2092-01-02 00:00:00+00'
      from public.communities c, public.profiles p
      where c.slug = 'buenos-aires' and p.username = 'sofia_mdq';
      insert into public.claims(community_id, author_id, title, description, category, created_at)
      select c.id, p.id, '${prefix} reclamo ajeno', 'Fixture de marcas del inicio.',
        'otro', timestamptz '2092-01-01 00:00:00+00'
      from public.communities c, public.profiles p
      where c.slug = 'buenos-aires' and p.username = 'admin_geo';
      insert into public.claim_supports(claim_id, user_id)
      select cl.id, p.id from public.claims cl, public.profiles p
      where cl.title = '${prefix} reclamo apoyado' and p.username = 'sofia_mdq';
      commit;
    `);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInSofia(page, "/inicio/");

    // La auditoría midió la primera tarjeta en y≈1151. Ahora entra en la
    // primera pantalla, con margen para que se vea que es una publicación.
    const cards = page.locator("main ol li");
    const first = cards.first();
    await expect(first).toBeVisible();
    const box = await first.boundingBox();
    if (!box) throw new Error("La primera tarjeta no tiene caja visible.");
    expect(box.y).toBeLessThan(760);
    await expect(first).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    // La encuesta sin recibo invita a participar.
    const fresh = cards.filter({ hasText: `${prefix} encuesta sin votar` });
    await expect(fresh).toHaveCount(1);
    await expect(fresh).toContainText("Participar del voto");
    await expect(fresh).not.toContainText("Ya votaste");

    // El chip muestra su resultado: una región viva, siempre presente, dice
    // qué se está mostrando. El layout tiene las suyas; ésta es la de `main`.
    const status = page.locator('main p[role="status"]');
    await expect(status).toHaveText("");
    await expect(page.getByRole("link", { name: "Quitar filtros" })).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Comunidades de tu cadena" })
      .getByRole("link", { name: /Argentina/ })
      .click();
    await expect(page).toHaveURL(
      (target) => target.searchParams.get("comunidad") === "argentina",
    );
    await expect(status).toContainText("Argentina");
    await expect(status).toBeInViewport();

    // La encuesta de Argentina que Sofía ya votó no le pide participar.
    const voted = cards.filter({
      has: page.locator(`a[href="/encuestas/${ARGENTINA_POLL}"]`),
    });
    await expect(voted).toHaveCount(1);
    await expect(voted).toContainText("Ya votaste");
    await expect(voted).toContainText("Ver encuesta");
    await expect(voted).not.toContainText("Participar del voto");
    await expect(voted).not.toContainText(/\d+ votantes/);

    // Reclamos de la provincia: el apoyado dice Apoyaste y el ajeno, no.
    await page.goto("/inicio/?comunidad=buenos-aires&tipo=claim");
    await expect(status).toContainText("reclamos");
    await expect(status).toContainText("Buenos Aires");
    const supported = cards.filter({ hasText: `${prefix} reclamo apoyado` });
    await expect(supported).toHaveCount(1);
    await expect(supported).toContainText("Apoyaste");
    const foreign = cards.filter({ hasText: `${prefix} reclamo ajeno` });
    await expect(foreign).toHaveCount(1);
    await expect(foreign).not.toContainText("Apoyaste");

    await page.getByRole("link", { name: "Quitar filtros" }).click();
    await expect(page).toHaveURL(
      (target) => target.pathname === "/inicio/" && target.search === "",
    );
    await expect(status).toHaveText("");
  } finally {
    try {
      localCommunityFixture(`
        begin;
        delete from public.claims where title like '${prefix}%';
        delete from public.polls where question like '${prefix}%';
        commit;
      `);
    } catch (error) {
      // Una limpieza fallida deja tarjetas fantasma para la próxima corrida:
      // que quede a la vista en el reporte, sin tapar el error original.
      test.info().annotations.push({
        type: "limpieza-fallida",
        description: String(error),
      });
      console.error("No se pudo limpiar las fixtures del inicio", error);
    }
  }
});
