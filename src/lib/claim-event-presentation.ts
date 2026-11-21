import { safeClaimMediaUrl } from "./claim-media";

type EventKind = { event_type: string; organization_id: string | null };

/** Una resolución del autor no acredita una respuesta de una institución. */
export function isOfficialClaimEvent(event: EventKind): boolean {
  return (
    event.event_type === "official_response" ||
    (event.event_type === "resolution" && !!event.organization_id)
  );
}

export function isClaimProgressEvent(event: EventKind): boolean {
  return (
    event.event_type === "status_change" ||
    event.event_type === "update" ||
    (event.event_type === "resolution" && !event.organization_id)
  );
}

/** No carga documentos ni imágenes de orígenes que la CSP no admite. */
export function claimResolutionEvidence(
  events: { event_type: string; evidence_url: string | null }[],
  siteOrigin: string,
  supabaseUrl?: string,
): { url: string; kind: "image" | "link" } | null {
  const event = [...events]
    .reverse()
    .find((item) => item.event_type === "resolution" && item.evidence_url);
  const safe = safeClaimMediaUrl(event?.evidence_url);
  if (!safe) return null;
  const url = new URL(safe, siteOrigin);
  let storageOrigin: string | undefined;
  try {
    storageOrigin = supabaseUrl ? new URL(supabaseUrl).origin : undefined;
  } catch {
    /* Configuración inválida no amplía los orígenes. */
  }
  const admittedOrigin =
    url.origin === new URL(siteOrigin).origin || url.origin === storageOrigin;
  const image =
    admittedOrigin && /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname);
  return { url: safe, kind: image ? "image" : "link" };
}
