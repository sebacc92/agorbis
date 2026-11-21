import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";

const ownerId = "33333333-3333-4333-8333-333333333333";
const neighborId = "77777777-7777-4777-8777-777777777777";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
function localAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !secret ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw new Error("Estas pruebas sólo escriben fixtures en Supabase local.");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function login(page: Page, email = "sofia@agorbis.test") {
  test.setTimeout(120_000);
  localAdmin();
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
}

test("el seguimiento distingue autor, vecino y representante verificado sin ofrecer acciones rechazadas", async ({
  page,
  browser,
}) => {
  const db = localAdmin();
  const { data: community, error } = await db
    .from("communities")
    .select("id")
    .eq("slug", "argentina")
    .single();
  expect(error).toBeNull();
  const claimId = crypto.randomUUID();
  const orgId = crypto.randomUUID();
  const title = `Permisos de seguimiento ${claimId}`;
  const neighborContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
  });
  try {
    localCommunityFixture(`
      insert into public.claims(id, community_id, author_id, category, title, description)
      values (${literal(claimId)}::uuid, ${literal(community!.id)}::uuid, ${literal(ownerId)}::uuid,
        'infraestructura', ${literal(title)}, 'Problema concreto con evidencia pública.');
    `);
    await login(page);
    await page.goto(`/reclamos/${claimId}/`);
    const update = page.locator("form").filter({
      has: page.locator("button", { hasText: "Publicar actualización" }),
    });
    await expect(update).toBeVisible();
    await expect(
      update.locator('option[value="official_response"]'),
    ).toHaveCount(0);
    await expect(update.locator('select[name="status"]')).toHaveCount(0);
    const neighbor = await neighborContext.newPage();
    await login(neighbor, "elena@agorbis.test");
    await neighbor.goto(`/reclamos/${claimId}/`);
    await expect(
      neighbor.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      neighbor.getByRole("button", {
        name: "Publicar actualización",
        exact: true,
      }),
    ).toHaveCount(0);
    localCommunityFixture(`
      insert into public.organizations(id, community_id, name, slug, type, verified_at)
      values (${literal(orgId)}::uuid, ${literal(community!.id)}::uuid,
        ${literal(`Institución seguimiento ${orgId}`)}, ${literal(`seguimiento-${orgId}`)}, 'government', now());
      insert into public.organization_members(organization_id, user_id, role, verified_at)
      values (${literal(orgId)}::uuid, ${literal(neighborId)}::uuid, 'representative', now());
      update public.claims set responsible_organization_id = ${literal(orgId)}::uuid
      where id = ${literal(claimId)}::uuid;
    `);
    await neighbor.reload();
    const official = neighbor.locator("form").filter({
      has: neighbor.locator("button", { hasText: "Publicar actualización" }),
    });
    await expect(official).toBeVisible();
    await expect(
      official.locator('option[value="official_response"]'),
    ).toHaveCount(1);
    await expect(official.locator('select[name="status"]')).toBeVisible();
    await official
      .locator('select[name="event_type"]')
      .selectOption("official_response");
    const responseTitle = `Respuesta verificada ${claimId}`;
    await official.locator('input[name="title"]').fill(responseTitle);
    await official
      .locator('textarea[name="body"]')
      .fill("Acusamos recibo de la documentación pública.");
    await official
      .getByRole("button", { name: "Publicar actualización", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("claim_events")
              .select("id")
              .eq("claim_id", claimId)
              .eq("title", responseTitle)
          ).data?.length,
      )
      .toBe(1);
    await neighbor.reload();
    await expect(
      neighbor.getByRole("heading", { name: responseTitle, exact: true }),
    ).toBeVisible();
    const saved = await db
      .from("claim_events")
      .select("organization_id,event_type")
      .eq("claim_id", claimId)
      .eq("title", responseTitle)
      .single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({
      organization_id: orgId,
      event_type: "official_response",
    });
    localCommunityFixture(
      `delete from public.organization_members where organization_id = ${literal(orgId)}::uuid and user_id = ${literal(neighborId)}::uuid;`,
    );
    await neighbor.reload();
    await expect(
      neighbor.getByRole("button", {
        name: "Publicar actualización",
        exact: true,
      }),
    ).toHaveCount(0);
  } finally {
    await neighborContext.close();
    localCommunityFixture(`
      delete from public.claims where id = ${literal(claimId)}::uuid;
      delete from public.organizations where id = ${literal(orgId)}::uuid;
    `);
  }
});

