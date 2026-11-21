import { expect, test } from "@playwright/test";
import { qrSvgFor } from "../src/lib/qr";

test("el kit abre un afiche comunitario con QR local real y una impresión limpia", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && !["127.0.0.1", "localhost"].includes(url.hostname)) external.push(url.hostname);
  });
  await page.goto("/c/mar-del-plata/");
  await page.locator("[data-community-tools] > summary").click();
  await page.getByRole("button", { name: /Kit de Difusión y Recursos Vecinales/ }).click();
  await page.getByRole("button", { name: /Afiche Comunitario/ }).click();
  const link = page.getByRole("link", { name: "Imprimir afiche con QR", exact: true });
  await expect(link).toHaveAttribute("href", "/c/mar-del-plata/afiche");
  await link.click();
  await expect(page).toHaveURL(/\/c\/mar-del-plata\/afiche\/$/);
  const fullUrl = `${new URL(page.url()).origin}/c/mar-del-plata`;
  const qr = qrSvgFor(fullUrl);
  const poster = page.locator("#community-poster");
  await expect(poster.getByRole("heading", { name: "¡Vecinos de Mar del Plata!", exact: true })).toBeVisible();
  const image = poster.getByRole("img", { name: "Código QR para abrir la comunidad", exact: true });
  await expect(image).toHaveAttribute("viewBox", `0 0 ${qr.viewBox} ${qr.viewBox}`);
  await expect(image.locator("path")).toHaveAttribute("d", qr.path);
  await expect(poster.getByRole("link", { name: fullUrl, exact: true })).toHaveAttribute("href", fullUrl);
  await page.emulateMedia({ media: "print" });
  expect(await page.locator("header, footer, nav").evaluateAll((elements) => elements.every((element) => getComputedStyle(element).display === "none"))).toBe(true);
  await expect(poster).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir afiche (o Guardar como PDF)", exact: true })).toBeHidden();
  expect(external).toEqual([]);
});
