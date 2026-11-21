import { describe, expect, it } from "vitest";
import { suggestEmailDomain } from "./email-typos";

describe("suggestEmailDomain", () => {
  it("corrige los errores de tipeo de los proveedores masivos", () => {
    expect(suggestEmailDomain("dai@gmial.com")).toBe("dai@gmail.com");
    expect(suggestEmailDomain("dai@gmail.con")).toBe("dai@gmail.com");
    expect(suggestEmailDomain("Dai@Hotmial.com")).toBe("dai@hotmail.com");
    expect(suggestEmailDomain("dai@outlok.com")).toBe("dai@outlook.com");
    expect(suggestEmailDomain("dai@yaho.com")).toBe("dai@yahoo.com");
  });

  it("no toca un dominio bien escrito ni uno que no conoce", () => {
    expect(suggestEmailDomain("dai@gmail.com")).toBeNull();
    expect(suggestEmailDomain("dai@yahoo.com.ar")).toBeNull();
    expect(suggestEmailDomain("dai@agorbis.com")).toBeNull();
    expect(suggestEmailDomain("dai@municipio.gob.ar")).toBeNull();
    expect(suggestEmailDomain("dai@fibertel.com.ar")).toBeNull();
  });

  it("se queda callado con entradas incompletas", () => {
    expect(suggestEmailDomain("")).toBeNull();
    expect(suggestEmailDomain("dai")).toBeNull();
    expect(suggestEmailDomain("dai@")).toBeNull();
    expect(suggestEmailDomain("@gmail.com")).toBeNull();
    expect(suggestEmailDomain("dai@gm")).toBeNull();
  });
});
