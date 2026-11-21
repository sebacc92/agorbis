/** Cero sólo significa vacío después de una lectura correcta. */
export function communityCount(result: {
  count: number | null;
  error: unknown;
}): number | null {
  return !result.error &&
    Number.isSafeInteger(result.count) &&
    result.count! >= 0
    ? result.count
    : null;
}

export function sumCommunityCounts(
  ...counts: (number | null)[]
): number | null {
  return counts.some((count) => count === null)
    ? null
    : counts.reduce<number>((total, count) => total + count!, 0);
}
