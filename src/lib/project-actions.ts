import { z, type RequestEventAction } from "@qwik.dev/router";
import { MAX_PROJECT_PLEDGE_AMOUNT } from "./constants";
import { isRlsViolation, participationBlockMessage } from "./db-error";
import { getViewer } from "./session";
import { createServerSupabase } from "./supabase";

/**
 * Compromiso de aporte. NO hay dinero real: es una declaración de intención
 * que sirve para medir si el proyecto tiene respaldo suficiente.
 */
export const pledgeSchema = z.object({
  project_id: z.string().uuid(),
  amount: z.coerce
    .number()
    .positive("Poné un monto mayor a cero.")
    .max(
      MAX_PROJECT_PLEDGE_AMOUNT,
      "El monto máximo por compromiso es 1.000.000.000.",
    )
    .default(1),
  message: z.string().trim().max(280, "Máximo 280 caracteres.").optional(),
  withdraw: z.string().optional(),
});

export async function setProjectPledge(
  data: z.infer<typeof pledgeSchema>,
  ev: RequestEventAction,
) {
  const viewer = await getViewer(ev);
  if (!viewer.userId) {
    throw ev.redirect(
      302,
      `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
    );
  }

  const db = createServerSupabase(ev);

  if (data.withdraw === "true") {
    const { error } = await db
      .from("project_pledges")
      .delete()
      .eq("project_id", data.project_id)
      .eq("user_id", viewer.userId);
    if (error) {
      return ev.fail(400, {
        message: "No pudimos retirar tu compromiso. Probá de nuevo.",
      });
    }
    return { pledged: false as const };
  }

  // La RPC actualiza sólo monto y mensaje en caso de conflicto; las claves
  // del compromiso permanecen inmutables y el trigger recalcula el total.
  const { error } = await db.rpc("set_project_pledge", {
    p_project: data.project_id,
    p_amount: data.amount,
    p_message: data.message?.trim() || "",
  });

  if (error) {
    return ev.fail(400, {
      message:
        participationBlockMessage(error) ??
        (isRlsViolation(error)
          ? "Sólo pueden comprometerse quienes viven en la comunidad del proyecto."
          : "No pudimos registrar tu compromiso. Probá de nuevo."),
    });
  }

  return {
    pledged: true as const,
    amount: data.amount,
    pledgeMessage: data.message?.trim() || "",
  };
}

/** Q&A del proyecto. `parent_id` permite que el autor responda una pregunta. */
export const projectCommentSchema = z.object({
  project_id: z.string().uuid(),
  parent_id: z.string().uuid().optional().or(z.literal("")),
  body: z
    .string()
    .trim()
    .min(1, "Escribí algo.")
    .max(1000, "Máximo 1000 caracteres."),
});

export async function postProjectComment(
  data: z.infer<typeof projectCommentSchema>,
  ev: RequestEventAction,
) {
  const viewer = await getViewer(ev);
  if (!viewer.userId) {
    throw ev.redirect(
      302,
      `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
    );
  }

  const db = createServerSupabase(ev);
  const { data: posted, error } = await db
    .from("project_comments")
    .insert({
      project_id: data.project_id,
      user_id: viewer.userId,
      body: data.body,
      parent_id: data.parent_id || null,
    })
    .select("id")
    .single();

  if (error || !posted) {
    return ev.fail(400, {
      message:
        participationBlockMessage(error) ??
        (isRlsViolation(error)
          ? "Sólo pueden participar del Q&A quienes viven en la comunidad del proyecto."
          : "No pudimos publicar tu mensaje. Probá de nuevo."),
    });
  }

  return { posted: true as const, commentId: posted.id };
}
