import { expect, test, type Page } from "@playwright/test";
import {
  createLegalTestAccount,
  testAccountPassword,
} from "./account-followup-fixtures";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

const LABELS = [
  "Reordenar el tránsito de la costanera",
  "Sumar luminarias en la plaza",
  "Mantener el diseño actual",
];

/** Encuesta abierta propia de la prueba: las sembradas las usan otras suites. */
function pollFixture(
  id: string,
  {
    slug = "mar-del-plata",
    type = "single",
    labels = LABELS,
    createdAt,
  }: {
    slug?: string;
    type?: "single" | "binary";
    labels?: string[];
    createdAt?: string;
  } = {},
) {
  const question = `Encuesta de lectura ${id}`;
  localCommunityFixture(`
    insert into public.polls(id, community_id, author_id, question, type, category, closes_at${createdAt ? ", created_at" : ""})
    select ${literal(id)}::uuid, c.id, ${literal(owner)}::uuid, ${literal(question)}, ${literal(type)}, 'comunidad', now() + interval '1 day'${createdAt ? `, ${literal(createdAt)}::timestamptz` : ""}
    from public.communities c where c.slug = ${literal(slug)};
    insert into public.poll_options(poll_id, label, sort_order)
    select ${literal(id)}::uuid, v.label, v.position - 1
    from unnest(array[${labels.map(literal).join(",")}]) with ordinality as v(label, position);
  `);
  return question;
}

const removePolls = (...ids: string[]) =>
  localCommunityFixture(
    `delete from public.polls where id in (${ids.map(literal).join(",")});`,
  );

async function login(page: Page, email: string, password: string) {
  await page.goto("/ingresar/");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/ingresar/);
}

const readOnlyOptions = (page: Page) =>
  page
    .locator("article")
    .getByRole("list", { name: "Opciones", exact: true })
    .getByRole("listitem");

/** Las etiquetas a la vista, sin controles ni nada que marque una elección. */
async function expectReadOnlyOptions(page: Page, labels = LABELS) {
  await expect(
    page.getByRole("heading", { name: "Opciones", exact: true }),
  ).toBeVisible();
  await expect(readOnlyOptions(page)).toHaveText(labels);
  await expect(page.locator('[name="option_id"]')).toHaveCount(0);
  await expect(
    page.locator("article").getByRole("list", { name: "Opciones", exact: true }),
  ).not.toContainText(/\d/);
}

for (const native of [false, true])
  test(`quien no ingresó lee las opciones y crear la cuenta es lo primero ${native ? "por HTML" : "con JavaScript"}`, async ({
    browser,
    baseURL,
  }) => {
    const id = crypto.randomUUID();
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 390, height: 844 },
      ...(native ? nativeContextOptions : {}),
    });
    try {
      pollFixture(id);
      const page = await context.newPage();
      await page.goto(`/encuestas/${id}/`);
      await expectReadOnlyOptions(page);
      // Los loaders se vuelven a pedir al cargar y redibujan (D99).
      await page.waitForLoadState("networkidle");
      await expectReadOnlyOptions(page);

      const article = page.locator("article");
      const signUp = article.getByRole("link", {
        name: "Crear cuenta",
        exact: true,
      });
      const signIn = article.getByRole("link", {
        name: "Ingresar",
        exact: true,
      });
      await expect(signUp).toHaveAttribute(
        "href",
        new RegExp(`/registro.*${encodeURIComponent(`/encuestas/${id}`)}`),
      );
      await expect(signIn).toHaveAttribute(
        "href",
        new RegExp(`/ingresar.*${encodeURIComponent(`/encuestas/${id}`)}`),
      );
      await expect(article).toContainText(
        "Para votar necesitás una cuenta y vivir en Mar del Plata.",
      );
      const list = await readOnlyOptions(page).last().boundingBox();
      const primary = await signUp.boundingBox();
      const secondary = await signIn.boundingBox();
      expect(list!.y + list!.height).toBeLessThanOrEqual(primary!.y);
      expect(primary!.x).toBeLessThan(secondary!.x);
      await expect(page.getByText("Los resultados están reservados")).toBeVisible();
    } finally {
      await context.close();
      removePolls(id);
    }
  });

