import { afterEach, describe, expect, it, vi } from "vitest";
import {
  focusLinkedDebateComment,
  linkedDebateCommentTarget,
} from "./debate-comment-focus";

const id = "2c3a1f18-8693-4d59-84bd-4655b1b6d002";
const targetId = `comment-${id}`;

afterEach(() => vi.unstubAllGlobals());

describe("destino explícito de un comentario", () => {
  it("requiere la consulta validada que recupera el loader y su ancla correspondiente", () => {
    const url = new URL(
      `https://agorbis.test/debates/uno?comentario=${id}#${targetId}`,
    );
    expect(linkedDebateCommentTarget(url)).toBe(targetId);
    for (const path of [
      `/debates/uno#${targetId}`,
      `/debates/uno?comentario=${id}`,
      `/debates/uno?comentario=${id}#otro`,
      "/debates/uno?comentario=incorrecto#comment-incorrecto",
    ]) {
      expect(linkedDebateCommentTarget(new URL(path, url))).toBeNull();
    }
  });

  it("enfoca la tarjeta renderizada y acerca ambos ejes sin animación", () => {
    const documentState = { activeElement: null as unknown };
    vi.stubGlobal("document", documentState);
    const target = {
      isConnected: true,
      getClientRects: vi.fn(() => [{}]),
      focus: vi.fn(() => {
        documentState.activeElement = target;
      }),
      scrollIntoView: vi.fn(),
    };
    const scope = { querySelector: vi.fn(() => target) };
    expect(
      focusLinkedDebateComment(scope as unknown as HTMLElement, targetId),
    ).toBe(true);
    expect(scope.querySelector).toHaveBeenCalledWith(`[id="${targetId}"]`);
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
  });

  it.each([
    null,
    { isConnected: false, getClientRects: () => [{}] },
    { isConnected: true, getClientRects: () => [] },
  ])(
    "espera el destino conectado y visible sin buscar fuera del debate",
    (target) => {
      const scope = { querySelector: vi.fn(() => target) };
      expect(
        focusLinkedDebateComment(scope as unknown as HTMLElement, targetId),
      ).toBe(false);
      expect(focusLinkedDebateComment(undefined, targetId)).toBe(false);
    },
  );
});
