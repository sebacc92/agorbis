import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const ownerId = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
async function signIn(page: Page) {
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
}
function insertClaim(id: string) {
  localCommunityFixture(`insert into public.claims(id,community_id,author_id,title,description,category)
    select ${literal(id)}::uuid,id,${literal(ownerId)}::uuid,'Seguimiento ${id}','Fixture local de seguimiento confirmado.','otro'
    from public.communities where slug='mar-del-plata';`);
}
function followupForm(page: Page) {
  return page.locator("form").filter({
    has: page.getByRole("button", {
      name: "Publicar actualización",
      exact: true,
    }),
  });
}

test("guardar el seguimiento actualiza la cronología, limpia sólo el envío confirmado y conserva una edición posterior", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  try {
    insertClaim(id);
    await signIn(page);
    await page.goto(`/reclamos/${id}/`);
    const form = followupForm(page);
    const title = form.locator('input[name="title"]');
    const body = form.locator('textarea[name="body"]');
    await title.fill("Primera actualización confirmada");
    await body.fill("Texto del primer movimiento.");
    await form
      .getByRole("button", { name: "Publicar actualización", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Primera actualización confirmada",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "La actualización se publicó en el seguimiento." }),
    ).toBeVisible();
    await expect(title).toHaveValue("");
    await expect(body).toHaveValue("");

    await title.fill("Segunda actualización enviada");
    await body.fill("Texto del segundo movimiento.");
    let release = () => {};
    let submitted = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const intercepted = new Promise<void>((resolve) => (submitted = resolve));
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted();
      await pending;
      await route.continue();
    });
    try {
      await form
        .getByRole("button", { name: "Publicar actualización", exact: true })
        .click();
      await intercepted;
      await title.fill("Borrador escrito durante el envío");
      await body.fill("Texto posterior al envío.");
      release();
      await expect(
        page.getByRole("heading", {
          name: "Segunda actualización enviada",
          exact: true,
        }),
      ).toBeVisible();
      await expect(title).toHaveValue("Borrador escrito durante el envío");
      await expect(body).toHaveValue("Texto posterior al envío.");
    } finally {
      release();
      await page.unroute("**/*qaction=*");
    }

    await title.fill("ab");
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("qaction="),
    );
    await form
      .getByRole("button", { name: "Publicar actualización", exact: true })
      .click();
    expect((await rejected).status()).toBe(400);
    await expect(
      form.getByText("Mínimo 3 caracteres.", { exact: true }).first(),
    ).toBeVisible();
    await expect(title).toHaveValue("ab");
    await expect(body).toHaveValue("Texto posterior al envío.");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "La actualización se publicó en el seguimiento." }),
    ).toHaveCount(0);
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(id)}::uuid;`,
    );
  }
});

test("una resolución ciudadana por POST nativo se guarda sin atribuir una respuesta oficial", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  try {
    insertClaim(id);
    await signIn(page);
    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto(`/reclamos/${id}/`);
      const form = followupForm(native);
      await form
        .locator('select[name="event_type"]')
        .selectOption("resolution");
      await form
        .locator('input[name="title"]')
        .fill("La persona autora reportó una solución");
      await form
        .locator('textarea[name="body"]')
        .fill(
          "La situación cambió, con evidencia aportada por la persona autora.",
        );
      await form
        .getByRole("button", { name: "Publicar actualización", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      const timeline = native.locator(
        'section[aria-labelledby="seguimiento-reclamo"]',
      );
      const movement = timeline.locator("ol li").filter({
        has: native.getByRole("heading", {
          name: "La persona autora reportó una solución",
          exact: true,
        }),
      });
      await expect(movement).toContainText("Resolución ciudadana");
      await expect(movement).not.toContainText("Respuesta oficial");
      await expect(
        timeline.getByRole("button", { name: /Respuestas oficiales/ }),
      ).toHaveCount(0);
      await expect(
        native.getByRole("status").filter({
          hasText: "La actualización se publicó en el seguimiento.",
        }),
      ).toBeVisible();
      await expect(form.locator('input[name="title"]')).toHaveValue("");
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(id)}::uuid;`,
    );
  }
});

