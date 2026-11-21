import { describe, expect, it } from "vitest";
import { debateCommentLoginHref } from "./debate-comment-link";

describe("regreso al comentario después de ingresar", () => {
  it("conserva la consulta, reemplaza otro comentario y usa el ancla precisa", () => {
    const href = debateCommentLoginHref(
      new URL(
        "https://agorbis.test/debates/debate/?comunidad=caba&comentario=anterior#otra-columna",
      ),
      "debate",
      "destino",
    );
    const next = new URL(href, "https://agorbis.test").searchParams.get(
      "next",
    )!;
    const destination = new URL(next, "https://agorbis.test");
    expect(destination.pathname).toBe("/debates/debate");
    expect(destination.searchParams.get("comunidad")).toBe("caba");
    expect(destination.searchParams.getAll("comentario")).toEqual(["destino"]);
    expect(destination.hash).toBe("#comment-destino");
  });
  it("no conserva una acción POST en el destino ni produce un retorno externo", () => {
    const href = debateCommentLoginHref(
      new URL("https://otro.test/debates/a?qaction=post&tema=transporte"),
      "debate",
      "destino",
    );
    const next = new URL(href, "https://agorbis.test").searchParams.get(
      "next",
    )!;
    expect(next).toBe(
      "/debates/debate?tema=transporte&comentario=destino#comment-destino",
    );
  });
});
