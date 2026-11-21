import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  csvField,
  escapeXml,
  excerptAround,
  highlightSegments,
  stripInvalidXmlChars,
  summarizeText,
  xmlText,
} from "./text";

describe("text.ts como archivo de texto", () => {
  // Un NUL literal hace que git trate el archivo como binario y esconda los
  // diffs del escapado XML/CSV, justo el código que más conviene revisar.
  it("no contiene bytes NUL ni otros controles fuera de tab y saltos", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./text.ts", import.meta.url)),
      "utf8",
    );
    // eslint-disable-next-line no-control-regex -- se buscan los controles a propósito.
    expect(source).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });
});

describe("U+0000 en los ayudantes", () => {
  it("escapeXml no lo toca: escapa, no descarta", () => {
    expect(escapeXml("a\u0000<b>")).toBe("a\u0000&lt;b&gt;");
  });

  it("csvField lo conserva entre comillas, como cualquier otro carácter", () => {
    expect(csvField("a\u0000b")).toBe('"a\u0000b"');
  });

  it("el signo combinante suelto se pliega a U+0000 sin correr los índices", () => {
    // Si el plegado lo descartara, el texto plegado quedaría un carácter más
    // corto y el resaltado cortaría el original corrido una posición.
    const segments = highlightSegments("\u0301 plaza", "plaza");
    expect(segments.map((s) => s.text).join("")).toBe("\u0301 plaza");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual([
      "plaza",
    ]);
  });
});

describe("highlightSegments con caracteres fuera del plano básico", () => {
  it("un emoji antes del término no corre el resaltado", () => {
    const segments = highlightSegments("🌳 plaza", "plaza");
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual([
      "plaza",
    ]);
    expect(segments.map((s) => s.text).join("")).toBe("🌳 plaza");
  });
});

describe("stripInvalidXmlChars / xmlText", () => {
  it("quita controles C0, sustitutos sueltos y no-caracteres", () => {
    expect(stripInvalidXmlChars("a\u0000b\u0001c\u001Fd")).toBe("abcd");
    expect(stripInvalidXmlChars("x\uD800y")).toBe("xy");
    expect(stripInvalidXmlChars("x\uFFFEy\uFFFF")).toBe("xy");
  });

  it("conserva tabulación, saltos, acentos y emoji", () => {
    const ok = "tab\tlf\ncr\rñandú 🌳";
    expect(stripInvalidXmlChars(ok)).toBe(ok);
  });

  it("xmlText sanea y escapa", () => {
    expect(xmlText('<a href="x">\u0000&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("summarizeText para extractos de feeds", () => {
  it("recorta en 280 y marca el corte", () => {
    const long = "a".repeat(400);
    const excerpt = summarizeText(long, 280);
    expect([...excerpt].length).toBe(281);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("excerptAround deja la coincidencia dentro del extracto", () => {
  // Más de dos líneas de tarjeta sin el término que se busca en cada caso.
  const relleno =
    "Este texto largo empuja lo buscado bastante más allá de las dos líneas visibles del extracto, hasta que";

  // Una mitad de pareja de sustitución sin su otra mitad.
  const SUSTITUTO_SUELTO =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

  it("devuelve el texto igual sin coincidencia, sin términos o con ella al principio", () => {
    const alPrincipio = `Agua potable para el barrio. ${relleno}`;
    expect(excerptAround(alPrincipio, "agua")).toBe(alPrincipio);
    expect(excerptAround(alPrincipio, "zzz")).toBe(alPrincipio);
    expect(excerptAround(alPrincipio, "")).toBe(alPrincipio);
    // Justo en el límite de `lead` todavía entra sin cortar.
    const enElLimite = `${"x".repeat(39)} agua`;
    expect(excerptAround(enElLimite, "agua", 40)).toBe(enElLimite);
  });

  it("corta antes de la coincidencia sin partir palabras y lo marca con …", () => {
    const texto = `${relleno} falta agua en la cuadra.`;
    const extracto = excerptAround(texto, "agua", 40);
    expect(extracto.startsWith("…")).toBe(true);
    const resto = extracto.slice(1);
    // Es el final del original y arranca justo después de un espacio.
    expect(texto.endsWith(resto)).toBe(true);
    expect(texto[texto.length - resto.length - 1]).toMatch(/\s/);
    expect(resto.indexOf("agua")).toBeGreaterThanOrEqual(0);
    expect(resto.indexOf("agua")).toBeLessThanOrEqual(40);
  });

  it("encuentra sin acentos ni mayúsculas y conserva el original", () => {
    const texto = `${relleno} el centro de Córdoba.`;
    const extracto = excerptAround(texto, "CORDOBA");
    expect(extracto.startsWith("…")).toBe(true);
    expect(
      highlightSegments(extracto, "CORDOBA")
        .filter((s) => s.match)
        .map((s) => s.text),
    ).toEqual(["Córdoba"]);
  });

  it("se acerca a la primera coincidencia de cualquiera de los términos", () => {
    const texto = `${relleno} luz, y mucho después ${relleno} agua.`;
    const extracto = excerptAround(texto, "agua luz", 40);
    // Sin la cota de abajo pasaría aunque mirara sólo "agua": el corte cerca
    // del final deja "luz" afuera e indexOf da -1.
    expect(extracto.slice(1).indexOf("luz")).toBeGreaterThanOrEqual(0);
    expect(extracto.slice(1).indexOf("luz")).toBeLessThanOrEqual(40);
  });

  it("no parte emojis ni deja sustitutos sueltos", () => {
    const texto = `${"🌳 ".repeat(30)}plaza`;
    const extracto = excerptAround(texto, "plaza", 40);
    expect(extracto.startsWith("…")).toBe(true);
    expect(texto.endsWith(extracto.slice(1))).toBe(true);
    expect(extracto).not.toMatch(SUSTITUTO_SUELTO);
    expect(extracto.slice(1).indexOf("plaza")).toBeGreaterThanOrEqual(0);
    expect(extracto.slice(1).indexOf("plaza")).toBeLessThanOrEqual(40);
  });

  it("sin un espacio donde cortar devuelve el texto igual", () => {
    const texto = `${"x".repeat(80)}agua`;
    expect(excerptAround(texto, "agua")).toBe(texto);
  });
});
