import { describe, expect, it } from "vitest";
import { reportSignInHref } from "./report-intent";

describe("regreso al contenido que se quiere reportar", () => {
  it("conserva filtros y fragmento original y agrega una intención concreta", () => {
    const href = reportSignInHref(new URL("https://agorbis.test/debates/one?orden=recientes#comment-one"), "debate_comment", "one");
    const next = new URL(href, "https://agorbis.test").searchParams.get("next")!;
    const destination = new URL(next, "https://agorbis.test");
    expect(destination.pathname).toBe("/debates/one");
    expect(destination.searchParams.get("orden")).toBe("recientes");
    expect(destination.searchParams.get("reportar")).toBe("debate_comment:one");
    expect(destination.searchParams.get("comentario")).toBe("one");
    expect(destination.hash).toBe("#comment-one");
  });
  it("quita parámetros de ejecución y usa el ancla del formulario si no había fragmento", () => {
    const href = reportSignInHref(new URL("https://agorbis.test/reclamos/one?tag=salud&qaction=private&qfunc=private"), "claim", "one");
    const next = new URL(href, "https://agorbis.test").searchParams.get("next")!;
    expect(next).toBe("/reclamos/one?tag=salud&reportar=claim%3Aone#reporte-one");
    expect(next.startsWith("/")).toBe(true);
  });
});
