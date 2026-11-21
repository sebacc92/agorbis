import { expect, test, type Page } from "@playwright/test";

const formPath = "/c/mar-del-plata/proyectos/nuevo/";
const draftKey =
  "agorbis:draft:33333333-3333-4333-8333-333333333333:project:mar-del-plata";

async function openProject(page: Page, locale: "es" | "en" = "es") {
  test.setTimeout(60_000);
  const localUrl = process.env.PUBLIC_SUPABASE_URL;
  if (
    !localUrl ||
    !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)
  ) {
    throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  }
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`/ingresar/?next=${encodeURIComponent(formPath)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.locator('input[name="community_slug"]')).toHaveValue(
    "mar-del-plata",
  );
  if (locale === "en") await page.goto(`${formPath}?lang=en`);
  await expect(
    page.getByRole("heading", {
      name: locale === "es" ? "Nuevo proyecto" : "New project",
      exact: true,
    }),
  ).toBeVisible();
}

async function openBudget(page: Page, locale: "es" | "en") {
  await page
    .locator('input[name="title"]')
    .fill("Bicicleteros para las escuelas");
  await page
    .locator('textarea[name="summary"]')
    .fill("Un lugar seguro donde dejar las bicicletas.");
  await page
    .getByRole("button", {
      name: locale === "es" ? "Seguir con el plan" : "Continue to the plan",
      exact: true,
    })
    .click();
  await page
    .locator('textarea[name="plan"]')
    .fill("Relevar escuelas y colocar los bicicleteros.");
  await page
    .getByRole("button", {
      name:
        locale === "es"
          ? "Seguir con el presupuesto"
          : "Continue to the budget",
      exact: true,
    })
    .click();
}

for (const locale of ["es", "en"] as const) {
  test(`el presupuesto conserva texto y centavos al restaurar, revisar y volver a editar (${locale})`, async ({
    page,
  }) => {
    await openProject(page, locale);
    await openBudget(page, locale);
    const raw = locale === "es" ? "2.500,50" : "2,500.50";
    const display = locale === "es" ? /2\.500,50/ : /2,500\.50/;
    const input = page.locator('input[name="budget_amount"]');
    await expect(input).toHaveAttribute("inputmode", "decimal");
    await input.fill(raw);
    await page.locator('select[name="currency"]').selectOption("USD");
    await expect(input).toHaveValue(raw);
    await expect(page.locator("[data-budget-preview]")).toContainText(display);
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "{}").budget,
          draftKey,
        ),
      )
      .toBe(raw);
    await page.reload();
    await page
      .getByRole("button", {
        name:
          locale === "es" ? "Seguir con el plan" : "Continue to the plan",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name:
          locale === "es"
            ? "Seguir con el presupuesto"
            : "Continue to the budget",
        exact: true,
      })
      .click();
    await expect(input).toHaveValue(raw);
    const submitted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).searchParams.has("qaction"),
    );
    await page
      .getByRole("button", {
        name:
          locale === "es"
            ? "Revisar antes de publicar"
            : "Review before publishing",
        exact: true,
      })
      .click();
    const request = await submitted;
    expect(request.postData()).toContain("2500.50");
    expect(request.postData()).not.toContain(raw);
    await expect(
      page.getByRole("heading", {
        name: locale === "es" ? "Confirmá tu proyecto" : "Confirm your project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toHaveValue("2500.5");
    await expect(page.locator('input[name="budget_locale"]')).toHaveValue("en");
    await expect(page.locator("dd").filter({ hasText: display })).toHaveCount(
      1,
    );
    await page
      .getByRole("link", {
        name: locale === "es" ? "Volver a editar" : "Back to editing",
        exact: true,
      })
      .click();
    await expect(input).toHaveValue(raw);
    await input.fill("");
    await page
      .getByRole("button", {
        name:
          locale === "es"
            ? "Revisar antes de publicar"
            : "Review before publishing",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: locale === "es" ? "Confirmá tu proyecto" : "Confirm your project",
        exact: true,
      }),
    ).toBeVisible();
    await expect(input).toHaveValue("");
  });
}

test("un importe ambiguo conserva su texto y se corrige antes de enviar", async ({
  page,
}) => {
  await openProject(page);
  await openBudget(page, "es");
  const input = page.locator('input[name="budget_amount"]');
  await input.fill("2.50");
  await page
    .getByRole("button", { name: "Revisar antes de publicar", exact: true })
    .click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("2.50");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#budget-error")).toContainText("2.500,50");
  await input.fill("2.500,501");
  await page.locator('select[name="currency"]').selectOption("USD");
  await expect(page.locator("#budget-error")).toBeVisible();
  await input.fill("2.500,50");
  await page
    .getByRole("button", { name: "Revisar antes de publicar", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirmá tu proyecto", exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("2500.5");
});

test("el POST nativo interpreta notación local y acepta el importe vacío", async ({
  page,
}) => {
  await openProject(page);
  const action = await page
    .locator('input[name="community_slug"]')
    .locator("..")
    .getAttribute("action");
  expect(action).toBeTruthy();
  for (const raw of ["2.500,50", ""]) {
    const response = await page.request.post(
      new URL(action!, page.url()).href,
      {
        headers: { Origin: new URL(page.url()).origin, Accept: "text/html" },
        form: {
          community_slug: "mar-del-plata",
          title: "Bicicleteros sin JavaScript",
          summary: "Un lugar seguro para las bicicletas.",
          plan: "Relevar escuelas y colocar los bicicleteros.",
          budget_amount: raw,
          budget_locale: "es",
          currency: "USD",
          source_claim_id: "",
        },
      },
    );
    expect(response.status()).toBe(200);
    const values = await page.evaluate(
      (html) => {
        const document = new DOMParser().parseFromString(html, "text/html");
        return {
          amount: document.querySelector<HTMLInputElement>(
            'input[name="budget_amount"]',
          )?.value,
          locale: document.querySelector<HTMLInputElement>(
            'input[name="budget_locale"]',
          )?.value,
        };
      },
      await response.text(),
    );
    expect(values).toEqual({ amount: raw ? "2500.5" : "", locale: "en" });
  }
});

test("el servidor interpreta notación local y acepta el importe vacío en un POST urlencoded", async ({
  page,
}) => {
  await openProject(page);
  await openBudget(page, "es");
  let budget = "";
  // Enviamos texto localizado directamente a la acción, sin normalización cliente.
  // El Form público decodifica su respuesta JSON antes de mostrar la confirmación.
  await page.route(
    (url) => url.searchParams.has("qaction"),
    async (route) => {
      expect(route.request().headers().accept).toBe("application/json");
      await route.continue({
        headers: {
          ...route.request().headers(),
          "content-type": "application/x-www-form-urlencoded",
        },
        postData: new URLSearchParams({
          community_slug: "mar-del-plata",
          title: "Bicicleteros con presupuesto local",
          summary: "Un lugar seguro para las bicicletas.",
          plan: "Relevar escuelas y colocar los bicicleteros.",
          budget_amount: budget,
          budget_locale: "es",
          currency: "USD",
          source_claim_id: "",
        }).toString(),
      });
    },
  );
  for (const raw of ["2.500,50", ""]) {
    budget = raw;
    await page.locator('input[name="budget_amount"]').fill(raw);
    const received = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).searchParams.has("qaction"),
    );
    await page
      .getByRole("button", { name: "Revisar antes de publicar", exact: true })
      .click();
    const response = await received;
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    await expect(
      page.getByRole("heading", { name: "Confirmá tu proyecto", exact: true }),
    ).toBeVisible();
    await expect(page.locator('input[name="budget_amount"]')).toHaveValue(
      raw ? "2500.5" : "",
    );
    await expect(page.locator('input[name="budget_locale"]')).toHaveValue("en");
    if (raw) {
      await expect(
        page.locator("dd").filter({ hasText: /2\.500,50/ }),
      ).toHaveCount(1);
      await page
        .getByRole("link", { name: "Volver a editar", exact: true })
        .click();
    }
  }
});

test("cambiar el idioma de la app conserva la notación y magnitud del borrador", async ({
  page,
}) => {
  await openProject(page);
  await openBudget(page, "es");
  await page.locator('input[name="budget_amount"]').fill("2.500,50");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "{}").budgetLocale,
        draftKey,
      ),
    )
    .toBe("es");
  await page.goto(`${formPath}?lang=en`);
  await page
    .getByRole("button", { name: "Continue to the plan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to the budget", exact: true })
    .click();
  await expect(page.locator('input[name="budget_amount"]')).toHaveValue(
    "2.500,50",
  );
  await expect(page.locator("#budget-hint")).toContainText("2.500,50");
  await expect(page.locator("[data-budget-preview]")).toContainText("2,500.50");
  await page
    .getByRole("button", { name: "Review before publishing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Confirm your project", exact: true }),
  ).toBeVisible();
  await expect(page.locator('input[name="budget_amount"]')).toHaveValue(
    "2500.5",
  );
});
