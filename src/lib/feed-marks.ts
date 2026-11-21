import { logFailure, type LogContext } from "./log";

/**
 * Marcas propias en el inicio (D117).
 *
 * La tarjeta de una encuesta abierta siempre decía "Participar del voto",
 * aunque la persona ya hubiera votado. La marca sale del recibo de
 * participación, que no guarda la elección (D68), y la de un reclamo sale del
 * apoyo propio. RLS sólo deja leer los propios: la consulta es sobre uno
 * mismo, nunca sobre otros.
 *
 * `null` en cualquiera de las dos listas significa "no se pudo leer". En ese
 * caso no se afirma nada: ni "ya votaste" ni "participá" (D74).
 */
export interface OwnMarks {
  votedPollIds: readonly string[] | null;
  supportedClaimIds: readonly string[] | null;
}

export type PollCall = "closed" | "voted" | "open" | "unknown";

/** Ids de la página por tipo, para consultar sólo lo que se muestra. */
export function feedIdsByKind(items: readonly { id: string; kind: string }[]): {
  pollIds: string[];
  claimIds: string[];
} {
  return {
    pollIds: items.filter((item) => item.kind === "poll").map((i) => i.id),
    claimIds: items.filter((item) => item.kind === "claim").map((i) => i.id),
  };
}

/** Qué le ofrece la tarjeta de una encuesta a quien mira el inicio. */
export function pollCall(
  status: string,
  pollId: string,
  marks: OwnMarks,
): PollCall {
  if (status === "closed") return "closed";
  if (marks.votedPollIds === null) return "unknown";
  return marks.votedPollIds.includes(pollId) ? "voted" : "open";
}

/** Sólo con lectura confirmada: sin ella, ningún reclamo se marca. */
export function isSupported(claimId: string, marks: OwnMarks): boolean {
  return marks.supportedClaimIds?.includes(claimId) ?? false;
}

/**
 * Ids propios de una consulta, o `null` si falló.
 *
 * El inicio no se cae por una marca: el fallo queda en el log, con su alcance
 * y el id de la petición pero sin ids ni datos de la persona, y la tarjeta
 * deja de afirmar. Cubre tanto el `error` que devuelve PostgREST como una
 * promesa rechazada (red cortada, abort). `[]` sólo cuando la consulta salió
 * bien y no había nada.
 */
export async function ownIds<K extends string>(
  context: LogContext,
  column: K,
  query: PromiseLike<{
    data: Record<K, string>[] | null;
    error: { message?: string; code?: string } | null;
  }>,
): Promise<string[] | null> {
  try {
    const { data, error } = await query;
    if (error) {
      logFailure(context, error);
      return null;
    }
    return (data ?? []).map((row) => row[column]);
  } catch (error) {
    logFailure(context, error);
    return null;
  }
}
