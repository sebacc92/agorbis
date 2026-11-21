import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isStringArray,
  readStoredItem,
  readStoredJson,
  removeStoredItem,
  writeStoredItem,
  writeStoredJson,
} from "./browser-storage";

function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sin almacenamiento (SSR)", () => {
  it("leer devuelve null y escribir devuelve false, sin tirar", () => {
    expect(readStoredItem("agorbis-theme")).toBeNull();
    expect(writeStoredItem("agorbis-theme", "dark")).toBe(false);
    expect(removeStoredItem("agorbis-theme")).toBe(false);
    expect(readStoredJson("agorbis_recent_searches", isStringArray)).toBeNull();
    expect(writeStoredJson("agorbis_recent_searches", [])).toBe(false);
  });
});

describe("con almacenamiento", () => {
  it("lee, escribe y borra texto en local y en session por separado", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);

    expect(writeStoredItem("agorbis-theme", "dark")).toBe(true);
    expect(writeStoredItem("agorbis_rx_1", "x", "session")).toBe(true);
    expect(readStoredItem("agorbis-theme")).toBe("dark");
    expect(readStoredItem("agorbis-theme", "session")).toBeNull();
    expect(readStoredItem("agorbis_rx_1", "session")).toBe("x");

    expect(removeStoredItem("agorbis-theme")).toBe(true);
    expect(local.data.size).toBe(0);
    expect(session.data.size).toBe(1);
  });

  it("guarda JSON y lo valida al leer", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(writeStoredJson("agorbis_recent_searches", ["bache", "luz"])).toBe(
      true,
    );
    expect(readStoredJson("agorbis_recent_searches", isStringArray)).toEqual([
      "bache",
      "luz",
    ]);
  });

  it("descarta JSON roto o con otra forma", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("agorbis_recent_searches", "{no es json");
    expect(readStoredJson("agorbis_recent_searches", isStringArray)).toBeNull();
    storage.setItem("agorbis_recent_searches", JSON.stringify([1, 2]));
    expect(readStoredJson("agorbis_recent_searches", isStringArray)).toBeNull();
    storage.setItem("agorbis_recent_searches", "");
    expect(readStoredJson("agorbis_recent_searches", isStringArray)).toBeNull();
  });

  it("no tira si el valor no se puede serializar", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(writeStoredJson("agorbis_checklist_x", circular)).toBe(false);
  });
});

describe("almacenamiento bloqueado", () => {
  it("absorbe el SecurityError del getter y la cuota llena", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(readStoredItem("agorbis-theme")).toBeNull();
    expect(writeStoredItem("agorbis-theme", "dark")).toBe(false);
    expect(removeStoredItem("agorbis-theme")).toBe(false);
  });

  it("absorbe el error al acceder al objeto mismo", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      },
    });
    try {
      expect(readStoredItem("agorbis_rx_1", "session")).toBeNull();
      expect(writeStoredItem("agorbis_rx_1", "x", "session")).toBe(false);
    } finally {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });
});

describe("guards", () => {
  it("isStringArray", () => {
    expect(isStringArray(["a"])).toBe(true);
    expect(isStringArray([])).toBe(true);
    expect(isStringArray(["a", 1])).toBe(false);
    expect(isStringArray("a")).toBe(false);
  });
});
