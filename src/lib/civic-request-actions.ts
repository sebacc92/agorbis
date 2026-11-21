import { z, type RequestEventAction } from "@qwik.dev/router";
import { writeFailure } from "./db-error";
import { formatCuit, formatPhoneNumber } from "./input-masks";
import { requireUser, supabase } from "./session";
import { optionalHttpUrlSchema } from "./url";

export function organizationRequestMessage(data: {
  message: string;
  cuit_helper?: string;
  phone_helper?: string;
}) {
  const cuit = formatCuit(data.cuit_helper ?? "");
  const phone = formatPhoneNumber(data.phone_helper ?? "");
  const contact = [
    cuit ? `CUIT: ${cuit}` : "",
    phone ? `Tel: ${phone}` : "",
  ].filter(Boolean);
  return contact.length
    ? `${data.message.trim()}\n\n[Contacto institucional: ${contact.join(" · ")}]`
    : data.message.trim();
}

export const organizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    type: z.enum(["government", "ngo", "institution", "company", "other"]),
    website: optionalHttpUrlSchema,
    evidence_url: optionalHttpUrlSchema,
    message: z.string().trim().min(20).max(2000),
    cuit_helper: z.string().trim().max(40).optional(),
    phone_helper: z.string().trim().max(40).optional(),
  })
  .superRefine((data, context) => {
    if (organizationRequestMessage(data).length > 2000) {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message:
          "La explicación y los datos de contacto deben sumar hasta 2000 caracteres.",
      });
    }
  });

export async function requestOrganization(
  data: z.infer<typeof organizationRequestSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const { data: row, error } = await supabase(ev)
    .from("organization_requests")
    .insert({
      user_id: viewer.userId,
      name: data.name,
      type: data.type,
      website: data.website || null,
      evidence_url: data.evidence_url || null,
      message: organizationRequestMessage(data),
    })
    .select("id")
    .single();
  if (error || !row) {
    // 3 pendientes o 3 por día (0039): el motivo real, no "probá de nuevo".
    const failure = writeFailure(error, "No pudimos enviar la solicitud.");
    return ev.fail(failure.status, { message: failure.message });
  }
  return { sent: true as const, requestId: row.id, requestName: data.name };
}

export const communityRequestSchema = z.object({
  requested_name: z.string().trim().min(2).max(120),
  country: z.string().trim().min(2).max(100),
  requested_level: z.enum(["province", "city", "neighborhood"]),
  reason: z.string().trim().min(20).max(1500),
  evidence_url: optionalHttpUrlSchema,
  parent_slug: z
    .string()
    .trim()
    .min(1, "Elegí la comunidad superior.")
    .max(160),
});

export async function requestCommunity(
  data: z.infer<typeof communityRequestSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const { data: parent, error: parentError } = await db
    .from("communities")
    .select("id")
    .eq("slug", data.parent_slug)
    .maybeSingle();
  if (parentError)
    return ev.fail(400, {
      message: "No pudimos consultar la comunidad superior. Probá de nuevo.",
    });
  if (!parent) {
    const fieldErrors: Partial<
      Record<keyof z.infer<typeof communityRequestSchema>, string[]>
    > = {
      parent_slug: ["No encontramos la comunidad superior indicada."],
    };
    return ev.fail(400, { fieldErrors });
  }
  const { data: row, error } = await db
    .from("community_requests")
    .insert({
      user_id: viewer.userId,
      requested_name: data.requested_name,
      country: data.country,
      requested_level: data.requested_level,
      reason: data.reason,
      evidence_url: data.evidence_url || null,
      parent_community_id: parent.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    const failure = writeFailure(
      error,
      "No pudimos enviar la solicitud. Revisá los datos.",
    );
    return ev.fail(failure.status, { message: failure.message });
  }
  return {
    sent: true as const,
    requestId: row.id,
    requestName: data.requested_name,
  };
}
