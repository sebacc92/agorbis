import type { RequestEventAction } from "@qwik.dev/router";
import { z } from "zod";
import { logFailure } from "./log";
import { requireUser, supabase } from "./session";

export const GOOGLE_CONSENT_STATUS_LABELS = {
  missing: "Sin consentimiento registrado",
  accepted: "Consentimiento vigente",
  withdrawn: "Consentimiento retirado",
  outdated: "La decisión anterior necesita una nueva revisión",
  unavailable: "El acceso con Google no tiene un aviso vigente disponible",
} as const;

export const GOOGLE_CONSENT_READ_FAILED =
  "No pudimos consultar tu decisión sobre Google. Recargá esta página o probá de nuevo más tarde.";
export const GOOGLE_CONSENT_WITHDRAW_FAILED =
  "No pudimos confirmar el retiro. Recargá esta página y revisá el estado antes de intentarlo de nuevo.";
export const GOOGLE_CONSENT_CONFIRM_REQUIRED =
  "Marcá la casilla para confirmar que querés retirar tu consentimiento para Google.";

/*
 * El esquema se arma en una IIFE `@__PURE__`: la página de cuenta importa las
 * etiquetas de este módulo en el navegador, y una llamada suelta de nivel
 * superior arrastraba los 61 KB de zod 4 (más la sesión) al cliente aunque
 * sólo el servidor valida. Ver `url.ts`.
 */
const consentSchema = /* @__PURE__ */ (() => {
  const version = z.string().min(1).max(40).nullable();
  const hash = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable();
  const timestamp = z.string().datetime({ offset: true }).nullable();
  return z.object({
    provider: z.literal("google"),
    status: z.enum([
      "missing",
      "accepted",
      "withdrawn",
      "outdated",
      "unavailable",
    ]),
    current_version: version,
    current_content_hash: hash,
    notice_version: version,
    notice_hash: hash,
    accepted_at: timestamp,
    withdrawn_at: timestamp,
    last_withdrawn_at: timestamp,
    locale: z.enum(["es", "en"]).nullable(),
  });
})();

export type GoogleConsentAccount = z.infer<typeof consentSchema>;

/** Proyección privada acotada; una respuesta desconocida no acredita retiro. */
export function parseGoogleConsentAccount(
  value: unknown,
): GoogleConsentAccount | null {
  const parsed = consentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function privateConsentResponse(ev: RequestEventAction) {
  ev.headers.set("Cache-Control", "private, no-store");
  // La página aloja el formulario de retiro (POST): con `no-referrer` el envío
  // nativo sale con `Origin: null` y el chequeo CSRF lo rechaza (ver D89).
  ev.headers.set("Referrer-Policy", "same-origin");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");
}

/** Consultar o retirar son derechos de cuenta, independientes del gate cívico. */
export async function loadGoogleConsentAccount(ev: RequestEventAction) {
  privateConsentResponse(ev);
  await requireUser(ev);
  try {
    const { data, error } = await supabase(ev).rpc("my_google_auth_consent");
    if (error) throw error;
    const consent = parseGoogleConsentAccount(data);
    if (!consent) throw new Error("Invalid Google consent account response");
    return consent;
  } catch (error) {
    logFailure({ scope: "perfil/google-consentimiento-consulta" }, error);
    return null;
  }
}

export async function withdrawGoogleConsentForAccount(
  data: { confirm_withdrawal?: string },
  ev: RequestEventAction,
) {
  privateConsentResponse(ev);
  await requireUser(ev);
  if (data.confirm_withdrawal !== "si") {
    return ev.fail(400, { message: GOOGLE_CONSENT_CONFIRM_REQUIRED });
  }

  try {
    // Sin versión, flag ni usuario aportado por el formulario: la RPC actúa
    // sobre auth.uid(), incluso sin aviso activo, y protege contra retornos
    // OAuth iniciados antes del retiro. No toca identidades ni sesiones Auth.
    const { data: result, error } = await supabase(ev).rpc(
      "withdraw_google_auth_consent",
    );
    if (error) throw error;
    const consent = parseGoogleConsentAccount(result);
    if (
      !consent ||
      consent.status !== "withdrawn" ||
      !consent.withdrawn_at ||
      !consent.last_withdrawn_at
    ) {
      throw new Error("Google consent withdrawal was not confirmed");
    }
    return { saved: true, consent };
  } catch (error) {
    logFailure({ scope: "perfil/google-consentimiento-retiro" }, error);
    // La escritura pudo terminar aunque falle su respuesta. Nunca afirmar
    // que no cambió nada ni dar por confirmado un estado que no pudimos leer.
    return ev.fail(503, { message: GOOGLE_CONSENT_WITHDRAW_FAILED });
  }
}
