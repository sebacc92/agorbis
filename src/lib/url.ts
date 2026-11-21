import { z } from "@qwik.dev/router";

export const MAX_HTTP_URL_LENGTH = 2048;

/**
 * Devuelve una URL web canónica o `null`. `z.string().url()` acepta esquemas
 * como `javascript:`, `data:` y `file:`; para enlaces aportados por usuarios
 * sólo tienen sentido HTTP y HTTPS. También se rechazan credenciales embebidas
 * para que la UI no presente `sitio-oficial.com@phishing.example`.
 */
export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_HTTP_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/*
 * Los esquemas se arman dentro de una IIFE marcada `@__PURE__`. Este módulo
 * también lo usa el navegador (`safeHttpUrl`, `safeAvatarUrl`), pero los
 * esquemas sólo los usan las actions del servidor. Una llamada suelta de
 * nivel superior (`z.string()...`) no se puede descartar por tree-shaking
 * aunque nadie la use, y arrastraba los 56 KB de zod a todas las páginas que
 * muestran un enlace. Con la anotación, el bundler la descarta en el cliente y
 * el servidor sigue recibiendo exactamente el mismo esquema.
 */
export const httpUrlSchema = /* @__PURE__ */ (() =>
  z
    .string()
    .trim()
    .max(MAX_HTTP_URL_LENGTH, "El enlace es demasiado largo.")
    .transform((value, ctx) => {
      const normalized = normalizeHttpUrl(value);
      if (!normalized) {
        ctx.addIssue({
          code: "custom",
          message:
            "Ingresá un enlace completo que empiece con http:// o https://.",
        });
        return z.NEVER;
      }
      return normalized;
    }))();

/** Mantiene `""` porque los formularios lo usan para representar null. */
export const optionalHttpUrlSchema = /* @__PURE__ */ (() =>
  httpUrlSchema.optional().or(z.literal("")))();

/** Alias semántico para sanitizar valores históricos antes de un sink HTML. */
export const safeHttpUrl = normalizeHttpUrl;

const AVATAR_MEDIA_URL =
  /^\/media\/avatares\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;

/** Sólo los avatares admiten una ruta relativa, mediada por el propio origen. */
export function safeAvatarUrl(value: unknown): string | null {
  if (typeof value === "string" && AVATAR_MEDIA_URL.test(value)) return value;
  return normalizeHttpUrl(value);
}

export function httpUrlHostname(value: unknown): string | null {
  const safe = normalizeHttpUrl(value);
  return safe ? new URL(safe).hostname : null;
}
