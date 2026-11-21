const QWIK_ROUTER_USER_RESPONSE_MODULE =
  "/@qwik.dev/router/lib/chunks/user-response.mjs";

const UNSAFE_QWIK_SERVER_LOGS = Object.freeze([
  {
    original:
      "console.warn(`Redirect URL ${url} is invalid, fixing to ${fixedURL}`);",
    replacement: 'console.warn("Qwik corrected an invalid redirect URL.");',
  },
  {
    original: 'console.error("JSON request error:", err);',
    replacement: 'console.error("Qwik JSON request failed.");',
  },
  {
    original: "console.error(`Server function ${serverFnHash} failed:`, err);",
    replacement: 'console.error("Qwik server function failed.");',
  },
]);

export const UNSAFE_QWIK_SERVER_LOG_MARKERS = Object.freeze([
  "Redirect URL ",
  "JSON request error:",
  "Server function ",
]);

function occurrenceCount(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

/**
 * Qwik Router beta.40 registra el Error completo en dos caminos de producción
 * y una URL de redirect posiblemente provista por la petición. La versión está
 * pineada y este transform exige exactamente las tres firmas conocidas: si el
 * paquete cambia, el build falla en vez de dejar pasar un logger nuevo.
 */
export function sanitizePinnedQwikServerLogs(source: string): string {
  let sanitized = source;
  for (const { original, replacement } of UNSAFE_QWIK_SERVER_LOGS) {
    const count = occurrenceCount(sanitized, original);
    if (count !== 1) {
      throw new Error(
        `Firma de logging Qwik inesperada (${count} coincidencias): ${original}`,
      );
    }
    sanitized = sanitized.replace(original, replacement);
  }
  return sanitized;
}

export function isQwikRouterUserResponseModule(id: string): boolean {
  return id
    .split("?", 1)[0]
    .replaceAll("\\", "/")
    .endsWith(QWIK_ROUTER_USER_RESPONSE_MODULE);
}
