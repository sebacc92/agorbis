import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  composeShareMessage,
  currentPageUrl,
  encodeShareComponent,
  replaceLoneSurrogates,
  shareNativeOrWhatsApp,
  telegramShareUrl,
  whatsAppShareUrl,
} from "./share";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("composeShareMessage", () => {
  it("agrega el enlace al final cuando el texto no lo trae", () => {
    expect(composeShareMessage("Mirá esto", "https://x.test/a")).toBe(
      "Mirá esto https://x.test/a",
    );
  });

  it("no repite el enlace que ya viene interpolado en el texto", () => {
    expect(
      composeShareMessage("Mirá esto: https://x.test/a", "https://x.test/a"),
    ).toBe("Mirá esto: https://x.test/a");
  });

  it("sin enlace devuelve el texto, y sin texto devuelve el enlace", () => {
    expect(composeShareMessage("  Hola  ")).toBe("Hola");
    expect(composeShareMessage("", "https://x.test")).toBe("https://x.test");
    expect(composeShareMessage("Hola", "   ")).toBe("Hola");
  });
});

describe("whatsAppShareUrl", () => {
  it("usa api.whatsapp.com/send y codifica el mensaje como un solo parámetro", () => {
    const href = whatsAppShareUrl(
      '¡Hola! "Bache" & farolas #1 ?a=b',
      "https://agorbis.test/reclamos/1?x=1&y=2",
    );
    const parsed = new URL(href);
    expect(parsed.origin).toBe("https://api.whatsapp.com");
    expect(parsed.pathname).toBe("/send");
    expect([...parsed.searchParams.keys()]).toEqual(["text"]);
    expect(parsed.searchParams.get("text")).toBe(
      '¡Hola! "Bache" & farolas #1 ?a=b https://agorbis.test/reclamos/1?x=1&y=2',
    );
  });

  it("conserva emojis y saltos de línea", () => {
    const text = "🗳️ *Resultados*\n• Sí: 60 %";
    expect(new URL(whatsAppShareUrl(text)).searchParams.get("text")).toBe(text);
  });

  it("no tira con un emoji cortado a la mitad", () => {
    const broken = "Bache 🚧".slice(0, -1);
    expect(() => encodeURIComponent(broken)).toThrow(URIError);
    const href = whatsAppShareUrl(broken);
    expect(new URL(href).searchParams.get("text")).toBe("Bache �");
  });
});

describe("replaceLoneSurrogates", () => {
  it("deja intactos los pares completos", () => {
    expect(replaceLoneSurrogates("Bache 🚧 y 🗳️")).toBe("Bache 🚧 y 🗳️");
  });

  it("reemplaza dos surrogates sueltos seguidos, cada uno por separado", () => {
    // Dos mitades altas: la primera no tiene su baja (la que sigue es otra
    // alta) y la segunda tampoco.
    expect(replaceLoneSurrogates("a\uD83D\uD83Db")).toBe("a\uFFFD\uFFFDb");
    // Baja y después alta: ninguna forma par con la otra en ese orden.
    expect(replaceLoneSurrogates("a\uDE00\uD83Db")).toBe("a\uFFFD\uFFFDb");
    expect(() => encodeShareComponent("\uDE00\uD83D")).not.toThrow();
  });

  it("un surrogate suelto pegado a un par válido no rompe el par", () => {
    expect(replaceLoneSurrogates("\uDE00🚧\uD83D")).toBe("\uFFFD🚧\uFFFD");
  });
});

describe("regex sin lookbehind en el código que llega al navegador", () => {
  it("ningún archivo de src usa (?<! o (?<= fuera de un comentario", () => {
    // Safari 16.0–16.3 (dentro del target por defecto de Vite) no entiende
    // lookbehind: es un SyntaxError al parsear y se cae el chunk entero.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)) {
          readFileSync(full, "utf8")
            .split("\n")
            .forEach((line, index) => {
              const code = line.trim();
              if (code.startsWith("*") || code.startsWith("//")) return;
              if (/\(\?<[!=]/.test(code)) offenders.push(`${full}:${index + 1}`);
            });
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});

describe("telegramShareUrl", () => {
  it("manda url y text por separado", () => {
    const parsed = new URL(
      telegramShareUrl("https://agorbis.test/p?a=1&b=2", "Sumate & votá"),
    );
    expect(parsed.origin).toBe("https://t.me");
    expect(parsed.pathname).toBe("/share/url");
    expect(parsed.searchParams.get("url")).toBe(
      "https://agorbis.test/p?a=1&b=2",
    );
    expect(parsed.searchParams.get("text")).toBe("Sumate & votá");
  });

  it("omite text si viene vacío", () => {
    expect(telegramShareUrl("https://agorbis.test", "  ")).toBe(
      `https://t.me/share/url?url=${encodeShareComponent("https://agorbis.test")}`,
    );
  });
});

describe("shareNativeOrWhatsApp", () => {
  it("sin navegador no hace nada", () => {
    expect(currentPageUrl()).toBe("");
    expect(shareNativeOrWhatsApp({ text: "Hola" })).toBe("none");
  });

  it("prefiere la hoja nativa y no tira si la persona la cierra", async () => {
    const share = vi.fn(() => Promise.reject(new Error("AbortError")));
    const open = vi.fn();
    vi.stubGlobal("navigator", { share });
    vi.stubGlobal("window", { open });
    expect(
      shareNativeOrWhatsApp({ title: "T", text: "Hola", url: "https://a.test" }),
    ).toBe("native");
    expect(share).toHaveBeenCalledWith({
      title: "T",
      text: "Hola",
      url: "https://a.test",
    });
    expect(open).not.toHaveBeenCalled();
    await Promise.resolve();
  });

  it("sin hoja nativa abre WhatsApp en otra pestaña sin opener", () => {
    const open = vi.fn();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { open });
    expect(
      shareNativeOrWhatsApp({ text: "Hola https://a.test", url: "https://a.test" }),
    ).toBe("whatsapp");
    expect(open).toHaveBeenCalledWith(
      whatsAppShareUrl("Hola https://a.test"),
      "_blank",
      "noopener,noreferrer",
    );
  });
});
