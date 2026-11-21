import { expect, test, type Page } from "@playwright/test";

async function expectNoNavigation(page: Page, action: () => Promise<void>) {
  const initial = page.url();
  // Esperamos la ventana completa: una comprobación inmediata podría pasar
  // antes de que el listener reanudable terminara de procesar el teclado.
  const navigation = page
    .waitForURL((url) => url.href !== initial, { timeout: 800 })
    .then(
      () => true,
      (error: Error) => {
        if (error.name === "TimeoutError") return false;
        throw error;
      },
    );
  await action();
  expect(await navigation).toBe(false);
}

test("los atajos globales respetan diálogos, modificadores y composición", async ({
  page,
}) => {
  await page.goto("/explorar/");
  // Cargar el listener antes de comprobar que las siguientes teclas se ignoran.
  await page.keyboard.press("?");
  const help = page.getByRole("dialog", { name: "Atajos de teclado rápidos" });
  await expect(help).toBeVisible();
  await expectNoNavigation(page, async () => {
    await page.keyboard.press("h");
    await page.keyboard.press("e");
    await page.keyboard.press("?");
  });
  await expect(help).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);

  await page
    .locator("footer")
    .getByRole("button", { name: "Opciones de accesibilidad cívica" })
    .click();
  const preferences = page.getByRole("dialog", {
    name: "Preferencias de accesibilidad",
  });
  await expect(preferences).toBeVisible();
  const close = preferences.getByRole("button", {
    name: "Cerrar opciones de accesibilidad",
  });
  await close.focus();
  await expectNoNavigation(page, async () => {
    for (const key of ["h", "e", "?", "/"]) await page.keyboard.press(key);
  });
  await expect(close).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(preferences).toHaveCount(0);

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await expectNoNavigation(page, async () => {
    await page.evaluate(() => {
      for (const key of ["h", "e", "?", "/"]) {
        for (const blocked of [
          { altKey: true },
          { ctrlKey: true },
          { metaKey: true },
          { isComposing: true },
          { keyCode: 229 },
        ]) {
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, ...blocked }),
          );
        }
      }
    });
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("?");
  await expect(help).toBeVisible();
});

test("el panel de accesibilidad conserva contraste y controles de 44px al 90 y 130 por ciento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/explorar/");
  const trigger = page
    .locator("footer")
    .getByRole("button", { name: "Opciones de accesibilidad cívica" });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Preferencias de accesibilidad",
  });
  await expect(dialog).toBeVisible();
  const highContrast = dialog.getByRole("button", { name: /Alto contraste/ });
  await highContrast.click();
  await expect(highContrast).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      highContrast.evaluate((button) => {
        const style = getComputedStyle(button);
        const luminance = (color: string) => {
          const rgb = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map((value) => {
              const channel = Number(value) / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const background = luminance(style.backgroundColor);
        const foreground = luminance(style.color);
        return (
          (Math.max(background, foreground) + 0.05) /
          (Math.min(background, foreground) + 0.05)
        );
      }),
    )
    .toBeGreaterThanOrEqual(4.5);

  const decrease = dialog.getByRole("button", {
    name: "Disminuir tamaño de texto",
  });
  const increase = dialog.getByRole("button", {
    name: "Aumentar tamaño de texto",
  });
  for (const scale of [90, 130]) {
    if (scale === 90) await decrease.click();
    else for (let index = 0; index < 4; index++) await increase.click();
    await expect(dialog).toContainText(`${scale}%`);
    expect(
      await dialog.evaluate((panel) => panel.scrollWidth <= panel.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
    for (const button of await dialog.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    }
  }
  await dialog.evaluate((panel) => {
    panel.scrollTop = 0;
  });
  await page.screenshot({ path: "/tmp/agorbis-round7-accessibility.png" });
  await dialog
    .getByRole("button", { name: "Restablecer preferencias" })
    .click();
  await expect(dialog).toContainText("100%");
  await expect(highContrast).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("el carrusel de hitos omite las acciones ocultas y anuncia la selección", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/c/earth/");
  await page.locator("details[data-community-tools] > summary").click();
  const carousel = page.getByRole("region", {
    name: "Hitos de Tierra",
  });
  await expect(carousel).toBeVisible();
  const slides = carousel
    .locator("div[aria-hidden]")
    .filter({ has: page.locator("h3") });
  const indicators = carousel.getByRole("button", { name: /^Ir al hito/ });
  await expect(indicators).toHaveCount(6);
  const currentSlide = carousel
    .locator('div[aria-hidden="false"]')
    .filter({ has: page.locator("h3") });
  await currentSlide.getByRole("button").focus();
  await page.keyboard.press("Tab");
  await expect(indicators.first()).toBeFocused();
  await indicators.nth(1).click();
  await expect(carousel.getByRole("status")).toHaveText(
    "Hito 2 de 6: Primeros 10 vecinos",
  );
  await expect(indicators.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(carousel.locator('button[aria-current="true"]')).toHaveCount(1);
  for (let index = 0; index < 6; index++) {
    await expect(slides.nth(index)).toHaveJSProperty("inert", index !== 1);
  }
  const currentAction = currentSlide.locator("button, a").first();
  await currentAction.focus();
  await page.keyboard.press("Tab");
  await expect(indicators.first()).toBeFocused();
  for (const control of [
    carousel.getByRole("button", { name: "Hito anterior", exact: true }),
    carousel.getByRole("button", { name: "Siguiente hito", exact: true }),
    currentAction,
    ...(await indicators.all()),
  ]) {
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(
    await carousel.evaluate(
      (section) => section.scrollWidth <= section.clientWidth,
    ),
  ).toBe(true);
});
