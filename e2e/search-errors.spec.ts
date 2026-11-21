import { expect, test } from "@playwright/test";

test("el autocompletado distingue fallos de resultados vacíos y permite volver a buscar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/explorar/");
  const search = page.getByRole("combobox", {
    name: "Buscar comunidades y publicaciones",
  });
  const list = page.getByRole("listbox", { name: "Resultados de la búsqueda" });
  const endpoint = (url: URL) => url.searchParams.has("qfunc");
  await page.route(endpoint, (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Search unavailable",
    }),
  );
  await search.fill("cordoba");
  await expect(list).toContainText("No pudimos buscar. Probá de nuevo.");
  await expect(list).not.toContainText("No encontramos nada con ese nombre.");

  await page.unroute(endpoint);
  await search.fill("zzzxqbusquedasincoincidencia");
  await expect(list).toContainText("No encontramos nada con ese nombre.");
  await expect(list).not.toContainText("No pudimos buscar. Probá de nuevo.");
  await search.fill("argentina");
  await expect(
    list.getByRole("option", { name: /Argentina/ }).first(),
  ).toBeVisible();
});
