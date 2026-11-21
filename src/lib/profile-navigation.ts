export const PROFILE_SECTIONS = [
  "resumen",
  "publicaciones",
  "guardados",
  "cuenta",
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export function readProfileSection(
  params: URLSearchParams,
  submittedForm = false,
): ProfileSection {
  const section = params.get("seccion");
  return PROFILE_SECTIONS.includes(section as ProfileSection)
    ? (section as ProfileSection)
    : submittedForm
      ? "cuenta"
      : "resumen";
}

export function profileSectionHref(url: URL, section: ProfileSection): string {
  const params = new URLSearchParams(url.searchParams);
  params.set("seccion", section);
  return `${url.pathname}?${params}${url.hash}`;
}
import { beforeCursor, readCursor, type Cursor } from "./cursor";

export const ACTIVITY_KINDS = [
  "voto",
  "comentario",
  "apoyo",
  "compromiso",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const PUBLICATION_KINDS = [
  "poll",
  "debate",
  "claim",
  "project",
] as const;
export type PublicationKind = (typeof PUBLICATION_KINDS)[number];
export interface ProfilePublicationCursor extends Cursor {
  kind: PublicationKind;
}

export function readProfilePublicationCursor(
  params: URLSearchParams,
): ProfilePublicationCursor | null {
  const cursor = readProfileCursor(params, "publicaciones");
  const kind = params.get("publicaciones_tipo") as PublicationKind;
  return cursor && PUBLICATION_KINDS.includes(kind)
    ? { ...cursor, kind }
    : null;
}

/** Las cuatro fuentes comparten orden, también cuando coinciden fecha e ID. */
export function publicationCursorFilter(
  cursor: ProfilePublicationCursor | null,
  kind: PublicationKind,
): string | null {
  if (!cursor) return null;
  const order =
    PUBLICATION_KINDS.indexOf(kind) - PUBLICATION_KINDS.indexOf(cursor.kind);
  return order === 0
    ? beforeCursor(cursor)
    : `created_at.${order < 0 ? "lte" : "lt"}.${cursor.created_at}`;
}

export function comparePublications(
  a: ProfilePublicationCursor,
  b: ProfilePublicationCursor,
): number {
  return (
    b.created_at.localeCompare(a.created_at) ||
    PUBLICATION_KINDS.indexOf(b.kind) - PUBLICATION_KINDS.indexOf(a.kind) ||
    b.id.localeCompare(a.id)
  );
}
export function readActivityFilter(
  params: URLSearchParams,
): ActivityKind | "all" {
  const kind = params.get("actividad_filtro") as ActivityKind;
  return ACTIVITY_KINDS.includes(kind) ? kind : "all";
}
export function profileActivityFilterHref(
  url: URL,
  kind: ActivityKind | "all",
): string {
  const target = new URL(
    profilePageHref(url, "publicaciones", "actividad"),
    url,
  );
  if (kind === "all") target.searchParams.delete("actividad_filtro");
  else target.searchParams.set("actividad_filtro", kind);
  return `${target.pathname}?${target.searchParams}${target.hash}`;
}
export interface ProfileActivityCursor extends Cursor {
  kind: ActivityKind;
}

export function readProfileCursor(
  params: URLSearchParams,
  prefix: string,
): Cursor | null {
  return readCursor(
    new URLSearchParams({
      antes: params.get(`${prefix}_antes`) ?? "",
      id: params.get(`${prefix}_id`) ?? "",
    }),
  );
}

export function readProfileActivityCursor(
  params: URLSearchParams,
): ProfileActivityCursor | null {
  const cursor = readProfileCursor(params, "actividad");
  const kind = params.get("actividad_tipo") as ActivityKind;
  return cursor && ACTIVITY_KINDS.includes(kind) ? { ...cursor, kind } : null;
}

/** Cada fuente respeta el mismo orden global: instante, tipo e identificador. */
export function activityCursorFilter(
  cursor: ProfileActivityCursor | null,
  kind: ActivityKind,
  dateColumn: string,
  idColumn: string,
): string | null {
  if (!cursor) return null;
  const order =
    ACTIVITY_KINDS.indexOf(kind) - ACTIVITY_KINDS.indexOf(cursor.kind);
  if (order !== 0)
    return `${dateColumn}.${order < 0 ? "lte" : "lt"}.${cursor.created_at}`;
  return beforeCursor(cursor)
    .replaceAll("created_at", dateColumn)
    .replaceAll("id.", `${idColumn}.`);
}

export function compareActivity(
  a: { created_at: string; kind: ActivityKind; id: string },
  b: { created_at: string; kind: ActivityKind; id: string },
): number {
  return (
    b.created_at.localeCompare(a.created_at) ||
    ACTIVITY_KINDS.indexOf(b.kind) - ACTIVITY_KINDS.indexOf(a.kind) ||
    b.id.localeCompare(a.id)
  );
}

export function profilePageHref(
  url: URL,
  section: ProfileSection,
  prefix: "actividad" | "seguidos" | "publicaciones",
  cursor?: Cursor & { kind?: ActivityKind | PublicationKind },
): string {
  const target = new URL(profileSectionHref(url, section), url);
  for (const suffix of ["antes", "id", "tipo"])
    target.searchParams.delete(`${prefix}_${suffix}`);
  if (cursor) {
    target.searchParams.set(`${prefix}_antes`, cursor.created_at);
    target.searchParams.set(`${prefix}_id`, cursor.id);
    if (cursor.kind) target.searchParams.set(`${prefix}_tipo`, cursor.kind);
  }
  return `${target.pathname}?${target.searchParams}${target.hash}`;
}
