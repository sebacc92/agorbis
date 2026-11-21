import { globalAction$, zod$, z } from "@qwik.dev/router";
import { isRlsViolation, participationBlockMessage } from "./db-error";
import { getViewer } from "./session";
import { createServerSupabase } from "./supabase";

/** "Me afecta también": alta o baja del apoyo, según el estado actual. */
export const useToggleSupport = globalAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const db = createServerSupabase(ev);

    if (data.supporting === "true") {
      const { error } = await db
        .from("claim_supports")
        .delete()
        .eq("claim_id", data.claim_id)
        .eq("user_id", viewer.userId);
      if (error) {
        return ev.fail(400, {
          message: "No pudimos quitar tu apoyo. Probá de nuevo.",
        });
      }
      return { supporting: false as const };
    }

    const { error } = await db
      .from("claim_supports")
      .insert({ claim_id: data.claim_id, user_id: viewer.userId });

    // 23505 = ya lo apoyaba; no es un error que valga la pena mostrar.
    if (error && error.code !== "23505") {
      return ev.fail(400, {
        message:
          participationBlockMessage(error) ??
          (isRlsViolation(error)
            ? "Sólo pueden apoyar este reclamo quienes viven en esa comunidad."
            : "No pudimos registrar tu apoyo. Probá de nuevo."),
      });
    }

    return { supporting: true as const };
  },
  zod$({ claim_id: z.string().uuid(), supporting: z.string() }),
);
