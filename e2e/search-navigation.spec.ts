import { expect, test } from "@playwright/test";

test("Ctrl/Cmd+K sólo abre la paleta y / enfoca la búsqueda visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explorar/");
  const search = page.getByRole("combobox", {
    name: "Buscar comunidades y publicaciones",
  });
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
  for (const shortcut of ["Control+k", "Meta+k"]) {
    await page.keyboard.press(shortcut);
    await expect(palette).toBeVisible();
    await expect(palette.getByRole("searchbox")).toBeFocused();
    await expect(search).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toHaveCount(0);
  }
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await search.fill("agua");
  await page.keyboard.press("/");
  await expect(search).toHaveValue("agua/");
  await expect(palette).toHaveCount(0);
});

test("dos letras autocompletan comunidades y tres habilitan la búsqueda global", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explorar/");
  const search = page.getByRole("combobox", {
    name: "Buscar comunidades y publicaciones",
  });
  await search.fill("ar");
  const list = page.getByRole("listbox", { name: "Resultados de la búsqueda" });
  await expect(list).toHaveAttribute("aria-busy", "false");
  await expect(list.getByRole("option").first()).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(
    page.getByText("Escribí al menos tres letras para buscar en todo Agorbis."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Buscar “ar” en todo Agorbis" }),
  ).toHaveCount(0);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/explorar\/$/);
  await search.press("ArrowDown");
  await expect(list.getByRole("option", { selected: true })).toHaveCount(1);
  await search.press("Enter");
  await expect(page).toHaveURL(/\/c\/[^/]+\/?$/);

  await page.goto("/explorar/");
  await search.fill("arg");
  await page
    .getByRole("button", { name: "Buscar “arg” en todo Agorbis" })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.replace(/\/$/, "") === "/buscar" &&
      url.searchParams.get("q") === "arg",
  );
});

test("la paleta se reabre después del fondo, el atajo y Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explorar/");
  const trigger = page.getByRole("button", {
    name: "Paleta de comandos",
    exact: true,
  });
  const palette = page.getByRole("dialog", { name: "Paleta de comandos" });
  await trigger.click();
  await expect(palette).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(palette).toHaveCount(0);
  await trigger.click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(palette).toHaveCount(0);
  await trigger.click();
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await page.keyboard.press("Meta+k");
  await expect(palette).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("las rutas de creación conservan activa su sección comunitaria", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto("/ingresar/?next=%2Fc%2Fmar-del-plata%2Freclamos%2Fnuevo%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/reclamos\/nuevo\/$/);
  for (const [route, label] of [
    ["reclamos/nuevo", "Reclamos"],
    ["encuestas/nueva", "Encuestas"],
    ["debates/nuevo", "Debates"],
    ["proyectos/nuevo", "Proyectos"],
  ]) {
    await page.goto(`/c/mar-del-plata/${route}/`);
    const navigation = page.getByRole("navigation", {
      name: "Secciones de la comunidad",
    });
    const active = navigation.locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toContainText(label);
  }
});
