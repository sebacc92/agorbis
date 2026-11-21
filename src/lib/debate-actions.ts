import { globalAction$, server$, zod$, z } from "@qwik.dev/router";
import { COMMENT_COOLDOWN_SECONDS } from "./constants";
import { isRlsViolation, participationBlockMessage } from "./db-error";
import { createServerSupabase } from "./supabase";
import { isUuid } from "./http";
import { getViewer } from "./session";
import { loadDebateCommentPage } from "./debate-comments";
import type { DebateCommentData } from "~/components/debates/CommentCard";

/** Lectura bajo demanda con la misma sesión y RLS que el detalle. */
export const fetchDebateComments = server$(async function (input: unknown) {
  return loadDebateCommentPage(
    createServerSupabase(this),
    (await getViewer(this)).userId,
    input,
  );
});

/**
 * Voto a un comentario. Es un `server$` y no una action porque hay decenas de
 * botones por página: con una action compartida, todos mostrarían el estado de
 * carga del que se apretó. Así cada tarjeta maneja su propio estado.
 *
 * Devuelve el score recalculado, que es la única fuente de verdad.
 */
export const voteComment = server$(async function (
  commentId: string,
  value: -1 | 0 | 1,
) {
  // Un id que no es UUID o un valor fuera de rango no son fallos de la base:
  // "No pudimos registrar tu voto" invitaba a reintentar algo imposible.
  if (!isUuid(commentId) || ![-1, 0, 1].includes(value)) {
    return {
      ok: false as const,
      message: "Ese comentario ya no está disponible.",
    };
  }
  const db = createServerSupabase(this);
  const viewer = await getViewer(this);

  if (!viewer.userId) {
    return { ok: false as const, message: "Necesitás una cuenta para votar." };
  }

  if (value === 0) {
    const { error } = await db
      .from("comment_votes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", viewer.userId);
    if (error) {
      return { ok: false as const, message: "No pudimos quitar tu voto." };
    }
  } else {
    // RLS exige residir en la comunidad dueña del debate.
    const { error } = await db.rpc("set_comment_vote", {
      p_comment: commentId,
      p_value: value,
    });

    if (error) {
      return {
        ok: false as const,
        message:
          participationBlockMessage(error) ??
          (isRlsViolation(error)
            ? "Sólo pueden votar quienes viven en esta comunidad."
            : "No pudimos registrar tu voto."),
      };
    }
  }

  // El trigger `sync_comment_score` ya actualizó el score: lo leemos de vuelta.
  const { data, error: scoreError } = await db
    .from("debate_comments")
    .select("score")
    .eq("id", commentId)
    .maybeSingle();

  if (scoreError || !data) {
    return {
      ok: false as const,
      message: "El voto se guardó, pero no pudimos actualizar el puntaje.",
    };
  }

  return { ok: true as const, score: data.score, value };
});

/**
 * Publicar un comentario en una columna del debate.
 *
 * La validación dura vive en la base: RLS comprueba `is_member` sobre la
 * columna y el trigger `enforce_debate_column` verifica que sea hija directa
 * del debate y aplica el rate limit. Acá sólo traducimos errores.
 */
export const usePostComment = globalAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const db = createServerSupabase(ev);
    const { data: saved, error } = await db
      .from("debate_comments")
      .insert({
        debate_id: data.debate_id,
        column_community_id: data.column_community_id,
        user_id: viewer.userId,
        body: data.body,
      })
      .select("id, body, score, created_at")
      .single();

    if (error) {
      const message =
        participationBlockMessage(error) ??
        (/Esperá unos segundos/i.test(error.message)
          ? `Esperá ${COMMENT_COOLDOWN_SECONDS} segundos entre comentarios.`
          : /no es una sub-comunidad/i.test(error.message)
            ? "Esa columna no pertenece a este debate."
            : /cerrado/i.test(error.message)
              ? "Este debate está cerrado."
              : isRlsViolation(error)
                ? "Sólo podés comentar en la columna de la comunidad donde vivís."
                : "No pudimos publicar tu comentario. Probá de nuevo.");
      return ev.fail(400, { message });
    }

    const profile = viewer.profile;
    return {
      posted: true as const,
      debateId: data.debate_id,
      columnId: data.column_community_id,
      postedComment: {
        ...saved!,
        author: profile
          ? {
              id: profile.id,
              username: profile.username,
              display_name: profile.display_name,
              avatar_url: profile.avatar_url,
            }
          : null,
        myVote: 0,
      } satisfies DebateCommentData,
    };
  },
  zod$({
    debate_id: z.string().uuid(),
    column_community_id: z.string().uuid(),
    body: z
      .string()
      .trim()
      .min(1, "Escribí algo antes de publicar.")
      .max(1000, "Máximo 1000 caracteres."),
  }),
);
