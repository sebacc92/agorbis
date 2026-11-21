import type { ContentType } from "./database.types.helpers";
import { isUuid } from "./http";
import { logFailure } from "./log";
import type { DB } from "./supabase";

export interface RelationSelectionCandidate {
  kind: ContentType;
  id: string;
}
export interface ConfirmedRelationSelection extends RelationSelectionCandidate {
  title: string;
}

/** La URL identifica el destino; su título y disponibilidad vienen de RLS. */
export async function loadRelationSelection(
  db: DB,
  candidate?: RelationSelectionCandidate | null,
): Promise<{ selection: ConfirmedRelationSelection | null; failed: boolean }> {
  if (!candidate || !isUuid(candidate.id))
    return { selection: null, failed: false };

  try {
    const query =
      candidate.kind === "poll"
        ? db
            .from("polls")
            .select("id, title:question")
            .eq("id", candidate.id)
            .neq("status", "removed")
            // Una ronda de acuerdo (D118) no se vincula como encuesta.
            .is("agreement_id", null)
            .maybeSingle()
        : candidate.kind === "debate"
          ? db
              .from("debates")
              .select("id, title")
              .eq("id", candidate.id)
              .neq("status", "removed")
              .maybeSingle()
          : candidate.kind === "claim"
            ? db
                .from("claims")
                .select("id, title")
                .eq("id", candidate.id)
                .neq("status", "removed")
                .maybeSingle()
            : candidate.kind === "project"
              ? db
                  .from("projects")
                  .select("id, title")
                  .eq("id", candidate.id)
                  .neq("status", "removed")
                  .maybeSingle()
              : null;
    if (!query) return { selection: null, failed: false };
    const { data, error } = await query;
    if (error) {
      logFailure({ scope: "relaciones/seleccion" }, error);
      return { selection: null, failed: true };
    }
    return {
      selection: data
        ? { kind: candidate.kind, id: data.id, title: data.title }
        : null,
      failed: false,
    };
  } catch (error) {
    logFailure({ scope: "relaciones/seleccion" }, error);
    return { selection: null, failed: true };
  }
}
