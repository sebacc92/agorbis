import type { RequestEventBase } from "@qwik.dev/router";

const REQUEST_ID_KEY = "agorbis:request-id";

/**
 * Identificador generado por Agorbis: nunca reutiliza uno enviado por el
 * cliente, para que una persona externa no pueda falsificar correlaciones.
 */
export function ensureRequestId(ev: RequestEventBase): string {
  const existing = ev.sharedMap.get(REQUEST_ID_KEY);
  if (typeof existing === "string") return existing;
  const requestId = crypto.randomUUID();
  ev.sharedMap.set(REQUEST_ID_KEY, requestId);
  return requestId;
}

export function requestIdOf(ev: RequestEventBase): string | undefined {
  const value = ev.sharedMap.get(REQUEST_ID_KEY);
  return typeof value === "string" ? value : undefined;
}
