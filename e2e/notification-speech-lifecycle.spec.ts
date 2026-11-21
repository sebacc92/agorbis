import { expect, test } from "@playwright/test";

test("el resumen deja de hablar al salir de notificaciones mediante navegación interna", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const state = { active: false, cancelled: 0, spoken: 0 };
    Object.assign(window, { notificationSpeechTest: state });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel() { state.active = false; state.cancelled++; },
        speak() { state.active = true; state.spoken++; },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class {
        constructor(public text: string) {}
        lang = "";
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
      },
    });
  });
  await page.goto("/ingresar/?next=%2Fnotificaciones%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/notificaciones\/?$/);
  await page.getByRole("button", { name: "Escuchar resumen auditivo", exact: true }).click();
  await expect(page.getByRole("button", { name: "Detener audio", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { notificationSpeechTest: { active: boolean } }).notificationSpeechTest.active)).toBe(true);

  await page.getByRole("link", { name: "Inicio", exact: true }).first().click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { notificationSpeechTest: { active: boolean } }).notificationSpeechTest.active)).toBe(false);
  expect(await page.evaluate(() => (window as typeof window & { notificationSpeechTest: { cancelled: number; spoken: number } }).notificationSpeechTest)).toMatchObject({ cancelled: 2, spoken: 1 });
});
