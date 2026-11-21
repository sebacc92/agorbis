import { expect, test } from "@playwright/test";

for (const javaScriptEnabled of [true, false]) {
  test.describe(
    javaScriptEnabled ? "búsqueda reanudable" : "búsqueda nativa",
    () => {
      test.use({ javaScriptEnabled });

      test("cambiar categoría envía el texto y todos los filtros editados", async ({
        page,
      }) => {
        await page.goto(
          "/buscar/?q=agua&tipo=poll&estado=active&comunidad=earth",
        );
        const form = page.getByRole("search", { name: "Buscar en Agorbis" });
        await form.getByRole("searchbox").fill("transporte");
        await form.getByLabel("Estado", { exact: true }).selectOption("closed");
        await form.getByLabel("Ordenar por").selectOption("recientes");
        await form.getByRole("button", { name: "Debate", exact: true }).click();
        await expect(page).toHaveURL(
          (url) =>
            url.searchParams.get("tipo") === "debate" &&
            url.searchParams.get("q") === "transporte",
        );
        const params = new URL(page.url()).searchParams;
        expect(params.getAll("tipo")).toEqual(["debate"]);
        expect(params.get("estado")).toBe("closed");
        expect(params.get("orden")).toBe("recientes");
        expect(params.get("comunidad")).toBe("earth");
        await expect(form.getByRole("searchbox")).toHaveValue("transporte");
        await expect(
          form.getByRole("button", { name: "Debate", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await form.getByRole("button", { name: "Todo", exact: true }).click();
        await expect(page).toHaveURL(
          (url) =>
            !url.searchParams.get("tipo") &&
            url.searchParams.get("q") === "transporte",
        );
      });
    },
  );
}

test("las pestañas de comunidad acompañan el contenido al desplazarse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/");
  const tabs = page.getByRole("navigation", {
    name: "Secciones de la comunidad",
  });
  await page.evaluate(() => window.scrollTo(0, 1300));
  await expect
    .poll(async () => (await tabs.boundingBox())?.y)
    .toBeGreaterThanOrEqual(60);
  await expect.poll(async () => (await tabs.boundingBox())?.y).toBeLessThan(70);
  await tabs.getByRole("link", { name: /^Reclamos/ }).click();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/reclamos\/?$/);
  await expect(tabs.locator('[aria-current="page"]')).toContainText("Reclamos");
  const firstClaim = page
    .locator('#listado-reclamos a[href^="/reclamos/"]')
    .first();
  await firstClaim.evaluate((card) => card.scrollIntoView({ block: "start" }));
  await expect
    .poll(async () => {
      const card = await firstClaim.boundingBox();
      const nav = await tabs.boundingBox();
      return !!card && !!nav && card.y >= nav.y + nav.height;
    })
    .toBe(true);
});

test("los ajustes de accesibilidad se pueden activar desde el acceso y persisten al registrarse", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/ingresar/");
  const trigger = page.getByRole("button", {
    name: "Opciones de accesibilidad cívica",
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Preferencias de accesibilidad",
  });
  await dialog.getByRole("button", { name: /Alto contraste/ }).click();
  await expect(page.locator("html")).toHaveClass(/contrast-more/);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.goto("/registro/");
  await expect(page.locator("html")).toHaveClass(/contrast-more/);
  await page
    .getByRole("button", { name: "Opciones de accesibilidad cívica" })
    .click();
  await expect(
    dialog.getByRole("button", { name: /Alto contraste/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
});

test("las fichas tienen controles táctiles y anuncian qué contenido expanden", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/");
  const firstExpand = page
    // D125: el chevron es un SVG decorativo; el nombre accesible queda sin flecha.
    .getByRole("button", { name: "Leer más", exact: true })
    .first();
  await expect(firstExpand).toHaveAttribute("aria-expanded", "false");
  const targetId = await firstExpand.getAttribute("aria-controls");
  const expand = page.locator(`button[aria-controls="${targetId}"]`);
  expect(targetId).toBeTruthy();
  const body = page.locator(`[id="${targetId}"]`);
  await expect(body).toBeHidden();
  for (const scale of [90, 100, 130]) {
    await page.evaluate((value) => {
      document.documentElement.style.fontSize = `${value}%`;
    }, scale);
    const box = await expand.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expect(body).toBeVisible();
  await expect(body).not.toBeEmpty();
  await expand.click();
  await expect(body).toBeHidden();
});