test("en la Tierra no se pide vivir en la Tierra", async ({ page }) => {
  const id = crypto.randomUUID();
  try {
    pollFixture(id, { slug: "earth", type: "binary", labels: LABELS.slice(0, 2) });
    await page.goto(`/encuestas/${id}/`);
    await expectReadOnlyOptions(page, LABELS.slice(0, 2));
    await expect(page.locator("article")).toContainText(
      "Para votar necesitás una cuenta y elegir dónde vivís.",
    );
    await expect(page.locator("article")).not.toContainText(/viv(ir|en) en Tierra/);
  } finally {
    removePolls(id);
  }
});

test("una cuenta sin residencia lee las opciones y sabe qué le falta", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const local = crypto.randomUUID();
  const global = crypto.randomUUID();
  const account = await createLegalTestAccount("lectura-encuesta");
  try {
    pollFixture(local);
    pollFixture(global, { slug: "earth" });
    await login(page, account.email, testAccountPassword);

    await page.goto(`/encuestas/${local}/`);
    await expectReadOnlyOptions(page);
    await expect(page.locator("article")).toContainText(
      "votar sólo pueden quienes viven en Mar del Plata",
    );

    await page.goto(`/encuestas/${global}/`);
    await expectReadOnlyOptions(page);
    await expect(page.locator("article")).toContainText(
      "Para votar, elegí dónde vivís desde",
    );
    await expect(page.locator("article")).not.toContainText(/viv(ir|en) en Tierra/);
    await expect(
      page.locator("article").getByRole("link", { name: "tu perfil", exact: true }),
    ).toHaveAttribute("href", "/perfil");
  } finally {
    removePolls(local, global);
    expect(
      (await account.admin.auth.admin.deleteUser(account.id)).error,
    ).toBeNull();
  }
});

