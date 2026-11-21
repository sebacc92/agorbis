import { expect, test } from "@playwright/test";
import { signInTestAccount } from "./account-followup-fixtures";

const PHONE = { width: 390, height: 844 };

test("el directorio de sub-comunidades entra en un teléfono sin desbordar", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/argentina/sub/");
  await expect(page.locator("#sub-list a").first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(PHONE.width);
});

test("el carril de secciones avisa a la izquierda cuando hay pestañas escondidas", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const rail = page.locator("[data-tabs-fade]");

  // En la primera sección el carril arranca al principio: no hay nada atrás.
  await page.goto("/c/argentina/");
  await expect(rail).toBeVisible();
  await expect(rail).not.toHaveAttribute("data-scrolled");

  // "Comparar" es la última: el carril se desliza y la primera pestaña queda
  // cortada. Sin el degradé se leía "royectos" pegado al borde.
  await page.goto("/c/argentina/contraste/");
  await expect
    .poll(() => rail.locator("ul").evaluate((list) => list.scrollLeft))
    .toBeGreaterThan(0);
  await expect(rail).toHaveAttribute("data-scrolled");
});

test("la barra inferior marca la sección activa y sus etiquetas entran con la fuente más ancha", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(page, "sofia@agorbis.test", "/c/mar-del-plata/");
  const nav = page.getByRole("navigation", {
    name: "Navegación principal inferior",
  });
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toContainText("Mi comunidad");
  // La marca de activa no depende sólo del color: una raya arriba.
  expect(
    await current.evaluate(
      (element) => getComputedStyle(element, "::before").opacity,
    ),
  ).toBe("1");

  // El cuerpo usa la fuente del sistema: Noto Sans en una máquina, DejaVu
  // Sans en el runner de la CI, bastante más ancha. Con DejaVu "Mi
  // comunidad" pasaba a dos líneas y "Notificaciones" se salía sobre el
  // acceso vecino; la prueba la fuerza para que falle igual en cualquier
  // máquina.
  await page.addStyleTag({
    content: `nav[aria-label="Navegación principal inferior"] * { font-family: "DejaVu Sans", Verdana, sans-serif !important; }`,
  });
  const labels = await nav.locator(":scope > div > *").evaluateAll((items) =>
    items.map((item) => {
      const label = [...item.querySelectorAll("span")].pop()!;
      return {
        text: label.textContent!.trim(),
        height: label.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(label).lineHeight),
        overflow: label.scrollWidth - item.getBoundingClientRect().width,
      };
    }),
  );
  expect(labels.map((label) => label.text)).toEqual([
    "Inicio",
    "Mi comunidad",
    "Publicar",
    "Notificaciones",
    "Perfil",
  ]);
  for (const label of labels) {
    // Una sola línea y sin pasarse de su lugar.
    expect(label.height, label.text).toBeLessThan(label.lineHeight * 1.5);
    expect(label.overflow, label.text).toBeLessThanOrEqual(0);
  }
});

test("Publicar presenta cada tipo con su ícono y su nombre, sin emojis", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(page, "sofia@agorbis.test", "/publicar/");
  const headings = page.locator("main h2");
  await expect(headings).toHaveText([
    "Encuestas",
    "Debates",
    "Reclamos",
    "Proyectos",
  ]);
  for (const heading of await headings.all()) {
    await expect(heading.locator("svg")).toHaveCount(1);
  }
});