test("las fotos se suman por lotes, sobreviven a errores y conservan portada y orden", async ({
  page,
}) => {
  await login(page);
  await page.goto("/c/mar-del-plata/reclamos/nuevo/");
  const pixels = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const photo = (name: string) => ({
    name: `${name}.png`,
    mimeType: "image/png",
    buffer: pixels,
  });
  const files = page.locator('input[name="images"]');
  const names = () =>
    files.evaluate((input: HTMLInputElement) =>
      Array.from(input.files ?? [], (file) => file.name),
    );
  await files.setInputFiles([photo("portada"), photo("segunda")]);
  await expect.poll(names).toEqual(["portada.webp", "segunda.webp"]);
  await files.setInputFiles(photo("tercera"));
  await expect
    .poll(names)
    .toEqual(["portada.webp", "segunda.webp", "tercera.webp"]);
  await files.setInputFiles({
    name: "invalida.png",
    mimeType: "image/png",
    buffer: Buffer.from("not a decodable image"),
  });
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Las fotos anteriores se conservaron" }),
  ).toBeVisible();
  await expect
    .poll(names)
    .toEqual(["portada.webp", "segunda.webp", "tercera.webp"]);
  await files.setInputFiles([photo("cuarta"), photo("quinta")]);
  await expect
    .poll(names)
    .toEqual(["portada.webp", "segunda.webp", "tercera.webp", "cuarta.webp"]);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 de esta selección quedaron afuera" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hacer portada", exact: true })
    .last()
    .click();
  await expect
    .poll(names)
    .toEqual(["cuarta.webp", "portada.webp", "segunda.webp", "tercera.webp"]);
  await page
    .getByRole("button", { name: "Eliminar foto", exact: true })
    .first()
    .click();
  await expect
    .poll(names)
    .toEqual(["portada.webp", "segunda.webp", "tercera.webp"]);
  await files.setInputFiles(photo("reemplazo"));
  await expect
    .poll(names)
    .toEqual([
      "portada.webp",
      "segunda.webp",
      "tercera.webp",
      "reemplazo.webp",
    ]);
  await expect(
    page.locator('img[alt^="Vista previa de la imagen"]'),
  ).toHaveCount(4);
});