test("otra residencia las lee y al votar siguen ahí, sin marcar qué se eligió", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const other = crypto.randomUUID();
  const own = crypto.randomUUID();
  try {
    pollFixture(other, { slug: "uruguay" });
    pollFixture(own);
    await login(page, "sofia@agorbis.test", testAccountPassword);

    await page.goto(`/encuestas/${other}/`);
    await expectReadOnlyOptions(page);
    await expect(page.locator("article")).toContainText(
      "votar sólo pueden quienes viven en Uruguay",
    );

    await page.goto(`/encuestas/${own}/`);
    // Con la votación abierta las opciones son los controles: no se duplican.
    await expect(page.locator('input[name="option_id"]')).toHaveCount(3);
    await expect(
      page.getByRole("heading", { name: "Opciones", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("radio", { name: new RegExp(LABELS[1]) }).check();
    await page.getByRole("button", { name: "Votar", exact: true }).click();
    await expect(
      page.getByText("¡Listo! Tu voto quedó registrado.", { exact: true }),
    ).toBeVisible();
    // Voto secreto (D68): la opción elegida se ve igual que las otras, ahora y
    // al volver.
    const treatment = () =>
      readOnlyOptions(page).evaluateAll((items) =>
        items.map((item) => `${item.className}|${item.children.length}`),
      );
    await expectReadOnlyOptions(page);
    expect(new Set(await treatment()).size).toBe(1);

    await page.reload();
    await expectReadOnlyOptions(page);
    expect(new Set(await treatment()).size).toBe(1);
    await expect(
      page.getByText(
        "Ya votaste en esta encuesta. Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla.",
        { exact: true },
      ),
    ).toBeVisible();
    const after = await readOnlyOptions(page).last().boundingBox();
    const voted = await page
      .getByText("Ya votaste en esta encuesta.", { exact: false })
      .boundingBox();
    expect(after!.y + after!.height).toBeLessThanOrEqual(voted!.y);
  } finally {
    removePolls(other, own);
  }
});

for (const width of [1280, 1920])
  test(`a ${width} sin nada para el costado no se reserva una columna vacía`, async ({
    page,
  }) => {
    const id = crypto.randomUUID();
    try {
      pollFixture(id);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/encuestas/${id}/`);
      await expectReadOnlyOptions(page);
      await page.waitForLoadState("networkidle");
      const article = page.locator("article");
      await expect(article.locator("xpath=../aside")).toHaveCount(0);
      // La columna de lectura no corre los 96rem del contenedor (D111) y queda
      // centrada: a la izquierda dejaría el mismo hueco a la derecha.
      const box = await article.boundingBox();
      expect(box!.width).toBeLessThanOrEqual(896);
      expect(box!.width).toBeGreaterThan(800);
      const rightGap = width - (box!.x + box!.width);
      expect(Math.abs(box!.x - rightGap)).toBeLessThanOrEqual(2);
      // La miga de pan arranca con la columna, no contra el borde del contenedor.
      const crumbs = await page
        .getByRole("navigation", {
          name: "Cadena de comunidades",
          exact: true,
        })
        .boundingBox();
      expect(crumbs!.x).toBeGreaterThanOrEqual(box!.x - 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      removePolls(id);
    }
  });

test("con resultados visibles conserva el costado y no repite las opciones", async ({
  page,
}) => {
  const id = crypto.randomUUID();
  try {
    pollFixture(id);
    localCommunityFixture(`
      insert into private.poll_option_tallies(poll_id, option_id, votes, participants)
      select o.poll_id, o.id, 2, 6 from public.poll_options o where o.poll_id = ${literal(id)}::uuid;
      update public.polls set status = 'closed' where id = ${literal(id)}::uuid;
    `);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/encuestas/${id}/`);
    const download = page.getByRole("link", {
      name: /Descargar resultados \(CSV\)/,
    });
    await expect(download).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Opciones", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("article")).toContainText(LABELS[0]);
    const aside = await page
      .locator("article")
      .locator("xpath=../aside")
      .boundingBox();
    const article = await page.locator("article").boundingBox();
    expect(aside!.height).toBeGreaterThan(0);
    expect(aside!.x).toBeGreaterThanOrEqual(article!.x + article!.width);
  } finally {
    removePolls(id);
  }
});

for (const width of [320, 390])
  test(`el widget de la comunidad muestra cada opción entera a ${width}`, async ({
    page,
  }) => {
    const id = crypto.randomUUID();
    const labels = [
      "Mejorar los accesos públicos y el cuidado de los balnearios del sur de la ciudad",
      "Reforzar la prevención de la erosión costera",
      // Sin espacios no hay dónde cortar: tampoco puede empujar la tarjeta.
      `Aaaa${"a".repeat(70)}`,
    ];
    try {
      const question = pollFixture(id, {
        labels,
        createdAt: "2095-01-01T00:00:00Z",
      });
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/c/mar-del-plata/`);
      const vote = page.getByRole("link", {
        name: "Votar en esta encuesta",
        exact: true,
      });
      const card = page
        .locator("article, section, div")
        .filter({
          has: page.getByRole("heading", { name: question, exact: true }),
        })
        .filter({ has: vote })
        .last();
      await expect(card).toBeVisible();
      const cardBox = (await card.boundingBox())!;
      for (const label of labels) {
        // Un nombre accesible estable: community-improvements también lo usa.
        // D125: la flecha pasó a un chevron SVG decorativo, fuera del nombre.
        const option = page.getByRole("link", {
          name: label,
          exact: true,
        });
        await expect(option).toBeVisible();
        const box = (await option.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
        expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
        const text = option.locator('span[dir="auto"]');
        await expect(text).toHaveText(label);
        const clipped = await text.evaluate((node) => {
          const link = node.parentElement!.getBoundingClientRect();
          const span = node.getBoundingClientRect();
          return (
            node.scrollWidth > node.clientWidth ||
            span.right > link.right ||
            span.left < link.left
          );
        });
        expect(clipped, label).toBe(false);
        const arrow = await option.locator("svg").last().boundingBox();
        expect(arrow!.x + arrow!.width).toBeLessThanOrEqual(box.x + box.width);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    } finally {
      removePolls(id);
    }
  });
