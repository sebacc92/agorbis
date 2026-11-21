import { describe, expect, it, vi } from "vitest";
import { CATALOG_GLOBAL, createCatalogRegistry } from "./i18n-catalogs";
import { loadLocaleMessages, translate } from "./i18n";

const SOURCE = { url: "/assets/i18n-en-bundle-test.js", global: "__testEn" };

describe("registro de catálogos", () => {
  it("carga el catálogo una sola vez y lo deja disponible de forma síncrona", async () => {
    const scope: Record<string, unknown> = {};
    const importModule = vi.fn(async () => {
      scope[SOURCE.global] = { Inicio: "Home" };
    });
    const registry = createCatalogRegistry({
      initial: { es: {} },
      sources: { en: SOURCE },
      importModule,
      scope,
    });

    expect(registry.get("en")).toBeUndefined();
    const [first, second] = await Promise.all([
      registry.load("en"),
      registry.load("en"),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(importModule).toHaveBeenCalledOnce();
    expect(importModule).toHaveBeenCalledWith(SOURCE.url);
    expect(registry.get("en")).toEqual({ Inicio: "Home" });
    // La global es sólo un canal de entrega: no queda colgada.
    expect(scope).not.toHaveProperty(SOURCE.global);
    expect(await registry.load("en")).toBe(true);
    expect(importModule).toHaveBeenCalledOnce();
  });

  it("no descarga nada para un idioma que ya viene en el bundle", async () => {
    const importModule = vi.fn();
    const registry = createCatalogRegistry({
      initial: { es: {}, en: { Inicio: "Home" } },
      sources: { en: SOURCE },
      importModule,
    });

    expect(await registry.load("es")).toBe(true);
    expect(await registry.load("en")).toBe(true);
    expect(importModule).not.toHaveBeenCalled();
  });

  it("una falla de red no rechaza y permite reintentar", async () => {
    const scope: Record<string, unknown> = {};
    const warn = vi.fn();
    const importModule = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementationOnce(async () => {
        scope[SOURCE.global] = { Inicio: "Home" };
      });
    const registry = createCatalogRegistry({
      initial: { es: {} },
      sources: { en: SOURCE },
      importModule,
      scope,
      warn,
    });

    expect(await registry.load("en")).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(registry.get("en")).toBeUndefined();
    expect(await registry.load("en")).toBe(true);
    expect(registry.get("en")).toEqual({ Inicio: "Home" });
  });

  it("un archivo que no dejó catálogo cuenta como falla", async () => {
    const registry = createCatalogRegistry({
      initial: { es: {} },
      sources: { en: SOURCE },
      importModule: async () => undefined,
      scope: {},
    });

    expect(await registry.load("en")).toBe(false);
    expect(registry.get("en")).toBeUndefined();
  });

  it("la entrada del catálogo usa la global que espera el registro", () => {
    expect(CATALOG_GLOBAL.en).toBe("__agorbisMessagesEn");
  });
});

describe("translate en el servidor", () => {
  it("tiene el catálogo inglés sin cargar nada", async () => {
    expect(translate("en", "Saltar al contenido")).toBe("Skip to content");
    expect(await loadLocaleMessages("en")).toBe(true);
  });

  it("el español es el texto fuente e interpola parámetros", () => {
    expect(translate("es", "Saltar al contenido")).toBe("Saltar al contenido");
    expect(translate("en", "Menú de {{name}}", { name: "Ana" })).toBe(
      "Ana menu",
    );
    expect(translate("en", "texto sin traducción {{x}}")).toBe(
      "texto sin traducción {{x}}",
    );
  });
});
