import { OPEN_CLAIM_STATUSES } from "~/lib/claim-stats";

/** Cuenta sólo los resultados cargados; no supone cobertura de todo el territorio. */
export function mapClaimSummary(
  claims: readonly { status: string; support_count: number }[],
): { statusCounts: Record<string, number>; criticalPoints: number } {
  const openStates: ReadonlySet<string> = new Set(OPEN_CLAIM_STATUSES);
  const statusCounts: Record<string, number> = {};
  let criticalPoints = 0;
  for (const claim of claims) {
    statusCounts[claim.status] = (statusCounts[claim.status] ?? 0) + 1;
    if (openStates.has(claim.status) && claim.support_count >= 5)
      criticalPoints++;
  }
  return { statusCounts, criticalPoints };
}
