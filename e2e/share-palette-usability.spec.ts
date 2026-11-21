import { expect, test } from "@playwright/test";

const debatePath = "/debates/c0000000-0000-4000-8000-000000000001/";

test("compartir conserva el contenido ciudadano y localiza los tres canales al inglés", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { native: [] as ShareData[], windows: [] as string[] };
    Object.assign(window, { shareChannelTest: state });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        state.native.push(data);
      },
    });
    window.open = ((href?: string | URL) => {
      state.windows.push(String(href));
      return null;
    }) as typeof window.open;
  });
  await page.goto(`${debatePath}?lang=en`);
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              shareChannelTest: { native: ShareData[] };
            }
          ).shareChannelTest.native.length,
      ),
    )
    .toBe(1);
  const native = await page.evaluate(
    () =>
      (window as typeof window & { shareChannelTest: { native: ShareData[] } })
        .shareChannelTest.native[0],
  );
  expect(native.title).toBe(title);
  expect(native.text).toContain(title);
  expect(native.text).toContain("in Argentina");
  expect(native.text).toContain("See it here:");
  // D124: WhatsApp y Telegram viven detrás del desplegable de Compartir.
  await page.locator("[data-share-more]").click();
  await page.getByRole("button", { name: "WhatsApp", exact: true }).click();
  await page.getByRole("button", { name: "Telegram", exact: true }).click();
  // El primer clic carga el QRL: esperar el efecto antes de leer su resultado.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              shareChannelTest: { windows: string[] };
            }
          ).shareChannelTest.windows.length,
      ),
    )
    .toBe(2);
  const windows = await page.evaluate(
    () =>
      (window as typeof window & { shareChannelTest: { windows: string[] } })
        .shareChannelTest.windows,
  );
  expect(windows).toHaveLength(2);
  expect(new URL(windows[0]).searchParams.get("text")).toBe(native.text);
  expect(new URL(windows[1]).searchParams.get("text")).toBe(native.text);
});

test("compartir respeta la cancelación y recupera un fallo mediante copia confirmada", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      mode: "cancel",
      calls: 0,
      clipboardDenied: true,
      copied: "",
    };
    Object.assign(window, { nativeShareRecoveryTest: state });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        state.calls++;
        throw new DOMException(
          "Local share test",
          state.mode === "cancel" ? "AbortError" : "NotAllowedError",
        );
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (state.clipboardDenied)
            throw new DOMException("Denied", "NotAllowedError");
          state.copied = text;
        },
      },
    });
  });
  await page.goto(`${debatePath}?origen=prueba#contenido`);
  const share = page.getByRole("button", { name: "Compartir", exact: true });
  // D124: el grupo de compartir tiene su propio gancho; WhatsApp ya no es
  // hijo directo del contenedor que muestra alertas y copia manual.
  const group = page.locator("[data-share-group]");
  await share.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              nativeShareRecoveryTest: { calls: number };
            }
          ).nativeShareRecoveryTest.calls,
      ),
    )
    .toBe(1);
  await expect(group.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as typeof window & { nativeShareRecoveryTest: { mode: string } }
    ).nativeShareRecoveryTest.mode = "fail";
  });
  await share.click();
  await expect(group.getByRole("alert")).toHaveText(
    "No pudimos compartir. Podés volver a intentarlo o copiar el enlace.",
  );
  const copy = group.getByRole("button", {
    name: "Copiar enlace",
    exact: true,
  });
  await copy.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "No se pudo copiar el enlace" }),
  ).toBeVisible();
  await expect(copy).toBeVisible();
  const manual = group.getByRole("textbox", { name: "Enlace para compartir", exact: true });
  const canonical = new URL(debatePath.replace(/\/$/, ""), page.url()).href;
  await expect(manual).toHaveValue(canonical);
  await group.getByRole("button", { name: "Seleccionar enlace", exact: true }).click();
  await expect(manual).toBeFocused();
  expect(await manual.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, canonical.length]);
  await page.evaluate(() => {
    (
      window as typeof window & {
        nativeShareRecoveryTest: { clipboardDenied: boolean };
      }
    ).nativeShareRecoveryTest.clipboardDenied = false;
  });
  await copy.click();
  await expect(group.getByRole("alert")).toHaveCount(0);
  await expect(
    group.getByRole("button", { name: /¡Enlace copiado!/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            nativeShareRecoveryTest: { copied: string };
          }
        ).nativeShareRecoveryTest.copied,
    ),
  ).toBe(new URL(debatePath.replace(/\/$/, ""), page.url()).href);
});

test("la paleta bloquea resultados obsoletos y pendientes y permite reintentar una búsqueda fallida", async ({
  page,
}) => {
  await page.goto("/explorar/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", {
    name: "Paleta de comandos",
    exact: true,
  });
  const input = palette.getByRole("searchbox", {
    name: "Buscar comunidades y publicaciones",
    exact: true,
  });
  await input.fill("Argentina");
  await expect(
    palette.getByRole("button", { name: /Argentina/ }).first(),
  ).toBeVisible();
  const originalUrl = page.url();
  const endpoint = (url: URL) => url.searchParams.has("qfunc");
  let mode: "delay" | "fail" | "normal" = "delay";
  let blocked = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    if (mode === "delay") {
      blocked = true;
      await gate;
    }
    if (mode === "fail")
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Search unavailable",
      });
    else await route.continue();
  });
  try {
    await input.fill("Córdoba");
    await input.press("Enter");
    await expect(palette).toBeVisible();
    await expect(
      palette.getByRole("button", { name: /Argentina/ }),
    ).toHaveCount(0);
    await expect.poll(() => blocked).toBe(true);
    await input.press("Enter");
    await expect(palette).toBeVisible();
    expect(page.url()).toBe(originalUrl);
    mode = "normal";
    release();
    await expect(
      palette.getByRole("button", { name: /Córdoba/ }).first(),
    ).toBeVisible();
    mode = "fail";
    await input.fill("Mendoza");
    await expect(palette.getByRole("alert")).toContainText(
      "No pudimos buscar. Probá de nuevo.",
    );
    await expect(palette).not.toContainText("No se encontraron resultados");
    await input.press("Enter");
    await expect(palette).toBeVisible();
    mode = "normal";
    await palette
      .getByRole("button", { name: "Reintentar búsqueda", exact: true })
      .click();
    await expect(
      palette.getByRole("button", { name: /Mendoza/ }).first(),
    ).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/c\/mendoza\/?$/);
  } finally {
    release();
    await page.unroute(endpoint);
  }
});
