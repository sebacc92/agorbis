import { readStoredItem, writeStoredJson } from "./browser-storage";

const MAX_SEEN_CLAIMS = 500;

/** Una fecha anterior no demuestra qué reclamos llegó a ver la persona. */
export function readSeenClaimIds(communitySlug: string): string[] | null {
  const storageKey = `agorbis-last-visit-${communitySlug}`;
  const raw = readStoredItem(storageKey);
  let seen: string[] | null = null;
  try {
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (
      saved &&
      typeof saved === "object" &&
      "version" in saved &&
      saved.version === 2 &&
      "ids" in saved &&
      Array.isArray(saved.ids) &&
      saved.ids.length <= MAX_SEEN_CLAIMS &&
      saved.ids.every(
        (id: unknown) => typeof id === "string" && id.length <= 100,
      )
    ) {
      seen = saved.ids;
    }
  } catch {
    // Una fecha antigua o un registro corrupto inicia una base visible nueva.
  }
  return seen;
}

/** Se invoca sólo al observar tarjetas en pantalla; conserva un historial acotado. */
export function markSeenClaimIds(communitySlug: string, visibleIds: string[]) {
  const seen = readSeenClaimIds(communitySlug);
  const uniqueVisible = [...new Set(visibleIds)];
  const next = [
    ...(seen ?? []).filter((id) => !uniqueVisible.includes(id)),
    ...uniqueVisible,
  ].slice(-MAX_SEEN_CLAIMS);
  return writeStoredJson(`agorbis-last-visit-${communitySlug}`, {
    version: 2,
    ids: next,
  });
}
