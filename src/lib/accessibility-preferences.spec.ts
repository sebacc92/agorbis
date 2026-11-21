import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  A11Y_BOOTSTRAP,
  A11Y_ROOT_CLASSES,
  A11Y_STORAGE_KEYS,
  countActiveA11yPreferences,
  DEFAULT_A11Y_PREFERENCES,
  parseA11yPreferences,
  prefersReducedMotion,
  stepFontScale,
} from "./accessibility-preferences";
import { classifyStorageKey } from "./local-data";

function reader(entries: Record<string, string>) {
  return (key: string) => entries[key] ?? null;
}

describe("parseA11yPreferences", () => {
  it("sin nada guardado devuelve lo predeterminado, con la vibración apagada", () => {
    expect(parseA11yPreferences(reader({}))).toEqual(DEFAULT_A11Y_PREFERENCES);
    expect(DEFAULT_A11Y_PREFERENCES.haptic).toBe(false);
  });

  it("la vibración se enciende sólo si alguien la eligió", () => {
    for (const [stored, expected] of [
      ["true", true],
      ["false", false],
      ["1", false],
    ] as const) {
      expect(
        parseA11yPreferences(reader({ [A11Y_STORAGE_KEYS.haptic]: stored }))
          .haptic,
        stored,
      ).toBe(expected);
    }
  });

  it("lee cada preferencia y descarta escalas fuera de la lista", () => {
    const prefs = parseA11yPreferences(
      reader({
        [A11Y_STORAGE_KEYS.fontScale]: "120",
        [A11Y_STORAGE_KEYS.highContrast]: "true",
        [A11Y_STORAGE_KEYS.sound]: "true",
        [A11Y_STORAGE_KEYS.haptic]: "false",
      }),
    );
    expect(prefs).toMatchObject({
      fontScale: 120,
      highContrast: true,
      dyslexia: false,
      sound: true,
      haptic: false,
    });
    expect(
      parseA11yPreferences(reader({ [A11Y_STORAGE_KEYS.fontScale]: "115" }))
        .fontScale,
    ).toBe(100);
  });
});

describe("stepFontScale", () => {
  it("avanza de a un paso y se queda en los extremos", () => {
    expect(stepFontScale(100, 1)).toBe(110);
    expect(stepFontScale(100, -1)).toBe(90);
    expect(stepFontScale(90, -1)).toBe(90);
    expect(stepFontScale(130, 1)).toBe(130);
    expect(stepFontScale(777, 1)).toBe(110);
  });
});

describe("countActiveA11yPreferences", () => {
  it("cuenta cada cambio respecto de lo predeterminado, vibración incluida", () => {
    expect(countActiveA11yPreferences(DEFAULT_A11Y_PREFERENCES)).toBe(0);
    expect(
      countActiveA11yPreferences({
        ...DEFAULT_A11Y_PREFERENCES,
        haptic: true,
      }),
    ).toBe(1);
    expect(
      countActiveA11yPreferences({
        ...DEFAULT_A11Y_PREFERENCES,
        fontScale: 110,
        dyslexia: true,
        sound: true,
      }),
    ).toBe(3);
  });
});

