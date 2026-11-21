import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Tailwind descarta en silencio una clase que no sabe compilar: no hay error
 * de build ni de tipos. Así pasó con `bg-surface/90` o `border-subtle/80`,
 * cuando los tokens semánticos eran `@utility` fijas que no admiten opacidad,
 * y con nombres que nunca existieron (`bg-brand`, `border-border`). La
 * cabecera, la barra inferior y los menús quedaban transparentes y los chips
 * activos mostraban texto blanco sobre nada.
 *
 * La prueba compila `src/global.css` con la misma versión de Tailwind que usa
 * el build y le pregunta qué candidatos no producen CSS.
 */
const CSS_PATH = "src/global.css";

// Utilidades que llevan color: es donde un token mal escrito no deja rastro.
const COLOR_UTILITY =
  /^-?(bg|text|border(-[xytrblse])?|ring(-offset)?|outline|divide|from|via|to|fill|stroke|shadow|decoration|accent|caret|placeholder)-/;

// Palabras que coinciden con la forma de una utilidad sin ser clases.
const NOT_CLASSES = new Set([
  // Valor de `imageOrientation` en el saneamiento de fotos.
  "from-image",
  // Gancho del afiche: no tiene estilos propios.
  "community-poster-shell",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.spec\.tsx?$/.test(name) ? [path] : [];
  });
}

function utilityOf(token: string) {
  return token.split(":").pop()!.replace(/^!/, "");
}

function collectCandidates(css: string) {
  const customClasses = new Set(
    [...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]),
  );
  const found = new Map<string, Set<string>>();
  const add = (token: string, file: string) => {
    if (!found.has(token)) found.set(token, new Set());
    found.get(token)!.add(file);
  };

  for (const path of sourceFiles("src")) {
    const file = relative(process.cwd(), path);
    const source = readFileSync(path, "utf8");

    // En un atributo `class` literal, toda palabra es una clase.
    for (const match of source.matchAll(/class(?:Name)?=["']([^"']*)["']/g)) {
      for (const token of match[1].split(/\s+/)) {
        const utility = utilityOf(token);
        if (!token || /[${}]/.test(token)) continue;
        if (customClasses.has(utility) || /^(group|peer)(\/|$)/.test(utility))
          continue;
        add(token, file);
      }
    }

    // Las clases también viajan en constantes y en `cx(...)`: de cualquier
    // literal se toman sólo las que tienen forma de utilidad de color.
    for (const match of source.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/gs)) {
      for (const token of match[2].split(/\s+/)) {
        if (!token || /[${}"'`<>]/.test(token)) continue;
        if (!/^[a-z0-9!:[\]/.\-_%#(),=&>*@]+$/i.test(token)) continue;
        if (COLOR_UTILITY.test(utilityOf(token))) add(token, file);
      }
    }
  }

  for (const token of NOT_CLASSES) found.delete(token);
  return found;
}

describe("clases de Tailwind usadas en src", () => {
  let invalid: string[] = [];
  let checked = 0;

  beforeAll(async () => {
    const css = readFileSync(CSS_PATH, "utf8");
    const tailwindDir = dirname(
      createRequire(import.meta.url).resolve("tailwindcss/package.json"),
    );
    const designSystem = await __unstable__loadDesignSystem(css, {
      base: resolve("src"),
      loadStylesheet: async (id, base) => {
        const path =
          id === "tailwindcss"
            ? join(tailwindDir, "index.css")
            : resolve(base, id);
        return {
          path,
          base: dirname(path),
          content: readFileSync(path, "utf8"),
        };
      },
    });

    const candidates = collectCandidates(css);
    const tokens = [...candidates.keys()];
    const compiled = designSystem.candidatesToCss(tokens);
    checked = tokens.length;
    invalid = tokens
      .filter((_, index) => !compiled[index])
      .sort()
      .map((token) => `${token} (${[...candidates.get(token)!].join(", ")})`);
  });

  it("recorre una cantidad razonable de clases", () => {
    expect(checked).toBeGreaterThan(500);
  });

  it("todas generan CSS", () => {
    expect(invalid).toEqual([]);
  });
});
