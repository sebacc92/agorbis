import type { ActionStore, RequestEventAction } from "@qwik.dev/router";
import { z } from "@qwik.dev/router";
import type { DbErrorLike } from "./db-error";
import { writeFailure } from "./db-error";
import { requireUser } from "./session";
import { createServerSupabase } from "./supabase";
import { isCalendarDate } from "./text";
import { httpUrlSchema, optionalHttpUrlSchema } from "./url";

/**
 * Todas estas tablas pasan por `aa_participation_gate` (0039), así que un
 * rechazo puede ser del gate y no del dato: ahí se dice el motivo real en vez
 * de un "No pudimos …" que invita a reintentar.
 */
function fail(
  ev: RequestEventAction,
  error: DbErrorLike | null,
  fallback: string,
) {
  const failure = writeFailure(error, fallback);
  return ev.fail(failure.status, { message: failure.message });
}

const contentType = z.enum(["poll", "debate", "claim", "project"]);

/**
 * Fecha opcional de un `<input type="date">`.
 *
 * Estos campos viajaban como `z.string().optional()` y entraban sin mirar a
 * una columna `date`. Postgres rechaza lo que no puede leer, así que un valor
 * inválido no corrompía nada — pero volvía como un fallo genérico ("No pudimos
 * agregar la actualización") que no dice cuál de los seis campos del formulario
 * está mal ni que reintentar no va a servir.
 */
const optionalCalendarDate = z
  .string()
  .trim()
  .refine((value) => value === "" || isCalendarDate(value), {
    message: "Usá una fecha con el formato AAAA-MM-DD.",
  })
  .optional();

export const sourceSchema = z.object({
  content_type: contentType,
  content_id: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(3, "Escribí un título de al menos 3 caracteres.")
    .max(180, "Máximo 180 caracteres."),
  url: httpUrlSchema,
  publisher: z.string().trim().max(120, "Máximo 120 caracteres.").optional(),
  published_at: optionalCalendarDate,
});

export async function addContentSource(
  data: z.infer<typeof sourceSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = createServerSupabase(ev);
  const { error } = await db.from("content_sources").insert({
    content_type: data.content_type,
    content_id: data.content_id,
    added_by: viewer.userId,
    title: data.title,
    url: data.url,
    publisher: data.publisher || null,
    published_at: data.published_at || null,
  });
  if (error)
    return fail(
      ev,
      error,
      "No pudimos agregar la fuente. Revisá el enlace y tus permisos.",
    );
  return { saved: true as const, sourceTitle: data.title };
}

export const institutionalResponseSchema = z.object({
  organization_id: z.string().uuid("Elegí una organización válida."),
  content_type: contentType,
  content_id: z.string().uuid(),
  response_type: z.enum([
    "information",
    "acknowledged",
    "commitment",
    "completed",
  ]),
  body: z
    .string()
    .trim()
    .min(20, "Escribí al menos 20 caracteres.")
    .max(4000, "Máximo 4000 caracteres."),
  source_url: optionalHttpUrlSchema,
});

export async function postInstitutionalResponse(
  data: z.infer<typeof institutionalResponseSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = createServerSupabase(ev);
  const { error } = await db.from("institutional_responses").insert({
    organization_id: data.organization_id,
    author_id: viewer.userId,
    content_type: data.content_type,
    content_id: data.content_id,
    response_type: data.response_type,
    body: data.body,
    source_url: data.source_url || null,
  });
  if (error)
    return fail(ev, error, "No pudimos publicar la respuesta institucional.");
  return { posted: true as const };
}

// Los formularios reciben la acción de su detalle: cada ruta invalida sólo su
// loader, sin importar rutas desde esta librería ni perder otros borradores.
export type SourceAction = ActionStore<
  {
    saved?: boolean;
    sourceTitle?: string;
    message?: string;
    fieldErrors?: Record<string, string | string[] | undefined>;
  },
  z.input<typeof sourceSchema>,
  false
>;
export type InstitutionalResponseAction = ActionStore<
  {
    posted?: boolean;
    message?: string;
    fieldErrors?: Record<string, string | string[] | undefined>;
  },
  z.input<typeof institutionalResponseSchema>,
  false
>;

export const relationSchema = z.object({
  source_type: contentType,
  source_id: z.string().uuid(),
  target_type: contentType,
  target_id: z.string().uuid("Elegí una publicación para vincular."),
  relation_type: z.enum(["related", "result_of", "proposal_for", "follow_up"]),
});

export async function addContentRelation(
  data: z.infer<typeof relationSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = createServerSupabase(ev);
  const { error } = await db.from("content_relations").insert({
    source_type: data.source_type,
    source_id: data.source_id,
    target_type: data.target_type,
    target_id: data.target_id,
    relation_type: data.relation_type,
    created_by: viewer.userId,
  });
  if (error)
    return fail(
      ev,
      error,
      "No pudimos vincular el contenido. Comprobá el ID y los permisos.",
    );
  return { linked: true as const };
}

export type RelationAction = ActionStore<
  {
    linked?: boolean;
    message?: string;
    fieldErrors?: Record<string, string | string[] | undefined>;
  },
  z.input<typeof relationSchema>,
  false
>;

export const claimEventSchema = z.object({
  claim_id: z.string().uuid(),
  organization_id: z.string().uuid().optional().or(z.literal("")),
  event_type: z.enum(["official_response", "evidence", "update", "resolution"]),
  title: z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres.")
    .max(180, "Máximo 180 caracteres."),
  body: z.string().trim().max(3000).optional(),
  evidence_url: optionalHttpUrlSchema,
  event_date: optionalCalendarDate,
  status: z
    .enum([
      "open",
      "under_review",
      "acknowledged",
      "in_progress",
      "resolved",
      "rejected",
    ])
    .optional()
    .or(z.literal("")),
});

/** La acción de detalle invalida su loader después de esta escritura confirmada. */
export async function addClaimEvent(
  data: z.infer<typeof claimEventSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const db = createServerSupabase(ev);
  const { data: eventId, error } = await db.rpc("add_claim_event_with_status", {
    p_claim: data.claim_id,
    p_organization: data.organization_id || "",
    p_event_type: data.event_type,
    p_title: data.title,
    p_body: data.body || "",
    p_evidence_url: data.evidence_url || "",
    p_event_date: data.event_date || "",
    p_status: data.status || "",
  });
  if (error || !eventId)
    return fail(ev, error, "No pudimos agregar la actualización.");
  return { added: true as const, eventId, claimId: data.claim_id };
}

export const assignClaimOrganizationSchema = z.object({
  claim_id: z.string().uuid(),
  organization_id: z.string().uuid().optional().or(z.literal("")),
});

/**
 * La acción se declara en `reclamos/[id]` con `invalidate: [useClaim]`: era
 * una `globalAction$` sin loaders que invalidar y, con `strictLoaders`, la
 * insignia seguía en "Sin organismo asignado" después de asignar.
 */
export async function assignClaimOrganization(
  data: z.infer<typeof assignClaimOrganizationSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const db = createServerSupabase(ev);
  const { data: claim, error } = await db
    .from("claims")
    .update({ responsible_organization_id: data.organization_id || null })
    .eq("id", data.claim_id)
    .select("id")
    .maybeSingle();
  if (error || !claim)
    return fail(ev, error, "No pudimos asignar el organismo.");
  return { assigned: true as const };
}
