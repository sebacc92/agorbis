import { isUuid } from "./http";

/** Sólo el destino que el loader recupera bajo RLS puede pedir foco. */
export function linkedDebateCommentTarget(url: URL): string | null {
  const commentId = url.searchParams.get("comentario");
  return commentId && isUuid(commentId) && url.hash === `#comment-${commentId}`
    ? `comment-${commentId}`
    : null;
}

/** Desplaza también el carrusel y la lista interna después del render. */
export function focusLinkedDebateComment(
  scope: HTMLElement | undefined,
  targetId: string,
): boolean {
  const target = scope?.querySelector<HTMLElement>(`[id="${targetId}"]`);
  if (!target?.isConnected || !target.getClientRects().length) return false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: "center",
    inline: "center",
    behavior: "instant",
  });
  return document.activeElement === target;
}
