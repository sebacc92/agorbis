/**
 * Registro de fallos del servidor.
 *
 * No hay servicio de errores conectado, y hasta ahora tampoco había un lugar
 * donde dejar constancia: los fallos de consulta se descartaban en el
 * destructuring y los `catch {}` de resúmenes IA se los tragaban enteros. Un
 * `console.error` con forma fija no reemplaza un servicio de errores, pero
 * queda en los logs custom del Worker y alcanza para saber qué pasó y dónde.
 *
 * Está aislado en un módulo propio para que enchufar Sentry —o lo que sea— sea
 * cambiar este archivo y nada más.
 */

export interface LogContext {
  /** Dónde pasó, en forma estable y greppable: `reclamos/listado`. */
  scope: string;
  /** Datos que ayuden a reproducirlo. Nunca contenido de la gente. */
  [key: string]: unknown;
}

type LogLevel = "info" | "warn" | "error";

const MAX_LOG_VALUE_LENGTH = 500;
const MAX_LOG_DEPTH = 5;
const MAX_LOG_ARRAY_ITEMS = 25;
const MAX_LOG_OBJECT_FIELDS = 25;

const SENSITIVE_LOG_FIELD =
  /(?:^|[_-])(?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token[-_]?hash|token|secret|key|code|password|credential|cookie|otp|captcha)(?:$|[_-])/i;
const PERSONAL_IDENTIFIER_FIELD =
  /^(?:user|owner|actor|recipient|reporter|moderator|appellant|account)(?:Id|_id|-id)?$/i;
const OPERATION_IDENTIFIER_FIELD = /^(?:request|incident)(?:Id|_id|-id)$/i;

function sanitizeLogString(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[jwt]")
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gi, "[supabase-key]")
    .replace(
      /([?&](?:code|token(?:_hash)?|access_token|refresh_token|api[-_]?key|key|secret|authorization)=)[^&#\s]+/gi,
      "$1[redacted]",
    )
    .replace(/\b((?:Bearer|Basic)\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(
      /\b((?:authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|token|secret|password|credential|cookie|otp|captcha)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[redacted]",
    )
    .slice(0, MAX_LOG_VALUE_LENGTH);
}

function redactPersistentUuid(key: string, value: string): string {
  if (OPERATION_IDENTIFIER_FIELD.test(key)) return value;
  return value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    "[uuid]",
  );
}

function sanitizeLogField(
  key: string,
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (SENSITIVE_LOG_FIELD.test(key) || PERSONAL_IDENTIFIER_FIELD.test(key)) {
    return "[redacted]";
  }

  if (typeof value === "string") {
    return redactPersistentUuid(key, sanitizeLogString(value));
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return typeof value === "number" && !Number.isFinite(value)
      ? String(value)
      : value;
  }
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "undefined") return "[undefined]";
  if (typeof value === "function") return "[function]";
  if (typeof value === "symbol") return "[symbol]";
  if (depth >= MAX_LOG_DEPTH) return "[max-depth]";

  if (seen.has(value)) return "[circular]";
  seen.add(value);

  try {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? "[invalid-date]"
        : value.toISOString();
    }
    if (value instanceof Error) {
      return {
        name: sanitizeLogField("name", value.name, depth + 1, seen),
        message: sanitizeLogField("message", value.message, depth + 1, seen),
      };
    }
    if (Array.isArray(value)) {
      const sanitized = value
        .slice(0, MAX_LOG_ARRAY_ITEMS)
        .map((item) => sanitizeLogField("", item, depth + 1, seen));
      if (value.length > MAX_LOG_ARRAY_ITEMS) sanitized.push("[truncated]");
      return sanitized;
    }

    let entries: [string, unknown][];
    try {
      entries = Object.entries(value as Record<string, unknown>);
    } catch {
      return "[unreadable-object]";
    }
    const sanitized = Object.fromEntries(
      entries
        .slice(0, MAX_LOG_OBJECT_FIELDS)
        .map(([nestedKey, item]) => [
          nestedKey,
          sanitizeLogField(nestedKey, item, depth + 1, seen),
        ]),
    );
    if (entries.length > MAX_LOG_OBJECT_FIELDS) {
      sanitized.__truncated_log_fields__ =
        entries.length - MAX_LOG_OBJECT_FIELDS;
    }
    return sanitized;
  } finally {
    seen.delete(value);
  }
}

export function sanitizeLogValue(value: unknown): unknown {
  return sanitizeLogField("", value);
}

export function logEvent(
  level: LogLevel,
  context: LogContext,
  detail: Record<string, unknown> = {},
): void {
  const record = Object.fromEntries(
    Object.entries({ level, ...context, ...detail }).map(([key, item]) => [
      key,
      sanitizeLogField(key, item),
    ]),
  );
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...record,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/**
 * Un fallo que ya se manejó pero que no debería estar pasando.
 *
 * `console.error` y no `throw`: el llamador ya decidió cómo degradar. Esto
 * existe para que la degradación deje rastro en vez de ser silenciosa.
 */
export function logFailure(
  context: LogContext,
  error: { message?: string; code?: string } | Error | unknown,
): void {
  const detail =
    error instanceof Error
      ? { message: error.message, name: error.name }
      : typeof error === "object" && error !== null
        ? {
            message: (error as { message?: string }).message,
            code: (error as { code?: string }).code,
          }
        : { message: String(error) };

  // Una sola línea JSON: evita fragmentar un evento entre varias entradas del
  // log del Worker y conserva una forma estable para buscarlo.
  logEvent("error", context, detail);
}
