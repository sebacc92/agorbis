import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

const residentId = "33333333-3333-4333-8333-333333333333";

function localSupabaseUrl(): string {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  }
  return url;
}

async function signIn(page: Page, path: string) {
  localSupabaseUrl();
  await page.goto(`/ingresar/?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === path, {
    timeout: 20_000,
  });
}

test("Publicar móvil y las URLs directas orientan a una comunidad de residencia antes de escribir", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/c/francia/");
  await page
    .getByRole("navigation", { name: "Navegación principal inferior" })
    .getByRole("button", { name: "Publicar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "¿Qué querés publicar?" });
  await expect(dialog).toContainText("Para publicar, usamos Mar del Plata.");
  await expect(dialog.getByRole("link", { name: /^Reclamo/ })).toHaveAttribute(
    "href",
    "/c/mar-del-plata/reclamos/nuevo",
  );
  await page.keyboard.press("Escape");

  for (const [path, type] of [
    ["encuestas/nueva", "poll"],
    ["debates/nuevo", "debate"],
    ["reclamos/nuevo", "claim"],
    ["proyectos/nuevo", "project"],
  ]) {
    await page.goto(`/c/francia/${path}/`);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/publicar/" && url.searchParams.get("tipo") === type,
    );
    await expect(
      page.getByRole("heading", { name: "Elegí dónde publicar" }),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Tu residencia declarada" }),
    ).toContainText("Mar del Plata");
    await expect(
      page.locator('input[name="title"], input[name="question"]'),
    ).toHaveCount(0);
    await expect(page.getByLabel("Comunidad donde publicar")).toHaveValue(
      "mar-del-plata",
    );
  }
});

test("el formulario no comienza con un cupo agotado y ofrece otros niveles", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const title = `Cupo UI E2E ${crypto.randomUUID()}`;
  try {
    // La fixture usa PostgreSQL local sin alterar los permisos de búsqueda
    // de service_role ni la autorización que ejerce la aplicación bajo prueba.
    const result = localCommunityFixture(`
      insert into public.claims (community_id, author_id, title, description, category)
      select c.id, '${residentId}'::uuid, '${title}',
        'Preparación local de la regresión de cupos.', 'otro'
      from public.communities c
      join public.content_quotas q on q.level = c.level and q.content_type = 'claim'
      cross join lateral generate_series(1, q.monthly_limit) fixture
      where c.slug = 'mar-del-plata';
    `);
    expect(result).toMatch(/INSERT 0 [1-9][0-9]*/);
    await signIn(page, "/inicio/");
    await page.goto("/c/mar-del-plata/reclamos/nuevo/");
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/publicar/" &&
        url.searchParams.get("tipo") === "claim",
    );
    await expect(page.locator('input[name="title"]')).toHaveCount(0);
    await expect(
      page.getByText(/Agotaste tus .* reclamos de este mes en Mar del Plata/),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Buenos Aires/ }),
    ).toBeVisible();
  } finally {
    localCommunityFixture(
      `delete from public.claims where author_id='${residentId}'::uuid and title='${title}';`,
    );
  }
});

test("la revisión del reclamo distingue ninguna ubicación, texto y zona aproximada, incluso al quitarla", async ({
  page,
}) => {
  test.setTimeout(90_000);
  // La API de GPS del headless puede no responder antes de su timeout. Se
  // controla sólo esa entrada: la cuantización y el estado compartido son reales.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: -38.0055274,
              longitude: -57.5426107,
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition),
      },
    });
  });
  await signIn(page, "/c/mar-del-plata/reclamos/nuevo/");
  await page
    .locator('input[name="title"]')
    .fill("Ubicación honesta en la revisión");
  await page
    .locator('textarea[name="description"]')
    .fill("Un problema cívico que puede describirse sin coordenadas.");
  // La única revisión es la del servidor: ahí se comprueba cómo se describe
  // la ubicación antes de publicar (D85).
  const location = page.locator("p").filter({ hasText: "📍" });
  const review = async () => {
    await page
      .getByRole("button", { name: "Revisar antes de publicar", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confirmá tu reclamo" }),
    ).toBeVisible();
  };
  const edit = async () => {
    await page.getByRole("link", { name: "Volver a editar", exact: true }).click();
    await expect(page.locator('input[name="title"]')).toHaveValue(
      "Ubicación honesta en la revisión",
    );
  };

  await review();
  await expect(location).toContainText("Sin ubicación adjunta");
  await expect(location).not.toContainText("Ubicación marcada en el mapa");

  await edit();
  await page.getByLabel("¿Dónde?", { exact: true }).fill("Frente a la plaza");
  await review();
  await expect(location).toContainText("Frente a la plaza");
  await expect(location).not.toContainText("con zona aproximada");

  await edit();
  await page.getByLabel("¿Dónde?", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Marcar zona aproximada", exact: true })
    .click();
  await expect(page.locator('input[name="lat"]')).toHaveValue("-38.006");
  await expect(page.locator('input[name="lng"]')).toHaveValue("-57.543");
  await review();
  await expect(location).toContainText("Ubicación aproximada marcada");
  await expect(location).not.toContainText("Sin ubicación adjunta");

  await edit();
  await page.getByRole("button", { name: "Quitar", exact: true }).click();
  await expect(page.locator('input[name="lat"]')).toHaveValue("");
  await expect(page.locator('input[name="lng"]')).toHaveValue("");
  await review();
  await expect(location).toContainText("Sin ubicación adjunta");
});
