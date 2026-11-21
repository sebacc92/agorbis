import { expect, test, type Page } from "@playwright/test";
import {
  localAccountAdmin,
  signInTestAccount,
} from "./account-followup-fixtures";

const residentId = "33333333-3333-4333-8333-333333333333";

interface CreationForm {
  name: string;
  path: string;
  formTitle: string;
  reviewTitle: string;
  publish: string;
  fill: (page: Page) => Promise<void>;
}

const CREATION_FORMS: CreationForm[] = [
  {
    name: "reclamo",
    path: "/c/mar-del-plata/reclamos/nuevo/",
    formTitle: "Nuevo reclamo",
    reviewTitle: "Confirmá tu reclamo",
    publish: "Publicar reclamo",
    fill: async (page) => {
      await page.locator('input[name="title"]').fill("Luminaria apagada");
      await page
        .locator('textarea[name="description"]')
        .fill("La luminaria de la esquina lleva una semana apagada.");
    },
  },
  {
    name: "debate",
    path: "/c/buenos-aires/debates/nuevo/",
    formTitle: "Nuevo debate",
    reviewTitle: "Confirmá tu debate",
    publish: "Abrir debate",
    fill: async (page) => {
      await page
        .locator('input[name="title"]')
        .fill("¿Cómo repartimos las obras de la provincia?");
      await page
        .locator('textarea[name="body"]')
        .fill("Un planteo abierto para que cada municipio cuente su prioridad.");
    },
  },
  {
    name: "encuesta",
    path: "/c/mar-del-plata/encuestas/nueva/",
    formTitle: "Nueva encuesta",
    reviewTitle: "Confirmá tu encuesta",
    publish: "Publicar encuesta",
    fill: async (page) => {
      await page
        .locator('input[name="question"]')
        .fill("¿Qué plaza renovamos primero?");
      await page.locator('input[name="options[]"]').nth(0).fill("Plaza norte");
      await page.locator('input[name="options[]"]').nth(1).fill("Plaza sur");
    },
  },
  {
    name: "proyecto",
    path: "/c/mar-del-plata/proyectos/nuevo/",
    formTitle: "Nuevo proyecto",
    reviewTitle: "Confirmá tu proyecto",
    publish: "Publicar proyecto",
    fill: async (page) => {
      await page.locator('input[name="title"]').fill("Bicicleteros escolares");
      await page
        .locator('textarea[name="summary"]')
        .fill("Un espacio seguro para las bicicletas en cada escuela.");
      await page
        .getByRole("button", { name: "Seguir con el plan", exact: true })
        .click();
      await page
        .locator('textarea[name="plan"]')
        .fill("Relevar escuelas y construir los bicicleteros por etapas.");
      await page
        .getByRole("button", {
          name: "Seguir con el presupuesto",
          exact: true,
        })
        .click();
    },
  },
];

const heading = (page: Page, name: string) =>
  page.getByRole("heading", { level: 1, name, exact: true });

// La del layout es la primera del documento: va antes del encabezado.
const routeAnnouncer = (page: Page) =>
  page.locator('span.sr-only[role="status"][aria-live="polite"]').first();

/** Quien revisa tiene que ver el título, no adivinarlo debajo de las barras. */
async function expectRevealed(page: Page, name: string) {
  const title = heading(page, name);
  await expect(title).toBeInViewport();
  await expect(title).toBeFocused();
  // `toBeInViewport` da por bueno un título tapado por las barras fijas.
  await expect
    .poll(() =>
      title.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.left + 8, box.top + box.height / 2),
        );
      }),
    )
    .toBe(true);
}

/**
 * Lo que hace el layout raíz cuando se redibuja: retirar la página y volver a
 * insertarla. Depende de que baje un chunk, así que acá se fuerza la versión
 * tardía, después de que el título ya recibió el foco.
 */
async function reinsertPage(page: Page) {
  await page.locator("[data-community-page]").evaluate((element) => {
    element.parentElement?.insertBefore(element, element.nextSibling);
  });
}

/** El redibujado de los loaders (D99) no puede devolver el foco al `body`. */
async function expectStillRevealed(page: Page, name: string) {
  await page.waitForTimeout(1_000);
  await expectRevealed(page, name);
}

async function expectUntouchedLoad(page: Page, form: CreationForm) {
  await expect(heading(page, form.formTitle)).toBeVisible();
  await page.waitForTimeout(1_500);
  expect(
    await page.evaluate(() => ({
      focus: document.activeElement?.tagName,
      scroll: window.scrollY,
    })),
  ).toEqual({ focus: "BODY", scroll: 0 });
}

async function review(page: Page, form: CreationForm) {
  await form.fill(page);
  await page
    .getByRole("button", { name: "Revisar antes de publicar", exact: true })
    .click();
  await expect(heading(page, form.reviewTitle)).toBeVisible();
}

