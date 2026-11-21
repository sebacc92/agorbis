import { expect, test, type Page } from "@playwright/test";
import { signInTestAccount } from "./account-followup-fixtures";
import { localCommunityFixture } from "./local-community-fixtures";

for (const javaScriptEnabled of [true, false]) {
  test.describe(
    javaScriptEnabled
      ? "directorios y encuestas reanudables"
      : "directorios y encuestas por HTML",
    () => {
      test.use({ javaScriptEnabled });

      test("encuentra nombres posteriores a 300, pagina sin perder el filtro y distingue los vacíos", async ({
        page,
      }) => {
        const suffix = crypto.randomUUID();
        const slug = `directorio-${suffix}`;
        const query = `Z destino ${suffix} .*%_ "A&B"`;
        const path = `/c/${slug}/sub/`;
        try {
          localCommunityFixture(`
          begin;
          insert into public.communities(slug,name,level,parent_id,path)
          select '${slug}','Directorio ${suffix}',3,id,path || '.${slug}' from public.communities where slug='argentina';
          insert into public.communities(slug,name,level,parent_id,path)
          select '${slug}-child-' || n,
            case when n <= 300 then 'A comunidad ' || lpad(n::text,3,'0') else '${query} ' || lpad(n::text,3,'0') end,
            4,c.id,c.path || '.${slug}-child-' || n
          from public.communities c cross join generate_series(1,330) n where c.slug='${slug}';
          commit;
        `);
          await page.goto(`${path}?pagina=14`);
          const cards = page.locator("#sub-list > a");
          await expect(cards).toHaveCount(18);
          await expect(
            page.getByRole("status").filter({
              hasText: "Página 14 · 18 sub-comunidades en esta página.",
            }),
          ).toBeVisible();
          const search = page.getByRole("search", {
            name: "Buscar sub-comunidades",
            exact: true,
          });
          await search
            .getByRole("searchbox", {
              name: "Buscar sub-comunidades por nombre",
              exact: true,
            })
            .fill(query);
          await search
            .getByRole("button", { name: "Buscar", exact: true })
            .click();
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("q") === query &&
              !url.searchParams.has("pagina"),
          );
          await expect(cards).toHaveCount(24);
          const first = await cards.allTextContents();
          expect(first.every((text) => text.includes(query))).toBe(true);
          const pagination = page.getByRole("navigation", {
            name: "Paginación de sub-comunidades",
            exact: true,
          });
          await pagination
            .getByRole("link", { name: "Siguiente", exact: true })
            .click();
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("q") === query &&
              url.searchParams.get("pagina") === "2",
          );
          await expect(cards).toHaveCount(6);
          expect(
            new Set([...first, ...(await cards.allTextContents())]).size,
          ).toBe(30);
          await expect(
            pagination.getByRole("link", { name: "Siguiente", exact: true }),
          ).toHaveCount(0);
          await pagination
            .getByRole("link", { name: "← Volver al principio", exact: true })
            .click();
          await expect(cards).toHaveCount(24);
          await expect(search.getByRole("searchbox")).toHaveValue(query);
          await search.getByRole("searchbox").fill(`${suffix} imposible`);
          await search
            .getByRole("button", { name: "Buscar", exact: true })
            .click();
          await expect(
            page.getByRole("heading", {
              name: "No encontramos comunidades con ese nombre.",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("heading", {
              name: `Directorio ${suffix} no tiene sub-comunidades`,
              exact: true,
            }),
          ).toHaveCount(0);
          await search
            .getByRole("link", { name: "Limpiar búsqueda", exact: true })
            .click();
          await expect(cards).toHaveCount(24);
          await page.goto(`${path}?q=${encodeURIComponent(query)}&pagina=999`);
          await expect(
            page.getByRole("heading", {
              name: "No hay más sub-comunidades para mostrar.",
              exact: true,
            }),
          ).toBeVisible();
          await pagination
            .getByRole("link", { name: "← Volver al principio", exact: true })
            .click();
          await expect(cards).toHaveCount(24);
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("q") === query &&
              !url.searchParams.has("pagina"),
          );
        } finally {
          localCommunityFixture(
            `delete from public.communities where slug like '${slug}-child-%'; delete from public.communities where slug='${slug}';`,
          );
        }
      });

      test("una página exacta no ofrece otra vacía y el cursor agotado conserva la categoría", async ({
        page,
      }) => {
        const suffix = crypto.randomUUID();
        const slug = `encuestas-fin-${suffix}`;
        const path = `/c/${slug}/encuestas/`;
        try {
          localCommunityFixture(`
          insert into public.communities(slug,name,level,parent_id,path)
          select '${slug}','Encuestas ${suffix}',4,id,path || '.${slug}' from public.communities where slug='buenos-aires';
        `);
          await page.goto(path);
          await expect(
            page.getByRole("heading", {
              name: `Nadie preguntó nada todavía en Encuestas ${suffix}`,
              exact: true,
            }),
          ).toBeVisible();
          localCommunityFixture(`
          begin;
          insert into public.polls(community_id,question,type,category,results_visibility,closes_at,created_at)
          select c.id,'Encuesta ${suffix} ' || n,'binary','ambiente','after_close',timestamptz '2092-01-01 00:00:00+00',timestamptz '2090-01-01 00:00:00+00'
          from public.communities c cross join generate_series(1,20) n where c.slug='${slug}';
          insert into public.polls(community_id,question,type,category,results_visibility,closes_at,created_at)
          select c.id,'Encuesta ${suffix} salud','binary','salud','after_close',timestamptz '2092-01-01 00:00:00+00',timestamptz '2091-01-01 00:00:00+00' from public.communities c where c.slug='${slug}';
          commit;
        `);
          await page.goto(`${path}?categoria=ambiente`);
          const cards = page.locator(
            'section[aria-labelledby="encuestas-titulo"] > ul > li',
          );
          await expect(cards).toHaveCount(20);
          await expect(
            page.getByRole("link", {
              name: "Ver encuestas más antiguas",
              exact: true,
            }),
          ).toHaveCount(0);
          localCommunityFixture(`
          insert into public.polls(community_id,question,type,category,results_visibility,closes_at,created_at)
          select c.id,'Encuesta ${suffix} extra','binary','ambiente','after_close',timestamptz '2092-01-01 00:00:00+00',timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug='${slug}';
        `);
          await page.reload();
          const first = await cards.allTextContents();
          await page
            .getByRole("link", {
              name: "Ver encuestas más antiguas",
              exact: true,
            })
            .click();
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("categoria") === "ambiente" &&
              url.searchParams.has("antes") &&
              url.searchParams.has("id"),
          );
          await expect(cards).toHaveCount(1);
          expect(
            new Set([...first, ...(await cards.allTextContents())]).size,
          ).toBe(21);
          await expect(
            page.getByRole("link", {
              name: "Ver encuestas más antiguas",
              exact: true,
            }),
          ).toHaveCount(0);
          await page
            .getByRole("link", { name: "← Volver al principio", exact: true })
            .click();
          await expect(cards).toHaveCount(20);
          await expect(page).toHaveURL(
            (url) =>
              url.searchParams.get("categoria") === "ambiente" &&
              !url.searchParams.has("antes"),
          );
          await page.goto(
            `${path}?categoria=ambiente&antes=2020-01-01T00%3A00%3A00Z&id=00000000-0000-4000-8000-000000000001`,
          );
          await expect(
            page.getByRole("heading", {
              name: "Llegaste al final de las encuestas.",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("heading", {
              name: /Nadie preguntó nada|No hay encuestas de Ambiente/,
            }),
          ).toHaveCount(0);
          await page
            .getByRole("link", { name: "← Volver al principio", exact: true })
            .click();
          await expect(cards).toHaveCount(20);
          const categories = page.getByRole("navigation", {
            name: "Filtrar encuestas por categoría",
            exact: true,
          });
          await expect(
            // D125: el ícono es SVG decorativo y el Chip marca aria-current="page".
            categories.getByRole("link", { name: "Ambiente", exact: true }),
          ).toHaveAttribute("aria-current", "page");
          await categories
            .getByRole("link", { name: "Salud", exact: true })
            .click();
          await expect(cards).toHaveCount(1);
          await expect(cards.first()).toContainText(`Encuesta ${suffix} salud`);
        } finally {
          localCommunityFixture(
            `delete from public.communities where slug='${slug}';`,
          );
        }
      });
    },
  );
}