test("la evidencia PDF se ofrece como enlace y sólo una imagen admitida forma la comparativa", async ({
  page,
  baseURL,
}) => {
  const id = crypto.randomUUID();
  const path = `pending/${crypto.randomUUID()}.png`;
  const url = process.env.PUBLIC_SUPABASE_URL!;
  if (
    !["localhost", "127.0.0.1"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  )
    throw new Error(
      "La evidencia de prueba sólo corresponde a Supabase local.",
    );
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR04AAAAASUVORK5CYII=",
    "base64",
  );
  try {
    const uploaded = await admin.storage
      .from("claims")
      .upload(path, png, { contentType: "image/png" });
    expect(uploaded.error).toBeNull();
    localCommunityFixture(`
      insert into public.claim_uploads(path,owner_id,upload_completed_at) values (${literal(path)},${literal(ownerId)}::uuid,now());
      insert into public.claims(id,community_id,author_id,title,description,category,status,image_paths,image_urls)
      select ${literal(id)}::uuid,id,${literal(ownerId)}::uuid,'Comparativa comprobable','Fixture local con evidencia visual.','otro','resolved',array[${literal(path)}],array['']
      from public.communities where slug='mar-del-plata';
    `);
    const pdf = new URL("/fixture-resolution.pdf", baseURL).href;
    const image = new URL("/fixture-resolution.jpg", baseURL).href;
    const eventId = crypto.randomUUID();
    localCommunityFixture(
      `insert into public.claim_events(id,claim_id,event_type,title,evidence_url) values (${literal(eventId)}::uuid,${literal(id)}::uuid,'resolution','Documento de resolución',${literal(pdf)});`,
    );
    await page.goto(`/reclamos/${id}/`);
    await expect(
      page.getByRole("link", {
        name: "Ver evidencia de resolución",
        exact: false,
      }),
    ).toHaveAttribute("href", pdf);
    await expect(page.locator(`img[src=${JSON.stringify(pdf)}]`)).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("heading", {
        name: "Comparativa: Antes y Después de la solución",
        exact: true,
      }),
    ).toHaveCount(0);
    localCommunityFixture(
      `update public.claim_events set evidence_url=${literal(image)} where id=${literal(eventId)}::uuid;`,
    );
    await page.route("**/fixture-resolution.jpg", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: png }),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Comparativa: Antes y Después de la solución",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(`img[src=${JSON.stringify(image)}]`)).toHaveCount(
      1,
    );
  } finally {
    const removed = await admin.storage.from("claims").remove([path]);
    expect(removed.error).toBeNull();
    localCommunityFixture(
      `delete from public.claims where id=${literal(id)}::uuid; delete from public.claim_uploads where path=${literal(path)};`,
    );
  }
});

test("el reloj del reclamo vence y se recupera al volver sin afirmar un escalado ni recargar", async ({
  page,
}) => {
  const id = crypto.randomUUID();
  const now = Date.now();
  const deadline = now + 300_000;
  try {
    insertClaim(id);
    localCommunityFixture(
      `update public.claims set response_due_at=${literal(new Date(deadline).toISOString())}::timestamptz,support_count=50 where id=${literal(id)}::uuid;`,
    );
    await page.clock.install({ time: now });
    await page.goto(`/reclamos/${id}/`);
    const originalUrl = page.url();
    await expect(
      page.getByText("Queda 1 día para que respondan", { exact: true }),
    ).toBeVisible();
    await page.clock.fastForward(300_000);
    await expect(
      page.getByRole("status").filter({
        hasText: /El plazo para responder terminó\.|1 día sin respuesta/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Escalado por falta de respuesta", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Ya tiene el apoyo necesario. El escalado se confirma después de la revisión del reclamo.",
        { exact: true },
      ),
    ).toBeVisible();
    await page.clock.setFixedTime(now + 2 * 86_400_000);
    await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
    await expect(
      page.getByRole("status").filter({ hasText: "2 días sin respuesta" }),
    ).toBeVisible();
    expect(page.url()).toBe(originalUrl);
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(id)}::uuid;`,
    );
  }
});
