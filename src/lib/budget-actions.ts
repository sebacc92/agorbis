/* eslint-disable qwik/loader-location --
 * Estas actions reutilizables se reexportan desde la ruta de presupuesto. */
import type { RequestEventAction } from "@qwik.dev/router";
import { routeAction$, z, zod$ } from "@qwik.dev/router";
import {
  isRlsViolation,
  participationBlockMessage,
  isUniqueViolation,
} from "./db-error";
import { getViewer, requireModerator } from "./session";
import { createServerSupabase } from "./supabase";
import { optionalHttpUrlSchema } from "./url";

function budgetVoteErrorMessage(error: {
  message?: string;
  code?: string;
}): string {
  const blocked = participationBlockMessage(error);
  if (blocked) return blocked;
  if (isRlsViolation(error)) return "No podés votar esta partida.";

  const message = error.message ?? "";
  if (/La partida no existe/i.test(message)) return "La partida no existe.";
  if (/La votación de esta partida no está abierta/i.test(message)) {
    return "La votación de esta partida no está abierta.";
  }
  if (/No podés votar esta partida/i.test(message)) {
    return "No podés votar esta partida.";
  }
  if (
    isUniqueViolation(error) ||
    /AGORBIS_BUDGET_ALREADY_VOTED/i.test(message)
  ) {
    return "Ya emitiste tu reparto. No se guarda como una fila individual, por eso no se puede recuperar ni cambiar.";
  }
  if (/Ese proyecto no fue admitido en esta partida/i.test(message)) {
    return "Ese proyecto no fue admitido en esta partida.";
  }
  const maximum = /Máximo (\d+) fichas por proyecto/i.exec(message)?.[1];
  if (maximum) return `Máximo ${maximum} fichas por proyecto.`;
  const remaining = /Te quedan (\d+) fichas/i.exec(message)?.[1];
  if (remaining) return `Te quedan ${remaining} fichas.`;
  if (/El reparto de fichas no es válido/i.test(message)) {
    return "El reparto de fichas no es válido.";
  }
  if (/El reparto no puede tener fichas negativas/i.test(message)) {
    return "El reparto no puede tener fichas negativas.";
  }
  if (/Repartí al menos una ficha/i.test(message)) {
    return "Repartí al menos una ficha.";
  }
  return "No pudimos guardar tu reparto.";
}

/**
 * Emite un único reparto presupuestario secreto frente a otros usuarios.
 *
 * La RPC valida fase, elegibilidad, proyectos y topes, crea el recibo e
 * incrementa todos los tallies de forma atómica. No persiste una fila con el
 * reparto individual ni devuelve la selección a la app.
 */
export const useCastBudgetVote = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    // El reparto no se puede cambiar después: sin la confirmación explícita
    // no se envía, tampoco desde un formulario sin JavaScript.
    if (data.confirm_final !== "on") {
      return ev.fail(400, {
        message: "Confirmá que el reparto es definitivo antes de enviarlo.",
      });
    }

    const db = createServerSupabase(ev);

    const allocations = Object.fromEntries(
      Object.entries(data.tokens ?? {})
        .map(([proposalId, raw]) => [proposalId, Number(raw)] as const)
        .filter(([, tokens]) => Number.isFinite(tokens) && tokens > 0),
    );
    const { error } = await db.rpc("cast_budget_ballot", {
      p_budget: data.budget_id,
      p_allocations: allocations,
    });

    if (error) {
      return ev.fail(400, {
        // Sólo se reconstruyen los rechazos documentados de nuestras RPC. La
        // prosa completa de Postgres nunca llega al navegador.
        message: budgetVoteErrorMessage(error),
      });
    }

    return {
      saved: true as const,
    };
  },
  zod$({
    budget_id: z.string().uuid(),
    confirm_final: z.string().optional(),
    // `tokens[<proposal_id>]` desde el form; Zod lo recibe como objeto.
    tokens: z.record(
      z.string().uuid(),
      z.coerce.number().int().min(0).max(100),
    ),
  }),
);

