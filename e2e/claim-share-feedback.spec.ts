import { expect, test, type Locator } from "@playwright/test";

async function swipeToShare(card: Locator) {
  await card.evaluate((target) => {
    const event = new Event("touchstart", { bubbles: true });
    Object.assign(event, { touches: [{ clientX: 280, clientY: 160 }] });
    target.dispatchEvent(event);
  });
  await expect(card).toHaveCSS("transition-duration", "0s");
  await card.evaluate((target) => {
    const event = new Event("touchmove", { bubbles: true });
    Object.assign(event, { touches: [{ clientX: 80, clientY: 160 }] });
    target.dispatchEvent(event);
  });
  await expect(card).toHaveCSS("transform", "matrix(1, 0, 0, 1, -84, 0)");
  await card.dispatchEvent("touchend");
}

test("el gesto de compartir informa fallos y copias reales y respeta la cancelación", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Object.assign(window, { claimShareTest: { mode: "failed", shared: 0, copied: "" } });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        const state = (window as typeof window & { claimShareTest: { mode: string; shared: number } }).claimShareTest;
        state.shared++;
        throw new DOMException("Test share response", state.mode === "cancelled" ? "AbortError" : "NotAllowedError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => {
        (window as typeof window & { claimShareTest: { copied: string } }).claimShareTest.copied = text;
      } },
    });
  });
  await page.goto("/c/mar-del-plata/reclamos/");
  const card = page.locator('div[style*="translateX"]', { has: page.locator('a[href^="/reclamos/"]') }).first();
  await card.scrollIntoViewIfNeeded();
  await swipeToShare(card);
  const errorToast = page.getByRole("alert").filter({ hasText: "No pudimos compartir el reclamo. Abrilo para volver a intentarlo." });
  await expect(errorToast).toBeVisible();
  await errorToast.getByRole("button", { name: "Cerrar notificación" }).click();

  await page.evaluate(() => {
    (window as typeof window & { claimShareTest: { mode: string } }).claimShareTest.mode = "cancelled";
  });
  await swipeToShare(card);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { claimShareTest: { shared: number } }).claimShareTest.shared)).toBe(2);
  await expect(errorToast).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "¡Gracias por compartir!" })).toHaveCount(0);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
  await swipeToShare(card);
  await expect(page.getByRole("status").filter({ hasText: "Enlace copiado al portapapeles" })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { claimShareTest: { copied: string } }).claimShareTest.copied)).toMatch(/\/reclamos\/[a-f0-9-]+$/);
});
