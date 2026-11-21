import { routes } from "./community";

/** La consulta permite recuperar el destino aunque salga del top de su columna. */
export function debateCommentHref(debateId: string, commentId: string): string {
  return `${routes.debate(debateId)}?comentario=${encodeURIComponent(commentId)}#comment-${encodeURIComponent(commentId)}`;
}

/** Volver del ingreso conserva los filtros y recupera incluso un comentario fuera del ranking. */
export function debateCommentLoginHref(
  current: URL,
  debateId: string,
  commentId: string,
): string {
  const destination = new URL(current);
  destination.pathname = routes.debate(debateId);
  destination.searchParams.delete("qaction");
  destination.searchParams.set("comentario", commentId);
  destination.hash = `comment-${commentId}`;
  return `/ingresar?next=${encodeURIComponent(destination.pathname + destination.search + destination.hash)}`;
}
