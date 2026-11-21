import type { RequestEventBase } from "@qwik.dev/router";

type TrustedIpEvent = Pick<RequestEventBase, "env" | "request">;

function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
    )
  );
}

function isIpv6(value: string): boolean {
  if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    const parsed = new URL(`http://[${value}]/`);
    return parsed.hostname.length > 2;
  } catch {
    return false;
  }
}

/**
 * Cloudflare reemplaza `CF-Connecting-IP` en el edge. Sólo se confía en el
 * header cuando el binding server-only identifica explícitamente ese runtime.
 * Se exige una única IP literal: nunca se interpreta una lista forwarded.
 */
export function getTrustedClientIp(ev: TrustedIpEvent): string | undefined {
  if (ev.env.get("AGORBIS_RUNTIME") !== "cloudflare-workers") {
    return undefined;
  }

  const candidate = ev.request.headers.get("CF-Connecting-IP");
  if (
    !candidate ||
    candidate.length > 64 ||
    candidate !== candidate.trim() ||
    candidate.includes(",")
  ) {
    return undefined;
  }
  return isIpv4(candidate) || isIpv6(candidate) ? candidate : undefined;
}
