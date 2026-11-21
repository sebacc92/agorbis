import { expect, test } from "@playwright/test";

/**
 * Décima ronda, mejora 8. A 390 px la búsqueda abría con una insignia, un
 * título grande, un párrafo y una tarjeta que volvía a titular "Buscar en
 * Agorbis"; con "miramar" escrito, el primer resultado quedaba fuera de la
 * primera pantalla. Ahora la cabecera es una línea, los temas destacados sólo
 * aparecen sin consulta y el primer resultado entra en la pantalla inicial.
 */
test.use({ viewport: { width: 390, height: 844 } });

test("con una consulta, el primer resultado entra en la primera pantalla del teléfono", async ({
  page,
}) => {
  await page.goto("/buscar/?q=mar");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Buscar en Agorbis",
  );
  await expect(page.getByText("Descubrimiento")).toHaveCount(0);

  const results = page.locator(
    'section[aria-labelledby="resultados-busqueda"] ol a',
  );
  await expect(results.first()).toBeVisible();
  const box = await results.first().boundingBox();
  expect(box).not.toBeNull();
  // Sin desplazar: el resultado arranca dentro de los 844 px visibles y no
  // debajo del borde inferior.
  expect(box!.y).toBeLessThan(844 - 80);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // Los temas destacados siguen acompañando la consulta, pero debajo de los
  // resultados, no delante.
  const topics = page.locator('section[aria-labelledby="temas-populares"]');
  await expect(topics).toHaveCount(1);
  const topicsBox = await topics.boundingBox();
  expect(topicsBox!.y).toBeGreaterThan(box!.y);
});

test("sin consulta, los temas destacados siguen ahí para arrancar", async ({
  page,
}) => {
  await page.goto("/buscar/");
  await expect(page.getByText("Temas destacados")).toBeVisible();
  await expect(page.getByText("¿Qué querés encontrar?")).toBeVisible();
});
