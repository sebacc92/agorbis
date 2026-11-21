import { describe, expect, it } from "vitest";
import {
  DONATION_URL,
  donationLink,
  supportFooterLinks,
  supportPageHref,
} from "./support";

describe("donationLink", () => {
  it("devuelve el enlace limpio de un perfil de Cafecito", () => {
    expect(donationLink("https://cafecito.app/agorbis")).toBe(
      "https://cafecito.app/agorbis",
    );
  });

  // La salida se reconstruye, no se devuelve lo que entró: lo que el parser
  // normaliza sale siempre con la forma canónica.
  it.each([
    ["https://CAFECITO.APP/Agorbis", "https://cafecito.app/Agorbis"],
    ["https://cafecito.app:443/agorbis", "https://cafecito.app/agorbis"],
    ["https://cafecito.app/ago\trbis", "https://cafecito.app/agorbis"],
  ])("normaliza %s", (url, expected) => {
    expect(donationLink(url)).toBe(expected);
  });

  // El perfil cargado tiene que pasar su propia validación: si no, el botón
  // se apagaría sin que nadie lo note.
  it("el perfil configurado es un enlace válido", () => {
    expect(donationLink(DONATION_URL)).toBe("https://cafecito.app/agorbis");
  });

  it("queda apagado mientras no hay enlace configurado", () => {
    expect(donationLink("")).toBeNull();
    expect(donationLink("   ")).toBeNull();
  });

  it.each([
    ["http://cafecito.app/agorbis", "sin TLS"],
    ["https://cafecito.app.evil.example/agorbis", "otro host"],
    ["https://evil.example/cafecito.app/agorbis", "otro host con la ruta"],
    ["https://user:clave@cafecito.app/agorbis", "credenciales"],
    ["https://cafecito.app:8443/agorbis", "otro puerto"],
    ["https://cafecito.app/", "sin usuario"],
    ["https://cafecito.app/agorbis/extra", "ruta de más"],
    ["https://cafecito.app/agorbis/", "barra final"],
    ["https://cafecito.app./agorbis", "punto final en el host"],
    ["https://cafecito.app/..", "ruta que sube"],
    ["https://cafecito.app/%2e%2e", "ruta codificada"],
    ["javascript:alert(1)", "otro esquema"],
    ["no es una url", "texto suelto"],
  ])("rechaza %s (%s)", (url) => {
    expect(donationLink(url)).toBeNull();
  });

  // Un parámetro o un fragmento es donde entraría un identificador de la
  // persona o de la comunidad: D128 pide que el proveedor no sepa quién llega.
  it.each([
    "https://cafecito.app/agorbis?ref=perfil",
    "https://cafecito.app/agorbis?u=123",
    "https://cafecito.app/agorbis#desde-reclamo",
  ])("rechaza un enlace con parámetros o fragmento: %s", (url) => {
    expect(donationLink(url)).toBeNull();
  });
});

describe("supportPageHref", () => {
  it("lleva a la página propia sólo si hay un enlace válido", () => {
    expect(supportPageHref("https://cafecito.app/agorbis")).toBe("/apoyar");
    expect(supportPageHref("")).toBeNull();
    expect(supportPageHref("https://cafecito.app/a#x")).toBeNull();
  });
});

describe("supportFooterLinks", () => {
  it("no ofrece Apoyar si no hay a dónde donar", () => {
    expect(supportFooterLinks("")).toEqual([]);
    expect(supportFooterLinks("https://cafecito.app/a?x=1")).toEqual([]);
  });

  it("ofrece la página interna, nunca el enlace externo directo", () => {
    expect(supportFooterLinks("https://cafecito.app/agorbis")).toEqual([
      { href: "/apoyar", label: "Apoyar" },
    ]);
  });
});
