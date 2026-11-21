import type { Cursor } from "~/lib/cursor";
import { PAGE_SIZE } from "~/lib/constants";

/** La fila adicional sólo acredita continuación; nunca se muestra ni saltea. */
export function pollPage<T extends Cursor>(rows: T[]) {
  const polls = rows.slice(0, PAGE_SIZE);
  const last = rows.length > PAGE_SIZE ? polls[polls.length - 1] : null;
  return {
    polls,
    nextCursor: last ? { created_at: last.created_at, id: last.id } : null,
  };
}

export function pollListHref(category: string | null, cursor?: Cursor | null) {
  const params = new URLSearchParams();
  if (category) params.set("categoria", category);
  if (cursor) {
    params.set("antes", cursor.created_at);
    params.set("id", cursor.id);
  }
  const search = params.toString();
  return search ? `?${search}` : "?";
}
