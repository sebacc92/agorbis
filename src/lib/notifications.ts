import type { IconName } from "~/components/ui/Icon";
import type { Tables } from "./database.types";
import type { Cursor } from "./cursor";
import {
  CONTENT_KINDS,
  CONTENT_KIND_TONES,
  isContentKind,
} from "./content-kinds";
import { isUuid, safeInternalPath } from "./http";

export const NOTIFICATIONS_PAGE_SIZE = 50;
export const NOTIFICATION_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "reply", label: "Respuestas y comentarios" },
  { value: "poll_closed", label: "Cierres de encuestas" },
  { value: "claim_update", label: "Avances de reclamos" },
  { value: "project_update", label: "Avances de proyectos" },
  { value: "institutional_response", label: "Respuestas institucionales" },
  { value: "essential", label: "Cuenta, moderación y solicitudes" },
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["value"];

export const NOTIFICATION_PREFERENCES = [
  { key: "replies", label: "Respuestas y comentarios" },
  { key: "poll_results", label: "Cierres de encuestas" },
  { key: "claim_updates", label: "Avances de reclamos" },
  { key: "project_updates", label: "Avances de proyectos" },
  { key: "institutional_responses", label: "Respuestas institucionales" },
] as const;
export const DEFAULT_NOTIFICATION_PREFERENCES = {
  replies: true,
  poll_results: true,
  claim_updates: true,
  project_updates: true,
  institutional_responses: true,
};

/** Sólo resume las filas visibles de la página, sin atribuirles un período. */
export function notificationPageCounts(
  items: readonly Pick<Tables<"notifications">, "type" | "read_at">[],
) {
  return {
    shown: items.length,
    unread: items.filter((item) => !item.read_at).length,
    claims: items.filter((item) => item.type === "claim_update").length,
    replies: items.filter((item) => item.type === "reply").length,
    institutional: items.filter(
      (item) => item.type === "institutional_response",
    ).length,
    polls: items.filter((item) => item.type === "poll_closed").length,
  };
}

export interface NotificationVisual {
  icon: IconName;
  /** Fondo y color de la ficha, como cadenas completas para Tailwind. */
  tone: string;
}

const INSTITUTIONAL_TONE = "bg-brand-50 text-brand dark:bg-brand-950/40";
const NEUTRAL_TONE = "bg-muted text-ink-muted";

/**
 * Ícono y color de la ficha de un aviso (D126).
 *
 * Cada fila dibujaba un emoji elegido por `type`, y un aviso de reclamo
 * buscaba "Victoria" en el título, algo que la base nunca escribe. Lo que
 * dice de qué trata un aviso es `entity_type`: un comentario en un debate,
 * el cierre de una encuesta o el avance de un proyecto toman el ícono y el
 * color de su tipo de contenido, igual que en el feed. La respuesta
 * institucional va antes porque su origen pesa más que el contenido que
 * responde, y lo de cuenta, moderación y solicitudes queda neutro: no es
 * contenido de nadie.
 */
export function notificationVisual(
  type: string,
  entityType: string | null,
): NotificationVisual {
  if (type === "institutional_response") {
    return { icon: "building", tone: INSTITUTIONAL_TONE };
  }
  if (entityType && isContentKind(entityType)) {
    const tone = CONTENT_KIND_TONES[entityType];
    return {
      icon: CONTENT_KINDS[entityType].icon,
      tone: `${tone.bg} ${tone.text}`,
    };
  }
  if (/^(account|appeal|report)_/.test(type)) {
    return { icon: "shield", tone: NEUTRAL_TONE };
  }
  if (type.startsWith("request_")) {
    return { icon: "file-text", tone: NEUTRAL_TONE };
  }
  return { icon: "bell", tone: NEUTRAL_TONE };
}

export interface NotificationFilters {
  unreadOnly: boolean;
  type: NotificationType;
  communityId: string;
}

export function readNotificationFilters(
  params: URLSearchParams,
): NotificationFilters {
  const type = params.get("tipo") ?? "";
  const community = params.get("comunidad") ?? "";
  return {
    unreadOnly: params.get("sin_leer") === "1",
    type: NOTIFICATION_TYPES.some((option) => option.value === type)
      ? (type as NotificationType)
      : "",
    communityId: isUuid(community) ? community : "",
  };
}

export function notificationFilterArguments(filters: NotificationFilters) {
  return {
    p_unread_only: filters.unreadOnly,
    p_type: filters.type || undefined,
    p_community_id: filters.communityId || undefined,
  };
}

export function notificationListHref(
  filters: NotificationFilters,
  cursor?: Cursor,
): string {
  const params = new URLSearchParams();
  if (filters.unreadOnly) params.set("sin_leer", "1");
  if (filters.type) params.set("tipo", filters.type);
  if (filters.communityId) params.set("comunidad", filters.communityId);
  if (cursor) {
    params.set("antes", cursor.created_at);
    params.set("id", cursor.id);
  }
  return `/notificaciones${params.size ? `?${params}` : ""}`;
}

export function notificationInboxPage(value: unknown) {
  const inbox = value as {
    items: Tables<"notifications">[];
    total: number;
    unread: number;
    has_more: boolean;
  } | null;
  if (
    !inbox ||
    !Array.isArray(inbox.items) ||
    !Number.isSafeInteger(inbox.total) ||
    !Number.isSafeInteger(inbox.unread) ||
    inbox.total < 0 ||
    inbox.unread < 0 ||
    inbox.unread > inbox.total ||
    typeof inbox.has_more !== "boolean"
  ) {
    throw new Error("La bandeja devolvió una respuesta incompleta.");
  }
  const items = inbox.items.map((item) => ({
    ...item,
    href: safeInternalPath(item.href, "/notificaciones"),
  }));
  return {
    items,
    total: inbox.total,
    unread: inbox.unread,
    nextCursor:
      inbox.has_more && items.length === NOTIFICATIONS_PAGE_SIZE
        ? { created_at: items.at(-1)!.created_at, id: items.at(-1)!.id }
        : undefined,
  };
}
