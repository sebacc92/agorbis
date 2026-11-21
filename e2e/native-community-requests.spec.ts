import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

async function login(page: Page) {
  await page.goto("/ingresar/?next=%2Fperfil");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/?$/);
}

for (const javaScriptEnabled of [true, false]) {
  test(`territorio GET conserva lo editado y elige un slug comprobado (${javaScriptEnabled ? "JS" : "HTML"})`, async ({
    browser,
    baseURL,
  }) => {
    const prefix = `Territorio ${crypto.randomUUID()}`;
    try {
      localCommunityFixture(
        `insert into public.claims(community_id,title,description,category) select id,'${prefix} local','Búsqueda territorial de regresión.','otro' from public.communities where slug='mar-del-plata' union all select id,'${prefix} global','Fuera del territorio elegido.','otro' from public.communities where slug='earth';`,
      );
      const context = await browser.newContext({ baseURL, javaScriptEnabled });
      try {
        const page = await context.newPage();
        await page.goto(
          "/buscar/?q=salud&tipo=claim&estado=open&orden=recientes",
        );
        await page
          .getByRole("searchbox", { name: "Buscar en Agorbis", exact: true })
          .fill(prefix);
        await page
          .getByRole("button", { name: "Elegir territorio", exact: true })
          .click();
        await expect(page).toHaveURL(
          (url) =>
            url.pathname === "/buscar/territorios/" &&
            url.searchParams.get("q") === prefix &&
            url.searchParams.get("tipo") === "claim" &&
            url.searchParams.get("estado") === "open" &&
            url.searchParams.get("orden") === "recientes",
        );
        await page
          .getByRole("searchbox", {
            name: "Nombre del territorio",
            exact: true,
          })
          .fill("Mar del Plata");
        await page
          .getByRole("button", { name: "Buscar territorio", exact: true })
          .click();
        await page
          .getByRole("list", { name: "Territorios encontrados", exact: true })
          .getByRole("link", { name: /Mar del Plata/ })
          .click();
        await expect(page).toHaveURL(
          (url) =>
            url.searchParams.get("q") === prefix &&
            url.searchParams.get("comunidad") === "mar-del-plata" &&
            url.searchParams.get("tipo") === "claim" &&
            url.searchParams.get("estado") === "open" &&
            url.searchParams.get("orden") === "recientes" &&
            !url.searchParams.has("pagina"),
        );
        await expect(
          page
            .getByRole("link", { name: new RegExp(`${prefix} local`) })
            .first(),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: new RegExp(`${prefix} global`) }),
        ).toHaveCount(0);
        const invalid = await page.goto(
          "/buscar/?q=salud&comunidad=territorio-que-no-existe",
        );
        expect(invalid?.status()).toBe(404);
      } finally {
        await context.close();
      }
    } finally {
      localCommunityFixture(
        `delete from public.claims where title like '${prefix}%';`,
      );
    }
  });

  test(`solicitudes confirman filas propias, conservan rechazos y limpian sólo el envío aceptado (${javaScriptEnabled ? "JS" : "HTML"})`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    const prefix = `Solicitud ${crypto.randomUUID()}`;
    const organization = `${prefix} institución`;
    const community = `${prefix} barrio`;
    let release = () => {};
    try {
      await login(page);
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled,
        storageState: await page.context().storageState(),
      });
      try {
        const current = await context.newPage();
        await current.goto("/instituciones/solicitar/");
        await current
          .getByRole("textbox", { name: "Nombre oficial", exact: true })
          .fill(organization);
        await current
          .getByRole("combobox", { name: "Tipo", exact: true })
          .selectOption("ngo");
        await current
          .getByLabel("CUIT / Identificador", { exact: true })
          .fill("30123456789");
        await current
          .getByLabel("Teléfono de contacto", { exact: true })
          .fill("1123456789");
        const explanation = current.getByRole("textbox", {
          name: "Explicá tu rol y cómo podemos verificarlo",
          exact: true,
        });
        await explanation.fill("a".repeat(1995));
        await current
          .getByRole("button", { name: "Solicitar verificación", exact: true })
          .click();
        await expect(
          current.getByText(
            "La explicación y los datos de contacto deben sumar hasta 2000 caracteres.",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(explanation).toHaveValue("a".repeat(1995));
        await expect(
          current.getByLabel("CUIT / Identificador", { exact: true }),
        ).toHaveValue(/30-?12345678-?9/);
        await expect(
          current.getByLabel("Teléfono de contacto", { exact: true }),
        ).not.toHaveValue("");
        await expect(
          current.getByRole("combobox", { name: "Tipo", exact: true }),
        ).toHaveValue("ngo");
        const acceptedMessage =
          "Represento a esta organización y ofrezco evidencia para comprobarlo.";
        await explanation.fill(acceptedMessage);
        let responseReceived: Promise<void> | undefined;
        if (javaScriptEnabled) {
          let received = () => {};
          responseReceived = new Promise<void>((resolve) => {
            received = resolve;
          });
          const held = new Promise<void>((resolve) => {
            release = resolve;
          });
          await current.route(
            (url) => url.searchParams.has("qaction"),
            async (route) => {
              if (route.request().method() !== "POST") return route.continue();
              const response = await route.fetch();
              received();
              await held;
              await route.fulfill({ response });
            },
          );
        }
        const send = current
          .getByRole("button", { name: "Solicitar verificación", exact: true })
          .click();
        if (javaScriptEnabled) {
          await responseReceived;
          await current
            .getByRole("textbox", { name: "Nombre oficial", exact: true })
            .fill(`${prefix} siguiente`);
          await explanation.fill(
            "Este texto pertenece al siguiente borrador y debe conservarse.",
          );
          release();
        }
        await send;
        await expect(
          current
            .locator('li[id^="request-"]')
            .filter({ hasText: organization }),
        ).toHaveCount(1);
        await expect(
          current.getByText(
            `Solicitud “${organization}” enviada para revisión.`,
            { exact: false },
          ),
        ).toBeVisible();
        if (javaScriptEnabled) {
          await expect(
            current.getByRole("textbox", {
              name: "Nombre oficial",
              exact: true,
            }),
          ).toHaveValue(`${prefix} siguiente`);
          await expect(explanation).toHaveValue(
            "Este texto pertenece al siguiente borrador y debe conservarse.",
          );
          await current.unrouteAll();
        } else {
          await expect(
            current.getByRole("textbox", {
              name: "Nombre oficial",
              exact: true,
            }),
          ).toHaveValue("");
          await expect(explanation).toHaveValue("");
          await current.reload();
          await expect(
            current
              .locator('li[id^="request-"]')
              .filter({ hasText: organization }),
          ).toHaveCount(1);
          expect(
            localCommunityFixture(
              `copy (select count(*) from public.organization_requests where name='${organization}') to stdout;`,
            ).trim(),
          ).toBe("1");
        }
        const saved = localCommunityFixture(
          `copy (select message from public.organization_requests where name='${organization}') to stdout;`,
        );
        expect(saved).toContain(acceptedMessage);
        expect(saved).toContain("CUIT: 30-12345678-9");
        expect(saved).toContain("Tel:");
        expect(saved.split("Contacto institucional")).toHaveLength(2);
        await current.goto("/comunidades/solicitar/");
        await current
          .getByRole("textbox", { name: "Nombre oficial", exact: true })
          .fill(community);
        await current
          .getByRole("textbox", { name: "País", exact: true })
          .fill("Argentina");
        await current
          .getByRole("combobox", { name: "Nivel", exact: true })
          .selectOption("neighborhood");
        const reason = current.getByRole("textbox", {
          name: "¿Por qué debería incorporarse?",
          exact: true,
        });
        await reason.fill(
          "Nuestro barrio tiene registros oficiales y vecinos interesados en participar.",
        );
        if (javaScriptEnabled) {
          await current
            .getByRole("combobox", { name: "Comunidad superior", exact: true })
            .fill("Mar del Plata");
          await current
            .getByRole("option", { name: /Mar del Plata/ })
            .first()
            .click();
        } else {
          await current
            .locator('input[name="parent_slug"]')
            .fill("padre-que-no-existe");
          await current
            .getByRole("button", { name: "Enviar solicitud", exact: true })
            .click();
          await expect(
            current.getByText(
              "No encontramos la comunidad superior indicada.",
              { exact: true },
            ),
          ).toBeVisible();
          await expect(reason).toHaveValue(
            "Nuestro barrio tiene registros oficiales y vecinos interesados en participar.",
          );
          await expect(
            current.getByRole("combobox", { name: "Nivel", exact: true }),
          ).toHaveValue("neighborhood");
          await current
            .locator('input[name="parent_slug"]')
            .fill("mar-del-plata");
        }
        await current
          .getByRole("button", { name: "Enviar solicitud", exact: true })
          .click();
        await expect(
          current.locator('li[id^="request-"]').filter({ hasText: community }),
        ).toHaveCount(1);
        await expect(
          current.getByRole("textbox", { name: "Nombre oficial", exact: true }),
        ).toHaveValue("");
        await expect(reason).toHaveValue("");
        if (!javaScriptEnabled) {
          await current.reload();
          await expect(
            current
              .locator('li[id^="request-"]')
              .filter({ hasText: community }),
          ).toHaveCount(1);
        }
        await current
          .getByRole("button", { name: "Enviar solicitud", exact: true })
          .click();
        await expect(
          current.getByRole("textbox", { name: "Nombre oficial", exact: true }),
        ).toBeFocused();
        expect(
          localCommunityFixture(
            `copy (select count(*) from public.community_requests where requested_name='${community}') to stdout;`,
          ).trim(),
        ).toBe("1");
      } finally {
        release();
        await context.close();
      }
    } finally {
      localCommunityFixture(
        `delete from public.organization_requests where name like '${prefix}%'; delete from public.community_requests where requested_name like '${prefix}%';`,
      );
    }
  });
}

