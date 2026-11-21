export type ReportTargetType =
  "debate_comment" | "claim" | "project" | "poll" | "debate" | "agreement";

export function reportIntent(type: ReportTargetType, id: string): string {
  return `${type}:${id}`;
}

/** Conserva el destino público y permite abrir sólo su formulario tras el acceso. */
export function reportSignInHref(
  url: URL,
  type: ReportTargetType,
  id: string,
): string {
  const destination = new URL(url);
  destination.searchParams.delete("qaction");
  destination.searchParams.delete("qfunc");
  destination.searchParams.set("reportar", reportIntent(type, id));
  if (type === "debate_comment") destination.searchParams.set("comentario", id);
  if (!destination.hash) destination.hash = `reporte-${id}`;
  const next = `${destination.pathname}${destination.search}${destination.hash}`;
  return `/ingresar?next=${encodeURIComponent(next)}`;
}