test("las herramientas comunitarias conservan su destino activo sin activar Info", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/mapa/");
  const tools = page.getByRole("navigation", {
    name: "Herramientas de la comunidad",
    exact: true,
  });
  const sections = page.getByRole("navigation", {
    name: "Secciones de la comunidad",
    exact: true,
  });
  for (const [segment, label] of [
    ["mapa", "Mapa barrial"],
    ["victorias", "Victorias"],
    ["rendicion", "Rendición"],
    ["instituciones", "Instituciones"],
  ]) {
    await tools.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/c/mar-del-plata/${segment}/?$`));
    await expect(
      tools.getByRole("link", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(tools.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(
      sections.getByRole("link", { name: /^Info/ }),
    ).not.toHaveAttribute("aria-current");
  }
  await sections.getByRole("link", { name: /^Info/ }).click();
  await expect(sections.getByRole("link", { name: /^Info/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(tools).toHaveCount(0);
});

test("Más agrupa las secciones secundarias y Comparar reúne contraste y comparativa", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const sections = page.getByRole("navigation", {
    name: "Secciones de la comunidad",
    exact: true,
  });
  const more = sections.locator("details[data-community-more]");
  // D126: la sección abierta desde Más se marca como una pestaña del carril.
  const railCurrent = sections.locator(
    '[data-tabs-fade] a[aria-current="page"]',
  );
  const views = page.getByRole("navigation", {
    name: "Formas de comparar",
    exact: true,
  });

  // Mar del Plata no tiene sub-comunidades: Comparar va a sus pares.
  await page.goto("/c/mar-del-plata/");
  await expect(more).not.toHaveAttribute("open");
  await more.locator("summary").click();
  await more.getByRole("link", { name: /Comparar/ }).click();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/comparativa\/?$/);
  await expect(more).not.toHaveAttribute("open");
  await expect(railCurrent).toContainText("Comparar");
  // A 390 px el carril se desplaza solo hasta la pestaña promovida: antes la
  // sección se leía en el botón de Más, siempre a la vista.
  await expect(railCurrent).toBeInViewport();
  await expect(more.locator("summary")).not.toContainText("Comparar");
  await expect(sections.locator('a[aria-current="page"]')).toHaveCount(1);
  await expect(views).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // Argentina tiene provincias: Comparar abre el contraste y ofrece la otra vista.
  await page.goto("/c/argentina/");
  await more.locator("summary").click();
  await expect(more).toHaveAttribute("open");
  await page.keyboard.press("Escape");
  await expect(more).not.toHaveAttribute("open");
  await more.locator("summary").click();
  await more.getByRole("link", { name: /Comparar/ }).click();
  await expect(page).toHaveURL(/\/c\/argentina\/contraste\/?$/);
  await expect(views.getByRole("link")).toHaveCount(2);
  await views
    .getByRole("link", { name: "Con comunidades del mismo nivel" })
    .click();
  await expect(page).toHaveURL(/\/c\/argentina\/comparativa\/?$/);
  await expect(railCurrent).toContainText("Comparar");
});

const communityHeader = (page: Page) =>
  page.locator("[data-community-page] > header");
const communitySections = (page: Page) =>
  page.getByRole("navigation", {
    name: "Secciones de la comunidad",
    exact: true,
  });
const communityChain = (page: Page) =>
  page.getByRole("navigation", { name: "Cadena de comunidades", exact: true });

/** Sin deslizar se ve el formulario, y su primer campo se puede tocar. */
async function expectFormStartsAtFirstField(
  page: Page,
  form: { title: string; field: string; section: string },
) {
  await expect(
    page.getByRole("heading", { level: 1, name: form.title, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(communityChain(page)).toHaveCount(1);
  await expect(communityHeader(page)).toHaveCount(0);
  // D79: la sección sigue marcada mientras se crea.
  await expect(
    communitySections(page).locator('[aria-current="page"]'),
  ).toContainText(form.section);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const field = page.locator(form.field);
  await expect(field).toBeInViewport({ ratio: 1 });
  // El viewport incluye lo que tapan las pestañas y la barra inferior del
  // teléfono: lo que importa es que un toque en el campo dé en el campo.
  await expect
    .poll(() =>
      field.evaluate((element) => {
        const { left, top, width, height } = element.getBoundingClientRect();
        return (
          document.elementFromPoint(left + width / 2, top + height / 2) ===
          element
        );
      }),
    )
    .toBe(true);
}

// Mar del Plata no tiene hijas y un debate sin columnas no se puede crear: el
// debate va en Buenos Aires, que también es parte de la residencia de la cuenta.
const CREATION_FORMS = [
  {
    path: "/c/mar-del-plata/reclamos/nuevo/",
    title: "Nuevo reclamo",
    field: 'input[name="title"]',
    section: "Reclamos",
  },
  {
    path: "/c/mar-del-plata/encuestas/nueva/",
    title: "Nueva encuesta",
    field: '[name="question"]',
    section: "Encuestas",
  },
  {
    path: "/c/buenos-aires/debates/nuevo/",
    title: "Nuevo debate",
    field: 'input[name="title"]',
    section: "Debates",
  },
  {
    path: "/c/mar-del-plata/proyectos/nuevo/",
    title: "Nuevo proyecto",
    field: 'input[name="title"]',
    section: "Proyectos",
  },
];

test("cada formulario de publicar arranca en su primer campo, con un solo título y una sola miga", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInTestAccount(page, "sofia@agorbis.test", CREATION_FORMS[0].path);
  for (const form of CREATION_FORMS) {
    await page.goto(form.path);
    await expectFormStartsAtFirstField(page, form);
    // El HTML del servidor ya viene así: tampoco hay dos títulos sin JavaScript.
    const html = await (await page.request.get(form.path)).text();
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(CREATION_FORMS[0].path);
  await expectFormStartsAtFirstField(page, CREATION_FORMS[0]);
});

test("navegar entre secciones no desengancha del documento el contenido de la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/");
  const sections = communitySections(page);
  await expect(sections).toBeVisible();
  // Un nodo que sale del documento y vuelve pierde el scroll de sus filas, el
  // foco y las animaciones en curso. El layout raíz se redibujaba al empezar y
  // al terminar cada navegación y reinsertaba todo el contenido de `<main>`:
  // la pestaña recién centrada en el carril volvía al principio.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) throw new Error("sin <main>");
    const state = { detached: 0 };
    (window as unknown as { contentMoves: typeof state }).contentMoves = state;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (
            node instanceof Element &&
            (node.matches("[data-community-page]") ||
              node.querySelector("[data-community-page]"))
          ) {
            state.detached += 1;
          }
        }
      }
    }).observe(main, { childList: true, subtree: true });
  });

  await sections.getByRole("link", { name: /^Encuestas/ }).click();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/encuestas\/?$/);
  await expect(
    sections.locator('[aria-current="page"]'),
  ).toContainText("Encuestas");
  // El anuncio del título llega cuando la navegación terminó del todo.
  await expect(page.getByRole("status").first()).toContainText("Encuestas");

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { contentMoves: { detached: number } })
          .contentMoves.detached,
    ),
  ).toBe(0);
});

test("un filtro aplicado centra su chip en la fila sin bajar la página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // Con sesión la cabecera es más baja y la fila queda a la vista al cargar.
  await signInTestAccount(
    page,
    "sofia@agorbis.test",
    "/c/mar-del-plata/reclamos/?categoria=otro",
  );
  const chips = page.getByRole("navigation", {
    name: "Filtrar reclamos por categoría",
    exact: true,
  });
  // La fila ya se deslizó hasta el chip aplicado: quedó entero entre sus
  // bordes. Sólo en horizontal: si la fila se ve o no depende del alto.
  await expect
    .poll(() =>
      chips.evaluate((row) => {
        const chip = row.querySelector("[aria-current]");
        if (!chip || row.scrollLeft <= 0) return false;
        const rowBox = row.getBoundingClientRect();
        const chipBox = chip.getBoundingClientRect();
        return chipBox.left >= rowBox.left && chipBox.right <= rowBox.right;
      }),
    )
    .toBe(true);
  // `scrollIntoView` además bajaba la página entre 53 y 81 px: la fila es
  // pegajosa y el `scroll-padding` la daba por tapada.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("el layout sigue montado: la cabecera se va al llegar al formulario y vuelve con Atrás", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const listPath = "/c/mar-del-plata/reclamos/";
  const form = CREATION_FORMS[0];
  await signInTestAccount(page, "sofia@agorbis.test", listPath);
  await expect(communityHeader(page)).toBeVisible();

  // Una recarga borraría esta marca: acá se prueba la navegación interna.
  await page.evaluate(() => {
    (window as unknown as { sinRecarga: boolean }).sinRecarga = true;
  });
  const sinRecarga = () =>
    page.evaluate(
      () => (window as unknown as { sinRecarga?: boolean }).sinRecarga,
    );

  const expectList = async () => {
    await expect(page).toHaveURL(/\/c\/mar-del-plata\/reclamos\/?$/);
    await expect(communityHeader(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Mar del Plata",
    );
    await expect(communityChain(page)).toHaveCount(1);
    await expect(
      communitySections(page).locator('[aria-current="page"]'),
    ).toContainText("Reclamos");
    // El contenido de la ruta llega por el mismo `Slot`, sin repetirse.
    await expect(page.locator("#listado-reclamos")).toHaveCount(1);
    await expect(page.locator(form.field)).toHaveCount(0);
  };

  const openForm = () =>
    page.locator('main a[href="/c/mar-del-plata/reclamos/nuevo"]').first().click();

  await openForm();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/reclamos\/nuevo\/?$/);
  await expectFormStartsAtFirstField(page, form);
  await expect(page.locator(form.field)).toHaveCount(1);
  await expect(page.locator("#listado-reclamos")).toHaveCount(0);

  await page.goBack();
  await expectList();

  await page.goForward();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/reclamos\/nuevo\/?$/);
  await expectFormStartsAtFirstField(page, form);

  // Salir por la pestaña también devuelve la cabecera.
  await communitySections(page).getByRole("link", { name: /^Reclamos/ }).click();
  await expectList();

  // Cambiar de nivel cambia la comunidad con el layout montado: la cabecera no
  // reaparece y las pestañas pasan a la comunidad nueva.
  await openForm();
  await expectFormStartsAtFirstField(page, form);
  await page.getByRole("button", { name: "Cambiar nivel", exact: true }).click();
  await page.locator('#selector-nivel a[href*="/c/buenos-aires/"]').click();
  await expect(page).toHaveURL(/\/c\/buenos-aires\/reclamos\/nuevo\/?$/);
  await expect(
    communitySections(page).getByRole("link", { name: /^Reclamos/ }),
  ).toHaveAttribute("href", "/c/buenos-aires/reclamos");
  await expectFormStartsAtFirstField(page, form);
  expect(await sinRecarga()).toBe(true);

  // Abrir el formulario directo reanuda el HTML del servidor, que no tiene el
  // lugar de la cabecera: salir de ahí es otro camino para el mismo `Slot`.
  await page.goto(form.path);
  await expectFormStartsAtFirstField(page, form);
  await communitySections(page).getByRole("link", { name: /^Reclamos/ }).click();
  await expectList();
  await page.goBack();
  await expectFormStartsAtFirstField(page, form);
});

test("las secciones de la comunidad conservan su cabecera y sus pestañas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/reclamos/");
  await expect(communityHeader(page)).toBeVisible();
  await expect(communityHeader(page)).toContainText("Mar del Plata");
  // Sin sesión el único llamado es crear la cuenta; invitar es de quien vive
  // acá (décima ronda, mejora 1).
  await expect(
    communityHeader(page).getByRole("link", { name: "Crear cuenta" }),
  ).toBeVisible();
  await expect(
    communityHeader(page).getByRole("link", {
      name: "Invitar vecinos por WhatsApp",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Mar del Plata",
  );
  await expect(communityChain(page)).toHaveCount(1);
  await expect(
    communitySections(page).locator('[aria-current="page"]'),
  ).toContainText("Reclamos");
});
