import type { CommunityRef } from "./community";
import type { ContentType } from "./database.types.helpers";
import type { QuotaSummary } from "./quota";

/** Sólo orienta la interfaz: RLS y el trigger vuelven a validar al publicar. */
export function publicationBlockReason(
  isMember: boolean,
  summary: QuotaSummary,
  communitySlug: string,
  type: ContentType,
): "not-member" | "quota-exhausted" | null {
  if (!isMember) return "not-member";
  // Un fallo de consulta nunca se presenta como un cupo agotado.
  if (summary.unavailable) return null;
  const entry = summary.entries.find(
    (item) => item.communitySlug === communitySlug && item.contentType === type,
  );
  return entry && entry.remaining !== null && entry.remaining <= 0
    ? "quota-exhausted"
    : null;
}

export function publicationCommunity(
  chain: CommunityRef[],
  requestedSlug: string | null | undefined,
): CommunityRef | null {
  return (
    chain.find((community) => community.slug === requestedSlug) ??
    chain.at(-1) ??
    null
  );
}

export function publicationChooserHref(
  communitySlug: string,
  type: ContentType,
): string {
  const params = new URLSearchParams({ comunidad: communitySlug, tipo: type });
  return `/publicar?${params.toString()}`;
}
