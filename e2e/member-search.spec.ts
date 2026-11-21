import { expect, test } from "@playwright/test";

test("la búsqueda de miembros aplica nombre y foto en la URL y permite recuperar un resultado vacío", async ({
  page,
}) => {
  await page.goto("/c/caba/miembros/");
  const form = page.getByRole("search", { name: "Buscar miembros públicos" });
  const query = form.getByRole("searchbox", {
    name: "Buscar vecino por nombre o usuario",
  });
  await query.fill("Elena");
  await form.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "Elena");
  await expect(query).toHaveValue("Elena");
  await expect(
    page.getByRole("link", { name: /Elena Bosch.*@elena_caba/ }),
  ).toBeVisible();
  const summary = page
    .locator('section[aria-labelledby="miembros-titulo"]')
    .getByText("1 persona visible", { exact: false });
  await expect(summary).toBeVisible();

  await page.getByRole("link", { name: /Con foto de perfil/ }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "Elena" &&
      url.searchParams.get("foto") === "1",
  );
  await expect(query).toHaveValue("Elena");
  await expect(
    page.getByText("No hay miembros públicos con estos filtros.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(summary).toBeVisible();
  await query.fill("Sin coincidencias");
  await form.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === "Sin coincidencias" &&
      url.searchParams.get("foto") === "1",
  );
  await page
    .getByRole("link", { name: "Limpiar filtros", exact: true })
    .click();
  await expect(page).toHaveURL(
    (url) => !url.searchParams.has("q") && !url.searchParams.has("foto"),
  );
  await expect(query).toHaveValue("");
  await expect(
    page.getByRole("link", { name: /Elena Bosch.*@elena_caba/ }),
  ).toBeVisible();
});
