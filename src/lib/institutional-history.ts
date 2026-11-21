import type { RequestEventCommon } from "@qwik.dev/router";
import type { DB } from "./supabase";
import { many } from "./query";

export const INSTITUTIONAL_HISTORY_PAGE_SIZE = 20;

/** Sólo los títulos de la página visible: como máximo una consulta por tipo. */
export async function institutionalResponseTitles(
  ev: RequestEventCommon,
  db: DB,
  responses: readonly { content_type: string; content_id: string }[],
) {
  const idsFor = (type: string) => [
    ...new Set(
      responses
        .filter((row) => row.content_type === type)
        .map((row) => row.content_id),
    ),
  ];
  const polls = idsFor("poll");
  const claims = idsFor("claim");
  const debates = idsFor("debate");
  const projects = idsFor("project");
  const groups = await Promise.all([
    polls.length
      ? many(
          ev,
          "instituciones/titulos-encuestas",
          db.from("polls").select("id, question").in("id", polls),
        ).then((rows) =>
          rows.map((row) => [`poll:${row.id}`, row.question] as const),
        )
      : [],
    claims.length
      ? many(
          ev,
          "instituciones/titulos-reclamos",
          db.from("claims").select("id, title").in("id", claims),
        ).then((rows) =>
          rows.map((row) => [`claim:${row.id}`, row.title] as const),
        )
      : [],
    debates.length
      ? many(
          ev,
          "instituciones/titulos-debates",
          db.from("debates").select("id, title").in("id", debates),
        ).then((rows) =>
          rows.map((row) => [`debate:${row.id}`, row.title] as const),
        )
      : [],
    projects.length
      ? many(
          ev,
          "instituciones/titulos-proyectos",
          db.from("projects").select("id, title").in("id", projects),
        ).then((rows) =>
          rows.map((row) => [`project:${row.id}`, row.title] as const),
        )
      : [],
  ]);
  return new Map<string, string>(groups.flat());
}