describe("prefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(rootClasses: string[], systemReduce: boolean) {
    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)" && systemReduce,
      }),
    });
    vi.stubGlobal("document", {
      documentElement: {
        classList: { contains: (name: string) => rootClasses.includes(name) },
      },
    });
  }

  it("respeta el interruptor del panel aunque el sistema permita animar", () => {
    stub([A11Y_ROOT_CLASSES.reducedMotion], false);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("el interruptor del panel también frena el desplazamiento suave de la raíz", () => {
    const css = readFileSync("src/global.css", "utf8");
    const rule = css.match(
      /((?:html\.civic-reduced-motion[^,{]*,\s*)*html\.civic-reduced-motion[^,{]*)\{([^}]*)\}/,
    );
    expect(rule).not.toBeNull();
    const selectors = rule![1].split(",").map((selector) => selector.trim());
    expect(selectors).toContain("html.civic-reduced-motion");
    expect(rule![2]).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  it("respeta la preferencia del sistema", () => {
    stub([], true);
    expect(prefersReducedMotion()).toBe(true);
    stub([], false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("claves y bootstrap", () => {
  it("todas las claves son preferencias del dispositivo (sobreviven a la limpieza)", () => {
    for (const key of Object.values(A11Y_STORAGE_KEYS)) {
      expect(classifyStorageKey(key), key).toBe("device");
    }
  });

  it("el bootstrap aplica escala y clases a <html> según lo guardado", () => {
    const classes = new Set<string>();
    const html = {
      style: { fontSize: "" },
      classList: { add: (name: string) => classes.add(name) },
    };
    const stored: Record<string, string> = {
      [A11Y_STORAGE_KEYS.fontScale]: "130",
      [A11Y_STORAGE_KEYS.dyslexia]: "true",
      [A11Y_STORAGE_KEYS.enhancedFocus]: "true",
      [A11Y_STORAGE_KEYS.highContrast]: "false",
    };
    const fakeStorage = { getItem: (key: string) => stored[key] ?? null };
    // Es el mismo texto que va inline en el <head>; se lo evalúa con un
    // documento y un almacenamiento de mentira.
    new Function("localStorage", "document", A11Y_BOOTSTRAP)(fakeStorage, {
      documentElement: html,
    });
    expect(html.style.fontSize).toBe("130%");
    expect([...classes].sort()).toEqual(
      [A11Y_ROOT_CLASSES.dyslexia, A11Y_ROOT_CLASSES.enhancedFocus].sort(),
    );
  });

  it("con escala 100 no toca el tamaño de letra", () => {
    const html = { style: { fontSize: "" }, classList: { add: () => {} } };
    new Function("localStorage", "document", A11Y_BOOTSTRAP)(
      { getItem: () => "100" },
      { documentElement: html },
    );
    expect(html.style.fontSize).toBe("");
  });
});

/** Contenido entre las llaves del primer bloque que abre con `opener`. */
function cssBlock(css: string, opener: string): string {
  const start = css.indexOf(`${opener} {`);
  if (start < 0) throw new Error(`no está el bloque ${opener}`);
  let depth = 0;
  for (let index = css.indexOf("{", start); index < css.length; index++) {
    if (css[index] === "{") depth++;
    if (css[index] === "}" && --depth === 0) {
      return css.slice(css.indexOf("{", start) + 1, index);
    }
  }
  throw new Error(`bloque ${opener} sin cerrar`);
}

function declarations(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

describe("alto contraste", () => {
  const css = readFileSync("src/global.css", "utf8");
  const media = cssBlock(css, "@media (prefers-contrast: more)");
  const root = `html.${A11Y_ROOT_CLASSES.highContrast}`;

  // El panel pone una clase y el sistema operativo activa un media query:
  // las dos vías tienen que subir los mismos tokens, en claro y en oscuro.
  it("la opción del panel sube los mismos tokens que la del sistema", () => {
    const light = declarations(cssBlock(media, ":root"));
    const dark = declarations(cssBlock(media, ".dark"));
    expect(Object.keys(light)).toContain("--ink-muted");
    expect(declarations(cssBlock(css, root))).toEqual(light);
    expect(declarations(cssBlock(css, `${root}.dark`))).toEqual(dark);
  });

  it("también engrosa el foco", () => {
    expect(cssBlock(css, `${root} :focus-visible`)).toContain(
      "outline-width: 3px",
    );
  });
});

describe("atajos de una sola tecla", () => {
  it("vienen encendidos y sólo \"false\" los apaga; apagarlos cuenta como preferencia", async () => {
    const {
      parseA11yPreferences,
      countActiveA11yPreferences,
      DEFAULT_A11Y_PREFERENCES,
      A11Y_STORAGE_KEYS,
    } = await import("./accessibility-preferences");
    expect(parseA11yPreferences(() => null).shortcuts).toBe(true);
    expect(
      parseA11yPreferences((key) =>
        key === A11Y_STORAGE_KEYS.shortcuts ? "no" : null,
      ).shortcuts,
    ).toBe(true);
    const off = parseA11yPreferences((key) =>
      key === A11Y_STORAGE_KEYS.shortcuts ? "false" : null,
    );
    expect(off.shortcuts).toBe(false);
    expect(countActiveA11yPreferences(DEFAULT_A11Y_PREFERENCES)).toBe(0);
    expect(countActiveA11yPreferences(off)).toBe(1);
  });
});
