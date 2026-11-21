import type { Locale } from "./i18n";
import { translate } from "./i18n";

const STATUS_LABELS: Readonly<Record<string, string>> = {
  active: "Activa",
  open: "Abierto",
  under_review: "En evaluación",
  acknowledged: "Recibido",
  funding: "Juntando apoyo",
  in_progress: "En ejecución",
  resolved: "Resuelto",
  completed: "Completado",
  closed: "Cerrado",
  proposal: "Propuesta",
  rejected: "Respuesta negativa",
  removed: "Eliminado",
  pending: "Pendiente",
  approved: "Aprobado",
  duplicate: "Duplicado",
};

export function localizeStatus(locale: Locale, status: string): string {
  return translate(locale, STATUS_LABELS[status] ?? status);
}

/**
 * Las notificaciones guardan el contenido original seguido por ` · status`.
 * Sólo localizamos ese último token del sistema; el resto puede haber sido
 * escrito por una persona y se conserva literalmente.
 */
export function localizeNotificationBody(locale: Locale, body: string): string {
  const separator = " · ";
  const index = body.lastIndexOf(separator);
  if (index < 0) return body;

  const status = body.slice(index + separator.length);
  if (!STATUS_LABELS[status]) return body;
  return `${body.slice(0, index)}${separator}${localizeStatus(locale, status)}`;
}

/** Traduce el título que crea el trigger; los títulos editoriales quedan intactos. */
export function localizeClaimEventTitle(
  locale: Locale,
  title: string,
  status: string | null,
): string {
  if (!status || !title.startsWith("Estado actualizado a ")) return title;
  return translate(locale, "Estado actualizado a {{status}}", {
    status: localizeStatus(locale, status),
  });
}
