import { expect, test } from "@playwright/test";

const MENU = "Secciones del manual";

test("el manual muestra el menú a la izquierda y marca el tema que se lee", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/manual/");
  const menu = page.getByRole("navigation", { name: MENU });
  const content = page.locator("#idea");

  // El comienzo del tema arriba, como cuando se llega por su enlace: la
  // sección actual es la que empieza en el tercio superior de la pantalla.
  await page
    .locator("#tema-accesibilidad")
    .evaluate((section) => section.scrollIntoView());
  const topic = menu.getByRole("link", { name: "Accesibilidad y teclado" });

  // A la izquierda del contenido y sin irse al bajar: es una columna fija.
  const [menuBox, contentBox] = [
    await menu.boundingBox(),
    await content.boundingBox(),
  ];
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(contentBox!.x);
  await expect(menu).toBeInViewport();
  await expect(topic).toHaveAttribute("aria-current", "location");
  // La columna es más alta que la ventana: el tema actual se trae a la vista.
  await expect(topic).toBeInViewport();
});

test("en teléfono la sección actual queda a la vista en la franja del menú", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/manual/");
  const menu = page.getByRole("navigation", { name: MENU });

  await page
    .locator("#tema-reclamos")
    .evaluate((section) => section.scrollIntoView());
  const pill = menu.getByRole("link", { name: "Cada pantalla, en detalle" });

  // En la franja los temas no se ven: su sección se resalta, y la ubicación
  // que se anuncia sigue siendo una sola, la del tema.
  await expect(pill).toHaveClass(/bg-brand-50/);
  // 0,95 y no 1: el menú se centra con `offsetLeft`, que es entero, y con las
  // fuentes de la CI la píldora mide una fracción de píxel más. Quedaba al
  // 99,8% a la vista y el test fallaba por algo que nadie ve. Lo que se
  // protege es que no quede fuera de la franja, y eso sigue cubierto.
  await expect(pill).toBeInViewport({ ratio: 0.95 });
  // Los temas son el submenú de escritorio; en la franja no entran.
  await expect(
    menu.getByRole("link", { name: "Reclamos y mapa" }),
  ).toBeHidden();
});

test("un enlace a una pregunta la abre", async ({ page }) => {
  await page.goto("/manual/#borradores");

  const entry = page.locator("details#borradores");

  await expect(entry).toHaveAttribute("open", "");
  await expect(entry).toBeInViewport();
});

test("el buscador filtra mientras se escribe y vuelve a mostrar todo al borrar", async ({
  page,
}) => {
  await page.goto("/manual/");
  const entries = page.locator("[data-manual-faq] details");
  const total = await entries.count();

  await page
    .getByRole("searchbox", { name: "Buscar en las preguntas" })
    .fill("foto perfil");

  await expect(page.getByText(/respuestas para “foto perfil”/)).toBeVisible();
  expect(await entries.count()).toBeLessThan(total);
  await page.getByRole("button", { name: "Borrar búsqueda" }).click();
  await expect(entries).toHaveCount(total);
  await expect(
    page.getByRole("searchbox", { name: "Buscar en las preguntas" }),
  ).toHaveValue("");
});

test("un enlace del menú a un tema que la búsqueda ocultó borra la búsqueda", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/manual/");
  const search = page.getByRole("searchbox", {
    name: "Buscar en las preguntas",
  });
  await search.fill("residencia");
  await expect(page.locator("#tema-debates")).toBeHidden();

  await page
    .getByRole("navigation", { name: MENU })
    .getByRole("link", { name: "Debates", exact: true })
    .click();

  await expect(search).toHaveValue("");
  await expect(page.locator("#tema-debates")).toBeInViewport();
});

test("el enlace de Primeros pasos abre la pregunta del registro", async ({
  page,
}) => {
  await page.goto("/manual/");

  await page
    .locator("#primeros-pasos")
    .getByRole("link", { name: "¿Cómo es el registro, paso a paso?" })
    .click();

  const entry = page.locator("details#registro-paso-a-paso");
  await expect(entry).toHaveAttribute("open", "");
  await expect(entry).toBeInViewport();
});

test("un fragmento mal codificado no rompe los enlaces a preguntas", async ({
  page,
}) => {
  await page.goto("/manual/#%");

  await page.evaluate(() => (window.location.hash = "borradores"));

  await expect(page.locator("details#borradores")).toHaveAttribute("open", "");
});

test.describe("sin JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("la búsqueda llega por la URL y el servidor entrega la lista filtrada", async ({
    page,
  }) => {
    await page.goto("/manual/?q=residencia");

    const entries = page.locator("[data-manual-faq] details");

    await expect(page.getByText(/respuestas para “residencia”/)).toBeVisible();
    expect(await entries.count()).toBeGreaterThan(0);
    expect(await entries.count()).toBeLessThan(20);
    await expect(
      page.getByRole("searchbox", { name: "Buscar en las preguntas" }),
    ).toHaveValue("residencia");
  });

  test("“Abrir todas las respuestas” las entrega abiertas, para leer o imprimir", async ({
    page,
  }) => {
    await page.goto("/manual/");

    await page
      .getByRole("link", { name: "Abrir todas las respuestas" })
      .click();

    const entries = page.locator("[data-manual-faq] details");
    await expect(page).toHaveURL(/abrir=todas/);
    expect(await entries.count()).toBe(
      await page.locator("[data-manual-faq] details[open]").count(),
    );
    await expect(
      page.getByRole("link", { name: "Cerrar todas las respuestas" }),
    ).toBeVisible();
  });

  test("una búsqueda sin resultados lo dice y no deja preguntas", async ({
    page,
  }) => {
    await page.goto("/manual/?q=zzzqqq");

    await expect(
      page.getByText(/No encontramos respuestas para “zzzqqq”/),
    ).toBeVisible();
    await expect(page.locator("[data-manual-faq] details")).toHaveCount(0);
  });
});
