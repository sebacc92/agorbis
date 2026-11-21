import { isUuid } from "./http";

/** El ID del POST sólo permite retomar un TOTP pendiente de esta cuenta. */
export function pendingTotpForRetry(
  factors: readonly { id: string; type: string; status: string }[],
  requestedId: unknown,
): string | null {
  if (typeof requestedId !== "string" || !isUuid(requestedId)) return null;
  return factors.some(
    (factor) =>
      factor.id === requestedId &&
      factor.type === "totp" &&
      factor.status === "unverified",
  )
    ? requestedId
    : null;
}
