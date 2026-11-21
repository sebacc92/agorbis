import { expect, test } from "@playwright/test";

test("la vista de proyectos conserva filtros, recarga e historial", async ({
  page,
}) => {
  const cursor = new URLSearchParams({
    antes: "2099-01-01T00:00:00Z",
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  });
  await page.goto(
    `/c/mar-del-plata/proyectos/?estado=apoyo&vista=agenda&${cursor}`,
  );
  const views = page.getByRole("navigation", { name: "Vista de proyectos" });
  const agenda = views.getByRole("link", { name: "Agenda comunitaria" });
  const grid = views.getByRole("link", { name: "Cuadrícula" });
  await expect(agenda).toHaveAttribute("aria-current", "page");
  await expect(agenda).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await grid.click();
  await expect(page).not.toHaveURL(/vista=agenda/);
  await expect(page).toHaveURL(/estado=apoyo/);
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("antes") === cursor.get("antes") &&
      url.searchParams.get("id") === cursor.get("id"),
  );
  await expect(grid).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(agenda).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(agenda).toHaveAttribute("aria-current", "page");
  await page
    .getByRole("navigation", { name: "Filtrar proyectos por estado" })
    .getByRole("link", { name: "Todos", exact: true })
    .click();
  await expect(page).toHaveURL(/vista=agenda/);
  await expect(page).not.toHaveURL(/estado=/);
  await expect(page).toHaveURL(
    (url) => !url.searchParams.has("antes") && !url.searchParams.has("id"),
  );
  await expect(agenda).toHaveAttribute("aria-current", "page");
});