test("los datos de una ficha no dejan un punto separador colgando al cortar la línea", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/mar-del-plata/debates/");
  await page.locator('main a[href^="/debates/"]').first().click();
  await expect(page).toHaveURL(/\/debates\/[0-9a-f-]{36}\/?$/);
  // La del autor, no la de la cabecera de comunidad.
  const line = page
    .locator("main .meta-line")
    .filter({ hasText: "Ver todos los debates" });
  await expect(line).toBeVisible();
  // Los puntos los dibuja el CSS delante de cada dato; el que abre un
  // renglón cae fuera del recorte. Antes eran `<span>·</span>` sueltos y
  // quedaban al final o al principio de la línea.
  await expect(line.getByText("·", { exact: true })).toHaveCount(0);
  const starts = await line.evaluate((outer) => {
    const edge = outer.getBoundingClientRect().left;
    const items = [...outer.querySelectorAll(".meta-line-items > *")];
    const tops = new Map<number, number>();
    for (const item of items) {
      const box = item.getBoundingClientRect();
      // Por el centro: en un mismo renglón conviven el avatar y el texto.
      const row = Math.round((box.top + box.bottom) / 2 / 12);
      tops.set(row, Math.min(tops.get(row) ?? Infinity, box.left));
    }
    return [...tops.values()].map((left) => Math.round(edge - left));
  });
  expect(starts.length).toBeGreaterThan(1);
  for (const hidden of starts) expect(hidden).toBeGreaterThanOrEqual(16);
});

// Tanda 2: coherencia con el sistema visual.

test("la comparativa usa la cabecera y las cifras del sistema, sin emojis", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/mar-del-plata/comparativa/");
  const section = page.locator('section[aria-labelledby="comparativa-titulo"]');
  await expect(
    section.getByRole("heading", { level: 2 }),
  ).toHaveText("Comparativa territorial e impacto vecinal");
  // El layout ya pone el contenedor: la página no trae otro adentro.
  await expect(page.locator(".container-content .container-content")).toHaveCount(0);
  expect(await section.textContent()).not.toMatch(/[📊🏆→]/u);
  // Sin reclamos no hay tasa: antes salía un "0%" grande y verde.
  const empty = section
    .locator("dl")
    .filter({ hasText: "Total reportados:" })
    .filter({ hasText: /Total reportados:\s*0/ })
    .first();
  if ((await empty.count()) > 0) {
    await expect(
      empty.locator("xpath=preceding-sibling::dl[1]"),
    ).toContainText("Todavía sin reclamos");
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(PHONE.width);
});

test("el contraste encabeza los reclamos con el ícono del tipo", async ({
  page,
}) => {
  await page.goto("/c/argentina/contraste/");
  const heading = page.locator("#reclamos-perfil-titulo");
  await expect(heading).toHaveText("Qué reclama cada territorio");
  await expect(heading.locator("svg")).toHaveCount(1);
});

test("una dirección que no existe muestra la misma página que cualquier 404, con buscador", async ({
  page,
}) => {
  const response = await page.goto("/no-existe-esta-direccion/");
  expect(response?.status()).toBe(404);
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toHaveText(
    "Esta página no existe",
  );
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(1);
  // La ilustración propia y el código, como en `HttpErrorPage`.
  await expect(main.locator("svg").first()).toBeVisible();
  await expect(main.getByText("404", { exact: true })).toHaveCount(1);
  expect(await main.textContent()).not.toContain("🧭");
  await expect(main.locator("code")).toHaveText("/no-existe-esta-direccion/");
  await expect(main.getByRole("searchbox")).toBeVisible();
  // Una sola acción principal: el buscador.
  await expect(
    main.getByRole("link", { name: "Explorar comunidades", exact: true }),
  ).toBeVisible();
});

test("los tipos de encuesta se dibujan con formas del sistema, sin glifos ni emojis", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(
    page,
    "sofia@agorbis.test",
    "/c/mar-del-plata/encuestas/nueva/",
  );
  const types = page.getByRole("group", { name: "Tipo de encuesta" });
  await expect(types.getByRole("radio")).toHaveCount(3);
  expect(await types.textContent()).not.toMatch(/[◉○☑☐👍👎]/u);
});

test("la cabecera de la comunidad no deja puntos colgando", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/argentina/");
  const line = page.locator("[data-community-page] > header .meta-line");
  await expect(line).toBeVisible();
  await expect(line.getByText("·", { exact: true })).toHaveCount(0);
});

// Tanda 3: jerarquía y densidad en teléfono.

/** Cuántos renglones ocupan los elementos: por el centro de cada uno. */
const rowsOf = (locator: import("@playwright/test").Locator) =>
  locator.evaluateAll(
    (elements) =>
      new Set(
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return Math.round((box.top + box.bottom) / 2 / 16);
        }),
      ).size,
  );

