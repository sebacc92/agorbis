import { contentHref } from "./community";
import { logFailure } from "./log";
import type { DbErrorLike } from "./db-error";
import type { ContentType, Tables } from "./database.types.helpers";
import type { DB } from "./supabase";
import { safeHttpUrl } from "./url";
import {
  loadRelationSelection,
  type ConfirmedRelationSelection,
  type RelationSelectionCandidate,
} from "./relation-selection";

export type PublicContentSource = Omit<Tables<"content_sources">, "added_by">;

export type InstitutionalResponseView = Omit<
  Tables<"institutional_responses">,
  "author_id"
> & {
  organization: Pick<
    Tables<"organizations">,
    "id" | "name" | "slug" | "type" | "logo_url"
  > | null;
};

export interface RelatedContentView {
  relationId: string;
  type: ContentType;
  id: string;
  title: string;
  href: string;
  relationType: Tables<"content_relations">["relation_type"];
}

export interface ContentExtensions {
  loadFailures: {
    sources: boolean;
    responses: boolean;
    representation: boolean;
    related: boolean;
  };
  sources: PublicContentSource[];
  responses: InstitutionalResponseView[];
  related: RelatedContentView[];
  selectedRelation?: ConfirmedRelationSelection | null;
  myOrganizations: Pick<
    Tables<"organizations">,
    "id" | "name" | "slug" | "type"
  >[];
}

/**
 * Títulos de las publicaciones relacionadas, en una consulta por tipo.
 *
 * Antes se resolvía uno por uno: una publicación con veinte relaciones hacía
 * veinte viajes a la base para leer veinte títulos. Como los tipos son cuatro,
 * agrupar por tipo acota el costo a cuatro consultas como máximo, sin importar
 * cuántas relaciones tenga.
 *
 * La clave del mapa es `tipo:id` porque los ids son UUID de tablas distintas y
 * nada garantiza que no se repitan entre tablas.
 */
async function loadRelatedTitles(
  db: DB,
  wanted: { type: ContentType; id: string }[],
) {
  let failed = false;
  const readTitles = async <
    R extends { data: unknown; error: DbErrorLike | null },
  >(
    scope: string,
    query: PromiseLike<R>,
    fallback: NonNullable<R["data"]>,
  ): Promise<NonNullable<R["data"]>> => {
    const result = await query;
    if (result.error) {
      failed = true;
      logFailure({ scope }, result.error);
      return fallback;
    }
    return (result.data ?? fallback) as NonNullable<R["data"]>;
  };
  const idsByType = new Map<ContentType, Set<string>>();
  for (const { type, id } of wanted) {
    const ids = idsByType.get(type) ?? new Set<string>();
    ids.add(id);
    idsByType.set(type, ids);
  }

  const titles = new Map<string, string>();
  const remember = (
    type: ContentType,
    rows: { id: string; title: string }[],
  ) => {
    for (const row of rows) titles.set(`${type}:${row.id}`, row.title);
  };

  // Una consulta por tipo, escrita a mano: el `select` de Supabase se tipa
  // desde el literal, así que armarlo por interpolación perdería el chequeo de
  // que la columna existe en esa tabla.
  const fetchTitles = async (type: ContentType, ids: string[]) => {
    // Conserva los títulos disponibles y señala que el listado es parcial.
    if (type === "poll") {
      // La encuesta guarda su título en `question` y no en `title`.
      const rows = await readTitles(
        "relaciones/encuestas",
        db.from("polls").select("id, question").in("id", ids),
        [],
      );
      remember(
        type,
        rows.map((row) => ({ id: row.id, title: row.question })),
      );
    } else if (type === "debate") {
      remember(
        type,
        await readTitles(
          "relaciones/debates",
          db.from("debates").select("id, title").in("id", ids),
          [],
        ),
      );
    } else if (type === "claim") {
      remember(
        type,
        await readTitles(
          "relaciones/reclamos",
          db.from("claims").select("id, title").in("id", ids),
          [],
        ),
      );
    } else {
      remember(
        type,
        await readTitles(
          "relaciones/proyectos",
          db.from("projects").select("id, title").in("id", ids),
          [],
        ),
      );
    }
  };

  await Promise.all(
    [...idsByType].map(([type, ids]) => fetchTitles(type, [...ids])),
  );
  return { titles, failed };
}

