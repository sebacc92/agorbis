import { isUuid } from "./http";

/** Qwik puede omitir params en el POST HTML de un loader con dependencias search. */
export function projectIdFromRoute(
  params: Readonly<Record<string, string>>,
  url: URL,
): string | null {
  const candidate =
    params.id || /^\/proyectos\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1];
  if (!candidate) return null;
  try {
    const id = decodeURIComponent(candidate);
    return isUuid(id) ? id : null;
  } catch {
    return null;
  }
}