test("Inicio muestra sus dos filas de filtros en un renglón cada una", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(page, "sofia@agorbis.test", "/inicio/");
  for (const name of ["Comunidades de tu cadena", "Tipos de contenido"]) {
    const row = page.getByRole("navigation", { name, exact: true });
    await expect(row).toBeVisible();
    // Antes envolvían: seis renglones de chips antes de la primera tarjeta.
    expect(await rowsOf(row.getByRole("link"))).toBe(1);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(PHONE.width);

  // Con un filtro del final aplicado, su chip queda a la vista.
  await page.goto("/inicio/?comunidad=mar-del-plata");
  const applied = page
    .getByRole("navigation", { name: "Comunidades de tu cadena", exact: true })
    .locator('[aria-current="page"]');
  await expect(applied).toContainText("Mar del Plata");
  await expect(applied).toBeInViewport({ ratio: 1 });
});

test("el mapa ofrece las distancias en un solo renglón", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/mar-del-plata/mapa/");
  const distances = page.getByRole("group", { name: "Distancia aproximada" });
  await expect(distances.getByRole("button")).toHaveCount(5);
  expect(await rowsOf(distances.getByRole("button"))).toBe(1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(PHONE.width);
});

test("Explorar deja el botón junto al campo y los filtros rápidos en un renglón", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/explorar/");
  const form = page.locator("main form").filter({
    has: page.getByRole("button", { name: "Buscar", exact: true }),
  });
  const field = form.getByRole("searchbox");
  const submit = form.getByRole("button", { name: "Buscar", exact: true });
  await expect(submit).toBeVisible();
  const [fieldBox, submitBox] = [
    await field.boundingBox(),
    await submit.boundingBox(),
  ];
  // En el mismo renglón: antes el botón ocupaba todo el ancho debajo.
  expect(submitBox!.x).toBeGreaterThan(fieldBox!.x + fieldBox!.width - 1);
  expect(Math.abs(submitBox!.y - fieldBox!.y)).toBeLessThan(12);

  const quick = page.getByRole("group", { name: "Filtro rápido" });
  await expect(quick).toBeVisible();
  expect(await rowsOf(quick.getByRole("button"))).toBe(1);
});

test("Instituciones sin resultados pide la verificación una sola vez", async ({
  page,
}) => {
  await page.goto("/instituciones/");
  const main = page.locator("main");
  const cards = main.getByRole("list", { name: "Instituciones verificadas" });
  test.skip((await cards.count()) > 0, "el seed ya tiene instituciones");
  await expect(main.locator('a[href="/instituciones/solicitar"]')).toHaveCount(
    1,
  );
});

test("el aviso a quien visita una sección ocupa menos: sus dos salidas van en un renglón", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await page.goto("/c/mar-del-plata/reclamos/");
  const header = page.locator("[data-community-page] > header");
  const signUp = header.getByRole("link", { name: "Crear cuenta", exact: true });
  const signIn = header.getByRole("link", { name: "Ingresá", exact: true });
  await expect(signUp).toBeVisible();
  // El texto del aviso (D116) no cambia.
  await expect(header).toContainText(
    "Podés leer esta comunidad. Creá una cuenta para seguirla y declará tu residencia para votar o comentar acá.",
  );
  const [upBox, inBox] = [await signUp.boundingBox(), await signIn.boundingBox()];
  expect(
    Math.abs(upBox!.y + upBox!.height / 2 - (inBox!.y + inBox!.height / 2)),
  ).toBeLessThan(12);
});

// Tanda 4: formularios y cuenta.

