import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyStorageKey,
  clearPersonalLocalData,
  NON_STORAGE_LITERALS,
  PERSONAL_DATA_CLEARED_EVENT,
  type StorageLike,
} from "./local-data";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function memoryStorage(entries: Record<string, string>): StorageLike & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.spec\.tsx?$/.test(name)
      ? [path]
      : [];
  });
}

describe("clasificación de claves del almacenamiento local", () => {
  it("conserva tema, contraste y accesibilidad como preferencias del dispositivo", () => {
    expect(classifyStorageKey("agorbis-theme")).toBe("device");
    expect(classifyStorageKey("agorbis_high_contrast")).toBe("device");
    expect(classifyStorageKey("agorbis_a11y_font_scale")).toBe("device");
  });

  it("marca como personales los rastros de uso y el contenido propio", () => {
    for (const key of [
      "agorbis_rx_123",
      "agorbis-rx-abc",
      "agorbis_history_palermo",
      "agorbis_checklist_palermo",
      "agorbis_welcome_palermo",
      "agorbis_dismiss_guide_palermo",
      "agorbis:draft:user-1:claim:palermo",
      "agorbis:draft:claim:palermo",
      "agorbis_offline_claims_v1",
      "agorbis_bookmarks_v1",
      "agorbis_recent_searches",
    ]) {
      expect(classifyStorageKey(key), key).toBe("personal");
    }
  });

  it("no reclama claves ajenas y deja visible lo propio sin clasificar", () => {
    expect(classifyStorageKey("sb-proyecto-auth-token")).toBe("foreign");
    expect(classifyStorageKey("agorbis_algo_nuevo")).toBe("unclassified");
  });
});

describe("clearPersonalLocalData", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detiene escritores de forma síncrona antes de borrar, incluso sin claves guardadas", () => {
    const browser = new EventTarget();
    vi.stubGlobal("window", browser);
    let stopped = false;
    browser.addEventListener(PERSONAL_DATA_CLEARED_EVENT, () => { stopped = true; });
    const local = memoryStorage({ "agorbis:draft:u:claim:palermo": "privado" });
    const remove = local.removeItem.bind(local);
    local.removeItem = (key) => {
      expect(stopped).toBe(true);
      remove(key);
    };
    expect(clearPersonalLocalData([local])).toBe(1);
    stopped = false;
    expect(clearPersonalLocalData([local])).toBe(0);
    expect(stopped).toBe(true);
  });

  it("borra lo personal (y lo propio sin clasificar) y conserva el resto", () => {
    const local = memoryStorage({
      "agorbis-theme": "dark",
      agorbis_a11y_motion: "true",
      agorbis_high_contrast: "true",
      agorbis_rx_1: "{}",
      "agorbis-rx-2": "{}",
      "agorbis:draft:u:claim:palermo": "{}",
      agorbis_recent_searches: "[]",
      agorbis_algo_nuevo: "x",
      "otra-app": "x",
    });
    const session = memoryStorage({
      agorbis_emergency_dismiss_palermo: "id",
    });

    expect(clearPersonalLocalData([local, session])).toBe(6);
    expect([...local.data.keys()].sort()).toEqual([
      "agorbis-theme",
      "agorbis_a11y_motion",
      "agorbis_high_contrast",
      "otra-app",
    ]);
    expect(session.data.size).toBe(0);
  });

  it("no tira si un almacenamiento falla y sigue con el siguiente", () => {
    const broken: StorageLike = {
      get length(): number {
        throw new Error("SecurityError");
      },
      key: () => null,
      getItem: () => null,
      removeItem: () => undefined,
    };
    const ok = memoryStorage({ agorbis_rx_1: "{}" });
    expect(clearPersonalLocalData([broken, ok])).toBe(1);
    expect(ok.data.size).toBe(0);
  });

  it("sin navegador no hace nada", () => {
    expect(clearPersonalLocalData()).toBe(0);
  });
});

/**
 * Acceso al almacenamiento: directo o por los helpers de
 * `src/lib/browser-storage.ts`, que es por donde pasa casi todo ahora. Sin
 * contar los helpers, una clave nueva escrita con `writeStoredItem` se
 * saltearía este inventario.
 */
const STORAGE_ACCESS =
  /\b(localStorage|sessionStorage|readStoredItem|writeStoredItem|removeStoredItem|readStoredJson|writeStoredJson)\b/;
const STORAGE_CALL_WITH_LITERAL =
  /\b(?:(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)|readStoredItem|writeStoredItem|removeStoredItem|readStoredJson|writeStoredJson)\(\s*["'`]([^"'`$]*)/g;

describe("inventario de claves en src", () => {
  /**
   * Recorre todo archivo que use `localStorage`/`sessionStorage` y exige que
   * cada literal `agorbis…` (o su prefijo estático si es un template) esté
   * clasificado. Si este test falla, agregá la clave nueva en
   * `src/lib/local-data.ts` como preferencia del dispositivo o como personal.
   */
  it("toda clave propia usada en src está clasificada", () => {
    const unclassified: string[] = [];
    let filesWithStorage = 0;
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith(join("lib", "local-data.ts"))) continue;
      if (file.endsWith(join("lib", "browser-storage.ts"))) continue;
      const source = readFileSync(file, "utf8");
      if (!STORAGE_ACCESS.test(source)) continue;
      filesWithStorage += 1;
      for (const match of source.matchAll(/["'`](agorbis[^"'`$\s]*)/g)) {
        const literal = match[1] ?? "";
        if (NON_STORAGE_LITERALS.includes(literal)) continue;
        if (classifyStorageKey(literal) === "unclassified") {
          unclassified.push(`${relative(SRC, file)}: ${literal}`);
        }
      }
      // Una clave literal que no empiece con `agorbis` escaparía a la
      // limpieza por completo: también se rechaza.
      for (const match of source.matchAll(STORAGE_CALL_WITH_LITERAL)) {
        const literal = match[1] ?? "";
        if (classifyStorageKey(literal) === "foreign") {
          unclassified.push(`${relative(SRC, file)}: ${literal} (sin prefijo)`);
        }
      }
    }
    expect(filesWithStorage).toBeGreaterThan(10);
    expect(unclassified).toEqual([]);
  });

  it("también ve las claves que pasan por los helpers", () => {
    const sample = 'writeStoredItem("tema", "x"); readStoredJson(`agorbis_x_${id}`, g);';
    expect(STORAGE_ACCESS.test(sample)).toBe(true);
    const literals = [...sample.matchAll(STORAGE_CALL_WITH_LITERAL)].map(
      (match) => match[1],
    );
    expect(literals).toEqual(["tema", "agorbis_x_"]);
    expect(classifyStorageKey("tema")).toBe("foreign");
  });
});
