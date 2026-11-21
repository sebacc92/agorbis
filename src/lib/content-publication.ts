import type { RequestEvent } from "@qwik.dev/router";

export interface PublicationFeedback {
  message?: string;
  fieldErrors?: Record<string, string | string[] | undefined>;
  published?: boolean;
  redirectTo?: string;
  /**
   * Lo pone el guardián de envíos (`action-guard.ts`) cuando la red se cortó o
   * el servidor no respondió JSON: no se sabe si el POST llegó (D74).
   */
  undelivered?: boolean;
}

export interface PublishedContent {
  published: true;
  redirectTo: string;
  message?: never;
  preview?: never;
}

/**
 * Marca la primera visita al detalle después de publicar. La ficha la usa
 * para mostrarle a la autoría qué sigue (`PublishedNextSteps`).
 */
export const PUBLISHED_PARAM = "publicado";

export function publishedContentPath(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("published" in value))
    return null;
  const result = value as Partial<PublishedContent>;
  return result.published === true &&
    typeof result.redirectTo === "string" &&
    /^\/(?:encuestas|debates|reclamos|proyectos|acuerdos)\/[0-9a-f-]{36}(?:\?publicado=1)?$/i.test(
      result.redirectTo,
    )
    ? result.redirectTo
    : null;
}

/** Sólo se llama después de confirmar la escritura en la base. */
export function publicationResult(
  ev: Pick<RequestEvent, "internalRequest" | "redirect">,
  contentPath: string,
): PublishedContent {
  const redirectTo = `${contentPath}?${PUBLISHED_PARAM}=1`;
  const result: PublishedContent = { published: true, redirectTo };
  if (!publishedContentPath(result))
    throw new Error("Destino de publicación inválido.");
  // Los redirects JSON del router no conservan el resultado de la acción.
  // Devolver una confirmación explícita permite borrar el borrador ANTES de
  // navegar; sin JavaScript se conserva POST/redirect/GET.
  if (ev.internalRequest === "action") return result;
  throw ev.redirect(303, redirectTo);
}
