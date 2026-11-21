import { expect, test } from "@playwright/test";

test("la búsqueda respeta la longitud admitida por SQL", async ({ page }) => {
  await page.goto("/buscar/?q=sa");
  const form = page.getByRole("search", { name: "Buscar en Agorbis" });
  const query = form.getByRole("searchbox", { name: "Buscar en Agorbis" });
  await expect(query).toHaveAttribute("minlength", "3");
  await expect(query).toHaveAttribute("maxlength", "100");
  await expect(
    page.getByText(
      "Escribí al menos tres letras y, si querés, acotá por tipo, estado o territorio.",
    ),
  ).toBeVisible();
  await query.fill("sa");
  await form.getByRole("button", { name: "Buscar", exact: true }).click();
  expect(
    await query.evaluate((input: HTMLInputElement) => input.validity.tooShort),
  ).toBe(true);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "sa");
});

test("una página fuera del alcance redirige a 26 conservando búsqueda y filtros", async ({
  request,
}) => {
  const response = await request.get(
    "/buscar/?q=salud&orden=recientes&tipo=claim&estado=open&comunidad=argentina&pagina=999",
    {
      maxRedirects: 0,
    },
  );
  expect(response.status()).toBe(302);
  const location = new URL(response.headers().location, "https://agorbis.test");
  expect(location.pathname).toBe("/buscar/");
  expect(Object.fromEntries(location.searchParams)).toEqual({
    q: "salud",
    orden: "recientes",
    tipo: "claim",
    estado: "open",
    comunidad: "argentina",
    pagina: "26",
  });
});

for (const language of ["es", "en"] as const) {
  test(`buscar tiene controles accesibles y táctiles a 320px (${language})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "agorbis_recent_searches",
        JSON.stringify(["agua", "plazas"]),
      );
    });
    await page.goto(`/buscar/?q=salud&lang=${language}`);
    const label = language === "es" ? "Buscar en Agorbis" : "Search Agorbis";
    const form = page.getByRole("search", { name: label });
    const query = form.getByRole("searchbox", { name: label });
    await expect(query).toHaveValue("salud");
    await expect(
      form.locator("label").filter({ hasText: label }),
    ).toBeVisible();

    const submit = form.getByRole("button", {
      name: language === "es" ? "Buscar" : "Search",
      exact: true,
    });
    const clear = form.getByRole("button", {
      name: language === "es" ? "Borrar búsqueda" : "Clear search",
    });
    for (const button of [submit, clear]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await clear.click();
    await expect(query).toHaveValue("");
    await expect(query).toBeFocused();

    const categories = form.getByRole("navigation", {
      name: language === "es" ? "Tipos de contenido" : "Content types",
    });
    await expect(
      categories.locator('[aria-pressed="true"]'),
    ).toHaveAccessibleName(language === "es" ? "Todo" : "Everything");
    // Los números de la página actual no representan totales por categoría.
    for (const text of await categories.getByRole("button").allTextContents()) {
      expect(text).not.toMatch(/\d/);
    }
    const expand = form.locator(
      'button[aria-controls="search-advanced-filters"]',
    );
    await expect(expand).toHaveAccessibleName(
      language === "es" ? "Más filtros" : "More filters",
    );
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    const controls = await expand.getAttribute("aria-controls");
    await expect(page.locator(`#${controls}`)).toBeHidden();
    await expand.click();
    await expect(expand).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`#${controls}`)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);

    const history = page.locator(
      'section[aria-labelledby="busquedas-recientes"]',
    );
    const remove = history.getByRole("button", {
      name:
        language === "es"
          ? "Eliminar agua del historial"
          : "Remove agua from history",
    });
    const clearHistory = history.getByRole("button", {
      name: language === "es" ? "Borrar historial" : "Clear history",
    });
    for (const control of [remove, clearHistory]) {
      const box = await control.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await remove.click();
    await expect(
      history.getByRole("link", { name: "agua", exact: true }),
    ).toHaveCount(0);
    await expect(
      history.getByRole("link", { name: "plazas", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === "salud",
    );
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("agorbis_recent_searches") ?? "[]"),
      ),
    ).toEqual(["salud", "plazas"]);
    await clearHistory.click();
    await expect(history).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("agorbis_recent_searches"),
      ),
    ).toBeNull();
  });
}

test("la consulta acompaña los temas, categorías y el historial sin recargar", async ({
  page,
}) => {
  await page.goto("/buscar/?q=agua");
  const query = page.locator('main input[name="q"]');
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await expect(query).toHaveValue("agua");
  await page
    .locator('section[aria-labelledby="temas-populares"]')
    .getByRole("link", { name: "salud", exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "salud");
  await expect(query).toHaveValue("salud");

  await query.fill("borrador sin aplicar");
  const categories = page.getByRole("navigation", {
    name: "Tipos de contenido",
  });
  await categories.getByRole("button", { name: "Encuesta", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("tipo") === "poll" && url.searchParams.get("q") === "borrador sin aplicar",
  );
  await expect(query).toHaveValue("borrador sin aplicar");
  await expect(
    categories.locator('[aria-pressed="true"]'),
  ).toHaveAccessibleName("Encuesta");

  await page.goBack();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "salud" && !url.searchParams.has("tipo"),
  );
  await expect(query).toHaveValue("salud");
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "agua");
  await expect(query).toHaveValue("agua");
  await page.goForward();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "salud");
  await expect(query).toHaveValue("salud");
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
});

test("ocultar los filtros conserva las selecciones al volver a buscar", async ({
  page,
}) => {
  await page.goto(
    "/buscar/?q=salud&tipo=poll&estado=active&orden=recientes&comunidad=earth",
  );
  const form = page.locator("main form");
  await expect(form.locator('input[name="comunidad"]')).toHaveValue("earth");
  await form.getByLabel("Estado", { exact: true }).selectOption("closed");
  await form.getByLabel("Ordenar por").selectOption("relevancia");
  await form.getByRole("button", { name: "Ocultar filtros" }).click();
  await expect(form.getByRole("button", { name: "Más filtros" })).toBeVisible();
  await expect(form.locator('select[name="estado"]')).toBeHidden();
  await expect(form.locator('select[name="orden"]')).toBeHidden();
  await form.locator('input[name="q"]').fill("agua");
  await form.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "agua");
  const parameters = new URL(page.url()).searchParams;
  expect(parameters.get("tipo")).toBe("poll");
  expect(parameters.get("estado")).toBe("closed");
  expect(parameters.get("orden")).toBe("relevancia");
  expect(parameters.get("comunidad")).toBe("earth");
  await expect(form.getByLabel("Estado", { exact: true })).toHaveValue(
    "closed",
  );
  await expect(form.getByLabel("Ordenar por")).toHaveValue("relevancia");
});