test("las métricas abiertas excluyen rechazados y la comparativa no atribuye residencia ni actividad", async ({
  browser,
  baseURL,
}) => {
  const slug = `estados-${crypto.randomUUID()}`;
  try {
    localCommunityFixture(
      `insert into public.communities(slug,name,level,parent_id,path) select '${slug}','Barrio de estados',4,id,path || '.${slug}' from public.communities where slug='buenos-aires'; insert into public.claims(community_id,title,description,category,status) select c.id,'Reclamo ' || s,'Estados de reclamos para la regresión.','otro',s from public.communities c cross join unnest(array['open','under_review','acknowledged','in_progress','resolved','rejected','removed']) s where c.slug='${slug}';`,
    );
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ baseURL, javaScriptEnabled });
      try {
        const current = await context.newPage();
        await current.goto(`/c/${slug}/`);
        const active = current.locator(
          `a[href="/c/${slug}/reclamos?estado=abiertos"]`,
        );
        // D119 achicó el número en teléfono (text-xl, sm:text-2xl): se busca
        // por el número tabular, no por el tamaño.
        await expect(active.locator("p.tabular-nums")).toHaveText("4");
        await current.goto(`/c/${slug}/comparativa/`);
        await expect(
          current.getByText("Comunidad consultada", { exact: true }),
        ).toBeVisible();
        await expect(
          current.getByText("Tu comunidad", { exact: true }),
        ).toHaveCount(0);
        await expect(
          current.getByText("Vecinos Activos", { exact: true }),
        ).toHaveCount(0);
        await expect(
          current.getByText("Personas miembro", { exact: true }).first(),
        ).toBeVisible();
      } finally {
        await context.close();
      }
    }
  } finally {
    localCommunityFixture(
      `delete from public.claims where community_id=(select id from public.communities where slug='${slug}'); delete from public.communities where slug='${slug}';`,
    );
  }
});

