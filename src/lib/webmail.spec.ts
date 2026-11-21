import { describe, expect, it } from "vitest";
import { webmailFor } from "./webmail";

describe("webmailFor", () => {
  it("reconoce los proveedores comunes sin importar mayúsculas", () => {
    expect(webmailFor("seba.agencia.ar@gmail.com")).toEqual({
      name: "Gmail",
      href: "https://mail.google.com/",
    });
    expect(webmailFor("Vecina@Hotmail.com.ar")?.name).toBe("Outlook");
    expect(webmailFor("a@yahoo.com.ar")?.name).toBe("Yahoo Mail");
    expect(webmailFor("a@icloud.com")?.name).toBe("iCloud Mail");
    expect(webmailFor("a@proton.me")?.name).toBe("Proton Mail");
  });

  it("no inventa un atajo para dominios propios o entradas inválidas", () => {
    expect(webmailFor("persona@agorbis.com")).toBeNull();
    expect(webmailFor("gmail.com")).toBeNull();
    expect(webmailFor("")).toBeNull();
    // Un subdominio no es el proveedor.
    expect(webmailFor("a@mail.gmail.com.evil.test")).toBeNull();
  });
});