test("reclamo y encuesta eligen la categoría con el mismo control", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(
    page,
    "sofia@agorbis.test",
    "/c/mar-del-plata/reclamos/nuevo/",
  );
  const anatomy = async () => {
    const option = page
      .getByRole("group", { name: "Categoría", exact: true })
      .locator("label")
      .filter({ has: page.locator("input:not(:checked)") })
      .first();
    await expect(option).toBeVisible();
    return option.evaluate((label) => {
      const style = getComputedStyle(label);
      return {
        direction: style.flexDirection,
        radius: style.borderTopLeftRadius,
        fontSize: style.fontSize,
        tall: label.getBoundingClientRect().height >= 44,
      };
    });
  };
  const claim = await anatomy();
  await page.goto("/c/mar-del-plata/encuestas/nueva/");
  const poll = await anatomy();
  expect(claim).toEqual(poll);
  expect(claim.tall).toBe(true);
});

test("Notificaciones deja la hora bajo el título y sus acciones con una sola anatomía", async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await signInTestAccount(page, "sofia@agorbis.test", "/notificaciones/");
  const first = page.locator("main li").filter({ has: page.locator("time") }).first();
  await expect(first).toBeVisible();
  const title = first.locator("a, button").filter({ hasText: /\S/ }).first();
  const [titleBox, timeBox] = [
    await title.boundingBox(),
    await first.locator("time").first().boundingBox(),
  ];
  // En el teléfono la hora va debajo del título y a su izquierda, como un
  // dato más: antes quedaba sola, contra el borde derecho.
  expect(timeBox!.y).toBeGreaterThan(titleBox!.y);
  expect(timeBox!.x).toBeLessThan(titleBox!.x + 8);
  // El título conserva el ancho de la fila: no se aprieta en una columna.
  expect(titleBox!.width).toBeGreaterThan(150);

  const listen = page.getByRole("button", { name: "Escuchar resumen auditivo" });
  const markAll = page.getByRole("button", { name: /^Marcar .* como leídas$/ });
  test.skip((await markAll.count()) === 0, "sin notificaciones por leer");
  const look = (locator: typeof listen) =>
    locator.evaluate((element) => {
      const style = getComputedStyle(element);
      return [
        Math.round(element.getBoundingClientRect().height),
        style.borderTopLeftRadius,
        style.fontSize,
      ];
    });
  expect(await look(listen)).toEqual(await look(markAll));
});

test("Seguridad dice el estado de la sesión sin siglas", async ({ page }) => {
  await signInTestAccount(page, "sofia@agorbis.test", "/perfil/seguridad/");
  const session = page.locator("main").getByText("Sesión actual").locator("..");
  await expect(session).toBeVisible();
  expect(await page.locator("main").textContent()).not.toMatch(/AAL[12]/);
});

test("el pie de las pantallas de cuenta avisa una vez que sus enlaces abren otra pestaña", async ({
  page,
}) => {
  await page.goto("/ingresar/");
  const legal = page.getByRole("navigation", { name: "Legal y ayuda" });
  const links = legal.getByRole("link");
  await expect(links.first()).toBeVisible();
  // Un ícono por enlace eran ocho: queda un aviso para toda la fila.
  await expect(legal.locator("a svg")).toHaveCount(0);
  await expect(
    page.locator("footer").getByText("Se abren en una pestaña nueva.", {
      exact: true,
    }),
  ).toBeVisible();
  // Para un lector de pantalla cada enlace lo sigue diciendo (WCAG 3.2.5).
  for (const link of await links.all()) {
    await expect(link).toHaveAccessibleName(/\(se abre en una pestaña nueva\)/);
    await expect(link).toHaveAttribute("target", "_blank");
  }
});

test("el Manual aprovecha el ancho del escritorio en su tarjeta de cierre", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/manual/");
  const card = page
    .locator("main section")
    .filter({ hasText: "El espíritu de Agorbis" })
    .first();
  const text = card.locator("p").filter({ hasText: /^Amor cívico es sentir/ });
  const quote = card.locator("p").filter({
    hasText: /^Lo común también es un poco tuyo/,
  });
  const [textBox, quoteBox] = [await text.boundingBox(), await quote.boundingBox()];
  // La frase destacada va al costado: antes el texto ocupaba 768 de 1300 px.
  expect(quoteBox!.x).toBeGreaterThan(textBox!.x + textBox!.width);
});