test("el reclamo de una sola pantalla y los pasos del proyecto enfocan errores y respetan movimiento reducido", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("agorbis_a11y_motion", "true"),
  );
  await login(page);
  await page.goto("/c/mar-del-plata/reclamos/nuevo/");
  // Una sola pantalla: título, categoría, descripción, fotos y ubicación a la
  // vista, sin pasos que esconder ni anunciar.
  await expect(
    page.getByRole("heading", { name: "Ubicación (opcional)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Siguiente: Ubicación" }),
  ).toHaveCount(0);
  await page.locator('input[name="title"]').fill("a");
  await page
    .locator('textarea[name="description"]')
    .fill("La vereda está rota frente a la plaza.");
  await page
    .getByRole("button", { name: "Revisar antes de publicar", exact: true })
    .click();
  // El servidor valida igual que sin JavaScript: el resumen recibe el foco y
  // el error queda junto al campo, con todos los campos a la vista.
  await expect(
    page.getByRole("alert").filter({ hasText: "No se publicó todavía" }),
  ).toBeFocused();
  await expect(
    page.getByRole("alert").filter({ hasText: "Mínimo 3 caracteres." }).last(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confirmá tu reclamo" }),
  ).toHaveCount(0);

  await page.goto("/c/mar-del-plata/proyectos/nuevo/");
  await page.evaluate(() => {
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (options) {
      if (typeof options === "object")
        document.documentElement.dataset.wizardScroll = options.behavior;
      original.call(this, options);
    };
  });
  await page
    .getByRole("button", { name: "Seguir con el plan", exact: true })
    .click();
  await expect(page.locator('input[name="title"]')).toBeFocused();
  await expect(page.locator("html")).toHaveAttribute(
    "data-wizard-scroll",
    "instant",
  );
  await page
    .locator('input[name="title"]')
    .fill("Un proyecto accesible para las veredas");
  await page
    .locator('textarea[name="summary"]')
    .fill("Veredas seguras para todas las personas.");
  await page
    .getByRole("button", { name: "Seguir con el plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cómo", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: "Seguir con el presupuesto", exact: true })
    .click();
  await expect(page.locator('textarea[name="plan"]')).toBeFocused();
  await page
    .locator('textarea[name="plan"]')
    .fill("Relevar tramos y ejecutar obras por etapas.");
  await page
    .getByRole("button", { name: "Seguir con el presupuesto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cuánto", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "← Volver", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cómo", exact: true }),
  ).toBeFocused();
  await expect(page.locator('textarea[name="plan"]')).toHaveValue(
    "Relevar tramos y ejecutar obras por etapas.",
  );
});

test("la encuesta cierra al vencer sin polling y consulta resultados sólo por decisión de la persona", async ({
  page,
}) => {
  const db = localAdmin();
  const { data: community, error } = await db
    .from("communities")
    .select("id")
    .eq("slug", "argentina")
    .single();
  expect(error).toBeNull();
  const pollId = crypto.randomUUID();
  const deadline = Date.now() + 300_000;
  try {
    localCommunityFixture(`
      insert into public.polls(id, community_id, author_id, type, category, status, question, closes_at, results_visibility)
      values (${literal(pollId)}::uuid, ${literal(community!.id)}::uuid, ${literal(ownerId)}::uuid,
        'binary', 'transporte', 'active', ${literal(`Cierre local ${pollId}`)},
        ${literal(new Date(deadline).toISOString())}::timestamptz, 'after_close');
      insert into public.poll_options(poll_id, label, sort_order) values
        (${literal(pollId)}::uuid, 'Avanzar', 0), (${literal(pollId)}::uuid, 'Revisar', 1);
    `);
    await login(page);
    await page.clock.install({ time: new Date() });
    await page.goto(`/encuestas/${pollId}/`);
    await expect(page.locator('button[name="option_id"]')).toHaveCount(2);
    let reads = 0;
    page.on("request", (request) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname.replace(/\/$/, "") ===
          `/encuestas/${pollId}`
      )
        reads++;
    });
    await page.clock.fastForward(300_001);
    await expect(page.locator('button[name="option_id"]')).toHaveCount(0);
    await expect(
      page.getByRole("link", {
        name: "Consultar resultados finales",
        exact: true,
      }),
    ).toBeVisible();
    expect(reads).toBe(0);
    await expect(
      page.getByText(
        "La ronda cerró, pero los resultados siguen ocultos porque participaron menos de 5 personas. No mostramos el número exacto.",
        { exact: true },
      ),
    ).toHaveCount(0);
    // El loader reanudable también lee al montar la página. Se cambia el
    // estado remoto sólo después de comprobar el vencimiento local, para no
    // convertir esa lectura inicial en un cierre confirmado por el servidor.
    localCommunityFixture(
      `update public.polls set status = 'closed' where id = ${literal(pollId)}::uuid;`,
    );
    await page
      .getByRole("link", { name: "Consultar resultados finales", exact: true })
      .click();
    await expect(
      page.getByText(
        "La ronda cerró, pero los resultados siguen ocultos porque participaron menos de 5 personas. No mostramos el número exacto.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(reads).toBe(1);
  } finally {
    localCommunityFixture(
      `delete from public.polls where id = ${literal(pollId)}::uuid;`,
    );
  }
});
