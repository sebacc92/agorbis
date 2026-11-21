import type { ReportStatus, ReportTargetType } from "./database.types.helpers";
import type { DbErrorLike } from "./db-error";
import type { DB } from "./supabase";

/**
 * La cola de reportes, agrupada por contenido (D96).
 *
 * Mostraba primero lo más nuevo, así que un reporte viejo se hundía debajo de
 * los que seguían llegando, al revés que apelaciones y solicitudes. Había una
 * tarjeta por reporte: diez personas reportando lo mismo eran diez tarjetas
 * con el mismo contenido. Ocultar y cerrar eran dos pasos separados.
 */

/** Cada tipo de reporte vive en su tabla; esto centraliza el mapeo. */
export const REPORT_TARGETS: Record<
  ReportTargetType,
  {
    table:
      | "debate_comments"
      | "claims"
      | "projects"
      | "polls"
      | "debates"
      | "agreements";
    label: string;
    emoji: string;
  }
> = {
  debate_comment: {
    table: "debate_comments",
    label: "Comentario de debate",
    emoji: "💬",
  },
  claim: { table: "claims", label: "Reclamo", emoji: "📣" },
  project: { table: "projects", label: "Proyecto", emoji: "🛠️" },
  poll: { table: "polls", label: "Encuesta", emoji: "🗳️" },
  debate: { table: "debates", label: "Debate", emoji: "🧭" },
  agreement: { table: "agreements", label: "Acuerdo", emoji: "🤝" },
};

export type ReportFilter = ReportStatus | "todos";

/** Los reportes que todavía piden una decisión. */
export const OPEN_REPORT_STATUSES = ["pending", "reviewing"] as const;

export function isOpenReport(status: string): boolean {
  return (OPEN_REPORT_STATUSES as readonly string[]).includes(status);
}

/**
 * Pendientes y en revisión son trabajo por hacer: primero lo que más
 * esperó, como en apelaciones y solicitudes. El historial sigue mostrando
 * primero lo más reciente.
 */
export function oldestFirst(filter: ReportFilter): boolean {
  return filter === "pending" || filter === "reviewing";
}

export function reportKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export interface QueueReport {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
  reporter: string;
  preview: string | null;
  /** Estado actual del contenido reportado: `removed`, `visible`, etc. */
  contentStatus: string | null;
  href: string | null;
}

export interface QueueGroup {
  key: string;
  target_type: ReportTargetType;
  target_id: string;
  preview: string | null;
  contentStatus: string | null;
  href: string | null;
  /** Los reportes de esta página, en el orden de la cola. */
  reports: QueueReport[];
  /**
   * Reportes abiertos de este contenido en toda la cola, no sólo en esta
   * página: es lo que cierra "Ocultar y resolver".
   */
  openCount: number;
}

/**
 * Una tarjeta por contenido, en el orden en que aparece su primer reporte.
 * `openCounts` trae el total abierto por contenido; si falta, se cuenta lo
 * que hay en la página.
 */
export function groupReports(
  reports: readonly QueueReport[],
  openCounts: ReadonlyMap<string, number> = new Map(),
): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const report of reports) {
    const key = reportKey(report.target_type, report.target_id);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        target_type: report.target_type,
        target_id: report.target_id,
        preview: report.preview,
        contentStatus: report.contentStatus,
        href: report.href,
        reports: [],
        openCount: 0,
      };
      groups.set(key, group);
    }
    group.reports.push(report);
  }
  for (const group of groups.values()) {
    const onPage = group.reports.filter((report) =>
      isOpenReport(report.status),
    ).length;
    group.openCount = Math.max(openCounts.get(group.key) ?? 0, onPage);
  }
  return [...groups.values()];
}

/** Cuántos reportes abiertos tiene cada contenido, a partir de sus filas. */
export function countOpenReports(
  rows: readonly { target_type: string; target_id: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = reportKey(row.target_type, row.target_id);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export type CloseReportsResult =
  | { ok: true; closed: number }
  | { ok: false; stage: "hide" | "close"; error: DbErrorLike | null };

/**
 * Cierra de una vez los reportes abiertos de un contenido y, si se pide, lo
 * oculta antes. Son dos escrituras: si ocultar falla no se cierra nada; si
 * falla el cierre, el contenido ya quedó oculto y se dice así. Cada reporte
 * pasa por `guard_report_update` y avisa a quien lo hizo (0046).
 */
/**
 * Ocultar lo reportado. Un acuerdo no admite UPDATE directo (0074: nadie
 * escribe en `agreements`), así que pasa por `moderate_agreement`, que además
 * oculta sus rondas y deja rastro (D120). El resto sigue siendo la policy de
 * moderación sobre la tabla.
 */
export async function hideReportedContent(
  db: DB,
  targetType: ReportTargetType,
  targetId: string,
): Promise<{ ok: true } | { ok: false; error: DbErrorLike | null }> {
  if (targetType === "agreement") {
    const { error } = await db.rpc("moderate_agreement", {
      p_agreement: targetId,
      p_action: "hide",
    });
    return error ? { ok: false, error } : { ok: true };
  }
  const { data: hidden, error } = await db
    .from(REPORT_TARGETS[targetType].table)
    .update({ status: "removed" })
    .eq("id", targetId)
    .select("id")
    .maybeSingle();
  if (error || !hidden) return { ok: false, error };
  return { ok: true };
}

export async function closeReportsForTarget(
  db: DB,
  input: {
    targetType: ReportTargetType;
    targetId: string;
    status: "resolved" | "dismissed";
    hide: boolean;
  },
): Promise<CloseReportsResult> {
  if (input.hide) {
    const hide = await hideReportedContent(
      db,
      input.targetType,
      input.targetId,
    );
    if (!hide.ok) return { ok: false, stage: "hide", error: hide.error };
  }

  const { data: closed, error } = await db
    .from("reports")
    .update({ status: input.status })
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .in("status", [...OPEN_REPORT_STATUSES])
    .select("id");
  if (error) return { ok: false, stage: "close", error };
  return { ok: true, closed: closed?.length ?? 0 };
}
