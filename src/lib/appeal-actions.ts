import { z, type RequestEventAction } from "@qwik.dev/router";
import { isUuid } from "./http";
import { requireUser, supabase } from "./session";

export const suspensionAppealSchema = z.object({
  suspension_id: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(20, "Contanos el contexto con al menos 20 caracteres.")
    .max(4000, "La apelación puede tener hasta 4.000 caracteres."),
});

export async function submitSuspensionAppeal(
  data: z.infer<typeof suspensionAppealSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: appealId, error } = await supabase(ev).rpc(
    "submit_suspension_appeal",
    {
      p_suspension: data.suspension_id,
      p_body: data.body,
    },
  );
  if (error || !isUuid(appealId))
    return ev.fail(400, {
      message:
        error?.code === "23505"
          ? "Ya hay una apelación abierta para esta suspensión."
          : "No pudimos enviar la apelación. Revisá los datos y probá de nuevo.",
    });
  return {
    submitted: true as const,
    appealId,
    suspensionId: data.suspension_id,
  };
}

export const withdrawAppealSchema = z.object({ appeal_id: z.string().uuid() });
export async function withdrawSuspensionAppeal(
  data: z.infer<typeof withdrawAppealSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: withdrawn, error } = await supabase(ev).rpc(
    "withdraw_moderation_appeal",
    { p_appeal: data.appeal_id },
  );
  if (error || withdrawn !== true)
    return ev.fail(400, {
      message:
        "No pudimos retirar la apelación. Puede que ya esté en revisión.",
    });
  return { withdrawn: true as const, appealId: data.appeal_id };
}
