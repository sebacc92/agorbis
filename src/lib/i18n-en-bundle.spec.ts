import { afterEach, describe, expect, it } from "vitest";
import { enMessages } from "~/i18n/en";
import { CATALOG_GLOBAL } from "./i18n-catalogs";

describe("entrada del catálogo inglés para el navegador", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[CATALOG_GLOBAL.en];
  });

  it("deja el catálogo completo en la global que lee i18n.ts", async () => {
    await import("./i18n-en-bundle");
    expect((globalThis as Record<string, unknown>)[CATALOG_GLOBAL.en]).toBe(
      enMessages,
    );
  });
});
