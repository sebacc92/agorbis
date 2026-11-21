import { isUuid } from "./http";
import { normalizeHttpUrl } from "./url";

const IMAGE_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|avif)$/i;

/** Paths nuevos: no contienen el UUID del usuario ni son URLs públicas. */
export function isClaimDraftUploadPath(path: string): boolean {
  const [folder, file, extra] = path.split("/");
  return folder === "pending" && !extra && IMAGE_FILE.test(file ?? "");
}

/**
 * Acepta también el formato anterior durante las 24 h en las que una preview
 * creada justo antes de la migración todavía puede confirmarse.
 */
export function isOwnedClaimDraftUploadPath(
  path: string,
  ownerId: string,
): boolean {
  if (isClaimDraftUploadPath(path)) return true;
  const [owner, file, extra] = path.split("/");
  return (
    !extra &&
    owner?.toLowerCase() === ownerId.toLowerCase() &&
    isUuid(owner) &&
    IMAGE_FILE.test(file ?? "")
  );
}

export function claimUploadFile(path: string): string | null {
  const file = path.split("/").at(-1) ?? "";
  return IMAGE_FILE.test(file) ? file : null;
}

/** Preview autenticada; conocer el UUID aleatorio del archivo no da acceso. */
export function claimDraftMediaUrl(path: string): string | null {
  const file = claimUploadFile(path);
  return file ? `/media/reclamos/pendientes/${file}` : null;
}

/** Referencia pública que deliberadamente no revela el UUID del autor. */
export function claimPublishedMediaUrl(
  claimId: string,
  file: string,
): string | null {
  if (!isUuid(claimId) || !IMAGE_FILE.test(file)) return null;
  return `/media/reclamos/${claimId}/${file}`;
}

/**
 * Los reclamos nuevos sólo admiten el proxy del propio origen. Se conserva
 * http(s) para contenido histórico no alojado en el bucket de Agorbis.
 */
export function safeClaimMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\/media\/reclamos\/([^/]+)\/([^/?#]+)$/.exec(value);
  if (match && claimPublishedMediaUrl(match[1], match[2]) === value) {
    return value;
  }
  return normalizeHttpUrl(value);
}
