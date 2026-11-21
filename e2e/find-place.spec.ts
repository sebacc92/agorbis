import { expect, test, type Page } from "@playwright/test";

async function signInResident(page: Page, path: string) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  }
  await page.goto(`/ingresar/?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(
    (current) => `${current.pathname}${current.search}` === path,
    { timeout: 20_000 },
  );
}

test("Explorar abre en Argentina y busca en todos los niveles con su contexto", async ({
  page,
}) => {
  await page.goto("/explorar/");
  const crumbs = page.getByRole("navigation", {
    name: "Cadena de comunidades",
  });
  await expect(crumbs.locator('[aria-current="page"]')).toContainText(
    "Argentina",
  );
  await expect(
    page.getByRole("navigation", { name: "Modo de exploración" }),
  ).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Buscar una comunidad por nombre" })
    .fill("chivil");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Resultados en todas las comunidades" }),
  ).toBeVisible();
  const result = page.locator('a[href="/c/ba-chivilcoy"]');
  await expect(result).toContainText("Chivilcoy");
  await expect(result).toContainText("en Buenos Aires");
});

test("el último nivel ofrece pedir una localidad con la comunidad superior elegida", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/explorar/?parent=ba-chivilcoy");
  const request = page.getByRole("link", {
    name: "¿Falta una localidad de Chivilcoy? Pedí que la sumemos",
  });
  await expect(request).toHaveAttribute(
    "href",
    "/comunidades/solicitar?superior=ba-chivilcoy",
  );

  await signInResident(page, "/comunidades/solicitar/?superior=ba-chivilcoy");
  await expect(page.locator('input[name="parent_slug"]')).toHaveValue(
    "ba-chivilcoy",
  );
  // La sugerencia se muestra elegida por su nombre, no como identificador.
  await expect(
    page.getByText("Chivilcoy", { exact: true }).first(),
  ).toBeVisible();
});