export async function loadContentExtensions(
  db: DB,
  type: ContentType,
  id: string,
  userId: string | null,
  selected?: RelationSelectionCandidate | null,
): Promise<ContentExtensions> {
  const [sourcesRes, responsesRes, relationsRes, membershipsRes, selectionRes] =
    await Promise.all([
      db
        .from("content_sources")
        .select(
          "id, content_type, content_id, title, url, publisher, published_at, verified_at, created_at",
        )
        .eq("content_type", type)
        .eq("content_id", id)
        .order("published_at", { ascending: false, nullsFirst: false }),
      db
        .from("institutional_responses")
        .select(
          "id, organization_id, content_type, content_id, response_type, body, source_url, created_at",
        )
        .eq("content_type", type)
        .eq("content_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("content_relations")
        .select(
          "id, source_type, source_id, target_type, target_id, relation_type, created_at",
        )
        .or(
          `and(source_type.eq.${type},source_id.eq.${id}),and(target_type.eq.${type},target_id.eq.${id})`,
        )
        .order("created_at", { ascending: false }),
      userId
        ? db
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", userId)
        : Promise.resolve({
            data: [] as { organization_id: string }[],
            error: null,
          }),
      loadRelationSelection(db, selected),
    ]);

  const organizationIds = [
    ...(responsesRes.data ?? []).map((response) => response.organization_id),
    ...(membershipsRes.data ?? []).map(
      (membership) => membership.organization_id,
    ),
  ];
  const uniqueOrganizationIds = [...new Set(organizationIds)];
  const organizationsRes =
    uniqueOrganizationIds.length > 0
      ? await db
          .from("organizations")
          .select("id, name, slug, type, logo_url")
          .in("id", uniqueOrganizationIds)
      : { data: [], error: null };
  for (const [scope, result] of [
    ["extensiones/fuentes", sourcesRes],
    ["extensiones/respuestas", responsesRes],
    ["extensiones/relaciones", relationsRes],
    ["extensiones/representacion", membershipsRes],
    ["extensiones/organizaciones", organizationsRes],
  ] as const) {
    if (result.error) logFailure({ scope }, result.error);
  }
  const organizations = new Map(
    (organizationsRes.data ?? []).map((org) => [org.id, org]),
  );

  const relations = (relationsRes.data ?? []).map((relation) => {
    const fromSource =
      relation.source_type === type && relation.source_id === id;
    return {
      relation,
      type: (fromSource
        ? relation.target_type
        : relation.source_type) as ContentType,
      id: fromSource ? relation.target_id : relation.source_id,
    };
  });

  const { titles, failed: titleLoadFailed } = await loadRelatedTitles(
    db,
    relations,
  );
  const related = relations.map(
    ({
      relation,
      type: relatedType,
      id: relatedId,
    }): RelatedContentView | null => {
      const title = titles.get(`${relatedType}:${relatedId}`);
      return title
        ? {
            relationId: relation.id,
            type: relatedType,
            id: relatedId,
            title,
            href: contentHref(relatedType, relatedId),
            relationType: relation.relation_type,
          }
        : null;
    },
  );

  return {
    loadFailures: {
      sources: !!sourcesRes.error,
      responses:
        !!responsesRes.error ||
        (!!responsesRes.data?.length && !!organizationsRes.error),
      representation:
        !!membershipsRes.error ||
        (!!membershipsRes.data?.length && !!organizationsRes.error),
      related: !!relationsRes.error || titleLoadFailed || selectionRes.failed,
    },
    sources: (sourcesRes.data ?? []).flatMap((source) => {
      const url = safeHttpUrl(source.url);
      return url ? [{ ...source, url }] : [];
    }),
    responses: (responsesRes.data ?? []).map((response) => ({
      ...response,
      source_url: safeHttpUrl(response.source_url),
      organization: organizations.get(response.organization_id) ?? null,
    })),
    related: related.filter((item): item is RelatedContentView => !!item),
    selectedRelation: selectionRes.selection,
    myOrganizations: (membershipsRes.data ?? [])
      .map((membership) => organizations.get(membership.organization_id))
      .filter((org): org is NonNullable<typeof org> => !!org)
      .map(({ id: orgId, name, slug, type: orgType }) => ({
        id: orgId,
        name,
        slug,
        type: orgType,
      })),
  };
}
