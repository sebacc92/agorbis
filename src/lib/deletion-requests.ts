import { z } from "@qwik.dev/router";
import type { RequestEventBase } from "@qwik.dev/router";
import { getTrustedClientIp } from "./client-ip";
import { createAdminSupabase, type DB } from "./supabase";
import { requireModerator, supabase } from "./session";
import { resolveLocale, translate } from "./i18n";
import type { Database } from "./database.types";

export const DELETION_REQUEST_STATUSES = {
  received: "Recibida",
  verifying: "Verificando identidad",
  in_review: "En revisión",
  resolved: "Resuelta",
  rejected: "Rechazada",
} as const;

export const DELETION_RESOLUTIONS = {
  handled: "Gestión solicitada atendida",
  partially_handled: "Gestión atendida con limitaciones",
  unable_to_verify: "No se pudo verificar la identidad",
  out_of_scope: "Solicitud fuera del alcance de este trámite",
  withdrawn: "Solicitud retirada por la persona",
} as const;

export const RECEIPT_UNAVAILABLE =
  "No pudimos consultar el recibo. Revisá la referencia y el código, o probá más tarde. Si necesitás ayuda, respondé al correo de privacidad.";
export const DELETION_ADMIN_REQUIRED =
  "El seguimiento de solicitudes de eliminación está reservado a administradores con una sesión verificada.";
export const DELETION_UPDATE_FAILED =
  "No pudimos guardar el cambio. Recargá la lista y revisá el estado, la verificación y la respuesta de cierre.";

/*
 * Los esquemas se arman en IIFEs `@__PURE__`. Las etiquetas de estado de este
 * módulo también llegan al navegador, y una llamada suelta de nivel superior
 * (`z.object(...)`) no se puede descartar por tree-shaking: arrastraba zod al
 * cliente aunque sólo el servidor valida. Ver `url.ts`.
 */
const statusSchema = /* @__PURE__ */ (() =>
  z.enum(["received", "verifying", "in_review", "resolved", "rejected"]))();
const resolutionSchema = /* @__PURE__ */ (() =>
  z.enum([
    "handled",
    "partially_handled",
    "unable_to_verify",
    "out_of_scope",
    "withdrawn",
  ]))();

export const deletionReceiptSchema = /* @__PURE__ */ (() =>
  z.object({
    reference: z.string().uuid(),
    status: statusSchema,
    received_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable(),
    resolution_code: resolutionSchema.nullable(),
  }))();
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;

export const privateDeletionRequestSchema = /* @__PURE__ */ (() =>
  deletionReceiptSchema.extend({
    scope: z.enum(["account", "specific_data"]),
    contact_email: z.string().nullable(),
    inbox_reference: z.string().nullable(),
    verification_method: z.enum(["account_email", "alternative"]).nullable(),
    verification_note: z.string().nullable(),
    verified_at: z.string().nullable(),
    revision: z.number().int().positive(),
    access_expires_at: z.string(),
  }))();
export type PrivateDeletionRequest = z.infer<
  typeof privateDeletionRequestSchema
>;

export const createDeletionRequestSchema = /* @__PURE__ */ (() =>
  z.object({
    contact_email: z.string().trim().email().max(254),
    scope: z.enum(["account", "specific_data"]),
    inbox_reference: z.string().trim().min(1).max(200),
  }))();
export const updateDeletionRequestSchema = /* @__PURE__ */ (() =>
  z.object({
    reference: z.string().uuid(),
    revision: z.coerce.number().int().positive(),
    status: z.enum(["verifying", "in_review", "resolved", "rejected"]),
    verification_method: z
      .enum(["", "account_email", "alternative"])
      .default(""),
    verification_note: z.string().trim().max(500).default(""),
    resolution_code: z
      .enum([
        "",
        "handled",
        "partially_handled",
        "unable_to_verify",
        "out_of_scope",
        "withdrawn",
      ])
      .default(""),
    response_sent: z.string().optional(),
  }))();
export const reissueDeletionReceiptSchema = /* @__PURE__ */ (() =>
  z.object({
    reference: z.string().uuid(),
    revision: z.coerce.number().int().positive(),
  }))();
export const receiptInputSchema = /* @__PURE__ */ (() =>
  z.object({
    reference: z.string().trim().uuid(),
    access_code: z
      .string()
      .trim()
      .regex(/^[a-f0-9]{64}$/),
  }))();

type DeletionRpcName =
  | "list_data_deletion_requests"
  | "create_data_deletion_request"
  | "update_data_deletion_request"
  | "reissue_data_deletion_receipt"
  | "read_data_deletion_receipt";

// Las RPC devuelven JSON y cada consumidor valida su proyección. No expone
// tablas privadas ni depende de que el generador incluya el schema private.
export function deletionRequestRpc<N extends DeletionRpcName>(
  db: DB,
  name: N,
  args: Database["public"]["Functions"][N]["Args"],
) {
  return db.rpc(name, args);
}

export async function requireDeletionRequestAdmin(
  ev: Parameters<typeof requireModerator>[0],
) {
  const viewer = await requireModerator(ev);
  const { data, error } = await supabase(ev).rpc("is_admin", {
    p_user: viewer.userId,
  });
  if (error || data !== true) {
    throw ev.error(
      403,
      translate(resolveLocale(ev.locale()), DELETION_ADMIN_REQUIRED),
    );
  }
  return viewer;
}

function hex(bytes: ArrayBuffer | Uint8Array) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashReceiptAccessCode(code: string): Promise<string> {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code)),
  );
}

export async function issueReceiptAccessCode() {
  const code = hex(crypto.getRandomValues(new Uint8Array(32)));
  return { code, hash: await hashReceiptAccessCode(code) };
}

export async function receiptLookupSourceHash(
  ev: RequestEventBase,
): Promise<string | null> {
  const trustedIp = getTrustedClientIp(ev);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(ev.url.hostname);
  const source = trustedIp ?? (local ? "local-development" : null);
  const secret = ev.env.get("SUPABASE_SECRET_KEY");
  if (!source || !secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        `deletion-receipt:${new Date().toISOString().slice(0, 10)}:${source}`,
      ),
    ),
  );
}

export async function lookupDeletionReceipt(
  ev: RequestEventBase,
  input: unknown,
): Promise<DeletionReceipt | null> {
  const parsed = receiptInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const sourceHash = await receiptLookupSourceHash(ev);
  if (!sourceHash) return null;
  try {
    const { data, error } = await deletionRequestRpc(
      createAdminSupabase(ev),
      "read_data_deletion_receipt",
      {
        p_reference: parsed.data.reference,
        p_access_hash: await hashReceiptAccessCode(parsed.data.access_code),
        p_source_hash: sourceHash,
      },
    );
    if (error) return null;
    const receipt = deletionReceiptSchema.safeParse(data);
    return receipt.success ? receipt.data : null;
  } catch {
    // No registrar payloads, referencia, código ni errores que puedan incluirlos.
    return null;
  }
}

export function deletionRequestNextStates(
  status: PrivateDeletionRequest["status"],
) {
  if (status === "received")
    return ["verifying", "in_review", "rejected"] as const;
  if (status === "verifying") return ["in_review", "rejected"] as const;
  if (status === "in_review") return ["resolved", "rejected"] as const;
  return [];
}