test("la difusión inglesa copia su vista previa y la bienvenida describe capacidades reales", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          Reflect.set(window, "lastCommunityCopy", text);
        },
      },
    });
  });
  await page.goto("/c/mar-del-plata/?lang=en");
  await page.getByText("More tools", { exact: true }).click();
  const outreach = page.getByRole("button", {
    name: /Neighborhood Outreach and Press Kit/,
  });
  await outreach.click();
  const kit = page.locator("[data-community-tools]").locator("p.font-mono");
  await expect(kit).toContainText("Hello neighbors of Mar del Plata");
  const invitation = await kit.innerText();
  await page.getByRole("button", { name: /Copy WhatsApp message$/ }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "lastCommunityCopy")))
    .toBe(invitation);
  await page.getByRole("button", { name: /Institutional signature/ }).click();
  const signature = await page
    .locator("[data-community-tools] pre")
    .innerText();
  expect(signature).toContain("Mar del Plata on Agorbis");
  await page.getByRole("button", { name: /Copy email signature$/ }).click();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(window, "lastCommunityCopy")))
    .toBe(signature);
  await page.goto("/c/mar-del-plata/?lang=es");
  await page.getByText("Más herramientas", { exact: true }).click();
  await page
    .getByRole("button", { name: "Abrir guía de bienvenida", exact: true })
    .click();
  const guide = page.getByRole("dialog", {
    name: "¡Te damos la bienvenida a Mar del Plata!",
    exact: true,
  });
  await expect(guide).toContainText(
    "reclamos de la comunidad con ubicación aproximada",
  );
  await guide
    .getByRole("button", { name: "Ver siguiente paso", exact: true })
    .click();
  await expect(guide).toContainText(
    "no garantizan una respuesta de las autoridades",
  );
  await guide
    .getByRole("button", { name: "Ver siguiente paso", exact: true })
    .click();
  await expect(guide).toContainText("Si hay una ronda de presupuesto");
});
