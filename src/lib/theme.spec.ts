import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyStorageKey, NON_STORAGE_LITERALS } from "./local-data";
import {
  THEME_CHANGED_EVENT,
  THEME_STORAGE_KEY,
  toggleColorScheme,
  type ThemeChangedDetail,
} from "./theme";

/**
 * `ThemeToggle` escucha `THEME_CHANGED_EVENT` en `window` para no quedar
 * desfasado cuando el tema se cambia desde la paleta de comandos.
 */
describe("toggleColorScheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBrowser(initiallyDark: boolean) {
    const classes = new Set(initiallyDark ? ["dark"] : []);
    const meta = { setAttribute: vi.fn() };
    const stored = new Map<string, string>();
    const target = new EventTarget();
    const received: ThemeChangedDetail[] = [];
    target.addEventListener(THEME_CHANGED_EVENT, (event) =>
      received.push((event as CustomEvent<ThemeChangedDetail>).detail),
    );
    vi.stubGlobal("window", target);
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => stored.set(key, value),
      getItem: (key: string) => stored.get(key) ?? null,
      removeItem: (key: string) => stored.delete(key),
    });
    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          contains: (name: string) => classes.has(name),
          toggle: (name: string, force: boolean) => {
            if (force) classes.add(name);
            else classes.delete(name);
            return force;
          },
        },
      },
      getElementById: () => meta,
    });
    return { classes, received };
  }

  it("anuncia en window el tema que quedó", () => {
    const { classes, received } = stubBrowser(false);

    expect(toggleColorScheme()).toBe(true);
    expect(classes.has("dark")).toBe(true);
    expect(toggleColorScheme()).toBe(false);

    expect(received).toEqual([{ dark: true }, { dark: false }]);
  });

  it("la clave guardada es la que lee el bootstrap de root.tsx", () => {
    expect(THEME_STORAGE_KEY).toBe("agorbis-theme");
    expect(classifyStorageKey(THEME_STORAGE_KEY)).toBe("device");
  });

  it("el evento figura como literal que no es una clave guardada", () => {
    expect(NON_STORAGE_LITERALS).toContain(THEME_CHANGED_EVENT);
  });
});
