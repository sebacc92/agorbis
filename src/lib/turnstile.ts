import type { RequestEventBase } from "@qwik.dev/router";
import { getTrustedClientIp } from "./client-ip";

export const TURNSTILE_ACTIONS = {
  signup: "signup",
  passwordLogin: "password_login",
  magicLink: "magic_link",
  passwordReset: "password_reset",
  resendConfirmation: "resend_confirmation",
} as const;

export type TurnstileAction =
  (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];

export const TURNSTILE_FAILURE_MESSAGE =
  "No pudimos completar la verificación antiabuso. Esperá a que termine y probá de nuevo.";

interface SiteverifyResponse {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
}

const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export type TurnstileVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "configuration"
        | "token"
        | "network"
        | "response"
        | "action"
        | "hostname";
      /** Códigos de error de Siteverify, sólo enums cortos de Cloudflare. */
      siteverifyErrors?: string[];
    };

const SITEVERIFY_ERROR_PATTERN = /^[a-z0-9-]{1,64}$/;

// Los códigos de Cloudflare (`invalid-input-response`, `timeout-or-duplicate`,
// `invalid-input-secret`…) distinguen un widget de otra cuenta de un replay;
// cualquier otro valor se descarta antes de llegar a un log.
function siteverifyErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is string =>
        typeof item === "string" && SITEVERIFY_ERROR_PATTERN.test(item),
    )
    .slice(0, 5);
}

function allowedHostnames(ev: RequestEventBase): Set<string> {
  return new Set(
    (ev.env.get("TURNSTILE_HOSTNAMES") ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Canjea A una sola vez antes de tocar Supabase. Falla cerrado ante timeout,
 * respuesta no JSON, acción distinta o cualquier desajuste de hostname.
 */
export async function verifyTurnstileToken(
  ev: RequestEventBase,
  token: string,
  expectedAction: TurnstileAction,
): Promise<TurnstileVerification> {
  const secret = ev.env.get("TURNSTILE_SECRET")?.trim() ?? "";
  const hostnames = allowedHostnames(ev);
  const requestHostname = ev.url.hostname.toLowerCase();
  const testingRequested = ev.env.get("TURNSTILE_TESTING")?.trim() ?? "";
  const localTesting =
    testingRequested === "true" &&
    secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET &&
    LOOPBACK_HOSTNAMES.has(requestHostname);
  if (!secret || hostnames.size === 0 || !hostnames.has(requestHostname)) {
    return { ok: false, reason: "configuration" };
  }
  // La respuesta oficial de pruebas usa `example.com` y no devuelve action.
  // Sólo se admite con el secret dummy exacto, opt-in explícito y un hostname
  // loopback. El preflight prohíbe tanto el flag como las claves dummy en
  // producción, donde action y hostname siempre se verifican estrictamente.
  if (testingRequested && !localTesting) {
    return { ok: false, reason: "configuration" };
  }
  if (!token || token.length > 2048) {
    return { ok: false, reason: "token" };
  }

  const body = new URLSearchParams({ secret, response: token });
  const clientIp = getTrustedClientIp(ev);
  if (clientIp) body.set("remoteip", clientIp);

  let response: Response;
  let result: SiteverifyResponse;
  try {
    response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body,
      },
    );
    if (!response.ok) return { ok: false, reason: "network" };
    result = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "network" };
  }

  if (result.success !== true) {
    return {
      ok: false,
      reason: "response",
      siteverifyErrors: siteverifyErrors(result["error-codes"]),
    };
  }
  if (localTesting) return { ok: true };
  if (result.action !== expectedAction) {
    return { ok: false, reason: "action" };
  }
  if (
    typeof result.hostname !== "string" ||
    result.hostname.toLowerCase() !== requestHostname ||
    !hostnames.has(result.hostname.toLowerCase())
  ) {
    return { ok: false, reason: "hostname" };
  }
  return { ok: true };
}
