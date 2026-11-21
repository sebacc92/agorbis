import { expect, test, type Page } from "@playwright/test";

async function globalStyles(page: Page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return {
      fontFamily: body.fontFamily,
      backgroundColor: body.backgroundColor,
      color: body.color,
      margin: body.margin,
    };
  });
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 320, height: 740 },
]) {
  test(`los estilos sobreviven a navegación SPA e historial (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/ingresar/", { waitUntil: "load" });

    const styles = await globalStyles(page);
    expect(styles.fontFamily).toContain("sans-serif");
    expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    const stylesheets = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLLinkElement).href),
      );
    expect(stylesheets.length).toBeGreaterThan(0);
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const homeTitle = "Agorbis · Unir a la humanidad, una comunidad a la vez";

    async function expectStyledRoute(path: string, title: string) {
      await expect(page).toHaveURL(
        (url) => url.pathname.replace(/\/$/, "") === path.replace(/\/$/, ""),
      );
      await expect(page).toHaveTitle(title);
      const canonical = new URL(page.url());
      canonical.search = "";
      canonical.hash = "";
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        canonical.href,
      );
      await expect(page.locator(".animate-route-progress")).toHaveCount(0);
      // Un reload completo ocultaría la regresión al volver a cargar el CSS.
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(
        timeOrigin,
      );
      expect(await globalStyles(page)).toEqual(styles);
      const activeStylesheets = await page.evaluate(() =>
        [...document.styleSheets]
          .filter((sheet) => !sheet.disabled)
          .map((sheet) => sheet.href),
      );
      expect(activeStylesheets).toEqual(expect.arrayContaining(stylesheets));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
    }

    await page.locator('main a[href^="/registro"]').first().click();
    await expectStyledRoute("/registro", "Crear cuenta · Agorbis");
    // Los enlaces legales de auth abren otra pestaña para conservar el form.
    // El logo y el footer público permiten comprobar navegación SPA real.
    await page.locator('header a[href="/"]').click();
    await expectStyledRoute("/", homeTitle);
    await page.locator('footer a[href="/privacidad"]').click();
    await expectStyledRoute("/privacidad", "Política de privacidad · Agorbis");
    await page.goBack();
    await expectStyledRoute("/", homeTitle);
    await page.goBack();
    await expectStyledRoute("/registro", "Crear cuenta · Agorbis");
    await page.goBack();
    await expectStyledRoute("/ingresar", "Ingresar · Agorbis");
    await page.goForward();
    await expectStyledRoute("/registro", "Crear cuenta · Agorbis");
    await page.goForward();
    await expectStyledRoute("/", homeTitle);
    await page.goForward();
    await expectStyledRoute("/privacidad", "Política de privacidad · Agorbis");
  });
}