/** Admite o rechaza una postulación durante la fase de evaluación. */
export const reviewBudgetProposalSchema = z.object({
  proposal_id: z.string().uuid(),
  decision: z.enum(["admit", "reject"]),
  rejection_note: z.string().trim().max(500).optional(),
});

/**
 * La acción se declara en la ruta (`presupuesto/index.tsx`) con
 * `invalidate: [useBudget]`: con `strictLoaders` activo, una acción que no
 * nombra sus loaders no refresca nada y la postulación seguía "pendiente" en
 * pantalla después de admitirla. El loader vive en la ruta, así que la acción
 * tiene que declararse ahí; acá queda sólo la lógica.
 */
export async function reviewBudgetProposal(
  data: z.infer<typeof reviewBudgetProposalSchema>,
  ev: RequestEventAction,
) {
  await requireModerator(ev);
  const rejectionNote = data.rejection_note?.trim() ?? "";

  if (data.decision === "reject" && rejectionNote.length < 3) {
    return ev.fail(400, {
      message: "Explicá brevemente por qué no se admite el proyecto.",
    });
  }

  const { data: reviewed, error } = await createServerSupabase(ev)
    .from("budget_proposals")
    .update({
      admitted_at: data.decision === "admit" ? new Date().toISOString() : null,
      rejection_note: data.decision === "reject" ? rejectionNote : null,
    })
    .eq("id", data.proposal_id)
    .select("id")
    .maybeSingle();

  if (error || !reviewed) {
    return ev.fail(400, {
      message:
        "No pudimos guardar la evaluación. Comprobá que la fase de revisión siga abierta.",
    });
  }

  return {
    reviewed: true as const,
    proposalId: data.proposal_id,
    decision: data.decision,
  };
}

/**
 * Postula un proyecto propio a la ronda abierta.
 *
 * Quién puede y cuándo lo decide la política `budget_proposals_insert_author`
 * de 0028: autor del proyecto, proyecto de la misma comunidad que la partida y
 * fase de admisión abierta. Acá sólo se traduce el rechazo.
 */
export const useProposeProject = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const { error } = await createServerSupabase(ev)
      .from("budget_proposals")
      .insert({
        budget_id: data.budget_id,
        project_id: data.project_id,
        requested_amount: data.requested_amount,
      });

    if (error) {
      // 23505 = ya estaba postulado. No es un error que valga la pena mostrar
      // como falla: el estado deseado ya se cumple.
      if (error.code === "23505") return { proposed: true as const };
      return ev.fail(400, {
        message:
          participationBlockMessage(error) ??
          (isRlsViolation(error)
            ? "Sólo podés postular un proyecto tuyo mientras la admisión esté abierta."
            : "No pudimos postular el proyecto."),
      });
    }
    return { proposed: true as const };
  },
  zod$({
    budget_id: z.string().uuid(),
    project_id: z.string().uuid(),
    requested_amount: z.coerce.number().positive().max(1_000_000_000_000),
  }),
);

/**
 * Publica la rendición de un proyecto que recibió partida (D59).
 *
 * Es el espejo del reloj del reclamo: mientras no exista esta fila, el proyecto
 * figura como "sin rendir" con los días a la vista.
 */
export const useSubmitBudgetReport = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const { error } = await createServerSupabase(ev)
      .from("budget_reports")
      .insert({
        budget_id: data.budget_id,
        project_id: data.project_id,
        amount_spent: data.amount_spent,
        summary: data.summary,
        evidence_url: data.evidence_url || null,
        author_id: viewer.userId,
      });

    if (error) {
      if (error.code === "23505") {
        return ev.fail(400, { message: "Ese proyecto ya tiene su rendición." });
      }
      return ev.fail(400, {
        message:
          participationBlockMessage(error) ??
          (isRlsViolation(error)
            ? "Sólo puede rendir quien creó el proyecto."
            : "No pudimos publicar la rendición."),
      });
    }
    return { reported: true as const };
  },
  zod$({
    budget_id: z.string().uuid(),
    project_id: z.string().uuid(),
    amount_spent: z.coerce.number().min(0).max(1_000_000_000_000),
    summary: z.string().trim().min(20).max(3000),
    evidence_url: optionalHttpUrlSchema,
  }),
);