test.describe("al revisar se ve la revisión y el foco la acompaña", () => {
  test.beforeEach(({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
  });

  for (const form of CREATION_FORMS) {
    test(`${form.name}: Revisar y Volver a editar a 390 px`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await signInTestAccount(page, "sofia@agorbis.test", form.path);
      await expectUntouchedLoad(page, form);

      await review(page, form);
      await expectRevealed(page, form.reviewTitle);
      await expectStillRevealed(page, form.reviewTitle);

      // A 390 px el botón queda debajo de la barra inferior: se llega bajando,
      // y al llegar nada lo tapa (el clic de prueba exige recibir el toque).
      const publish = page.getByRole("button", {
        name: form.publish,
        exact: true,
      });
      await publish.scrollIntoViewIfNeeded();
      await expect(publish).toBeInViewport();
      await publish.click({ trial: true });

      await page
        .getByRole("link", { name: "Volver a editar", exact: true })
        .click();
      await expectRevealed(page, form.formTitle);
      await expectStillRevealed(page, form.formTitle);

      // Un borrador recuperado al cargar tampoco mueve nada. En otra pestaña:
      // al recargar o repetir la URL, el navegador restaura el scroll por su cuenta.
      const fresh = await page.context().newPage();
      await fresh.goto(form.path);
      await expectUntouchedLoad(fresh, form);
      await fresh.close();
    });
  }

  test("también a 1920 px y sin animar: el html pide scroll suave", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const [form] = CREATION_FORMS;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await signInTestAccount(page, "sofia@agorbis.test", form.path);
    await expectUntouchedLoad(page, form);
    await page.evaluate(() => {
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = function (options) {
        if (typeof options === "object")
          document.documentElement.dataset.revealScroll = options.behavior;
        original.call(this, options);
      };
    });

    await review(page, form);
    await expectRevealed(page, form.reviewTitle);
    await expect(page.locator("html")).toHaveAttribute(
      "data-reveal-scroll",
      "instant",
    );
    await reinsertPage(page);
    await expectRevealed(page, form.reviewTitle);
    await expect(
      page.getByRole("button", { name: form.publish, exact: true }),
    ).toBeInViewport();

    await page
      .getByRole("link", { name: "Volver a editar", exact: true })
      .click();
    await expectRevealed(page, form.formTitle);
  });

  test("la región viva calla después de una acción y anuncia las navegaciones", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const [form] = CREATION_FORMS;
    const title = `Anuncio E2E ${crypto.randomUUID()}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await signInTestAccount(page, "sofia@agorbis.test", form.path);
    await expect(routeAnnouncer(page)).toHaveText("Nuevo reclamo · Agorbis");

    try {
      // Revisar no cambia de ruta: decir "Nuevo reclamo" contradiría la pantalla.
      await page.locator('input[name="title"]').fill(title);
      await page
        .locator('textarea[name="description"]')
        .fill("Un reclamo real para comprobar el anuncio al publicar.");
      await page
        .getByRole("button", { name: "Revisar antes de publicar", exact: true })
        .click();
      await expectRevealed(page, form.reviewTitle);
      await expect(routeAnnouncer(page)).toBeEmpty();

      // Otra acción sobre la misma ruta tampoco repite el título.
      await page
        .getByRole("link", { name: "Volver a editar", exact: true })
        .click();
      await expectRevealed(page, form.formTitle);
      await expect(routeAnnouncer(page)).toBeEmpty();

      // Un enlace sí llega a otra página, también de vuelta con Atrás.
      await page.locator('header a[href="/inicio"]').first().click();
      await expect(page).toHaveURL(/\/inicio\/?$/);
      await expect(routeAnnouncer(page)).toHaveText("Mi inicio · Agorbis");

      await page.goBack();
      await expect(page).toHaveURL(/\/reclamos\/nuevo\/?$/);
      await expect(routeAnnouncer(page)).toHaveText("Nuevo reclamo · Agorbis");

      // Publicar termina en otra ruta: se anuncia el destino, no el silencio.
      await page
        .getByRole("button", { name: "Revisar antes de publicar", exact: true })
        .click();
      await page
        .getByRole("button", { name: form.publish, exact: true })
        .click();
      await expect(page).toHaveURL(/\/reclamos\/[0-9a-f-]{36}\/?\?publicado=1$/);
      await expect(routeAnnouncer(page)).toContainText(title);
    } finally {
      const { error } = await localAccountAdmin()
        .from("claims")
        .delete()
        .eq("author_id", residentId)
        .eq("title", title);
      expect(error, "limpieza de la publicación E2E local").toBeNull();
    }
  });
});

// Un filtro no cambia de ruta, pero sí de contenido. Si la región callara, quien usa
// lector de pantalla oiría "Cargando página…" y nunca se enteraría de que terminó.
test("la región viva avisa que terminó un filtro", async ({ page }) => {
  const listTitle = "Reclamos de Mar del Plata · Agorbis";
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/reclamos/");
  await expect(routeAnnouncer(page)).toHaveText(listTitle);
  const statusFilters = page.getByRole("navigation", {
    name: "Filtrar por estado",
    exact: true,
  });

  // Con la máquina cargada, el primer clic puede terminar sin dibujar "Cargando
  // página…". El registro exacto va en el segundo, que tampoco parte del valor de carga.
  await statusFilters
    .getByRole("link", { name: "📣 En curso", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reclamos\/?\?(?:.*&)?estado=abiertos/);
  await expect(routeAnnouncer(page)).toHaveText(listTitle);

  // Mirar la región al final no alcanza: el título sigue ahí hasta que la navegación
  // la cambia. Se registra cada anuncio; una recarga borraría este registro.
  await page.evaluate(() => {
    const announcements: string[] = [];
    (window as unknown as { announcements: string[] }).announcements =
      announcements;
    new MutationObserver(() => {
      const text =
        document.querySelector('span.sr-only[role="status"][aria-live="polite"]')
          ?.textContent ?? "";
      if (announcements.at(-1) !== text) announcements.push(text);
    }).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  await statusFilters
    .getByRole("link", { name: "🏆 Victorias", exact: true })
    .click();
  await expect(page).toHaveURL(/\/reclamos\/?\?(?:.*&)?estado=resueltos/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { announcements: string[] }
        ).announcements.slice(-2),
      ),
    )
    .toEqual(["Cargando página…", listTitle]);
});
