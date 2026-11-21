import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Icon, Badge, ButtonLink, Card, EmptyState } from "~/components/ui";
import { OrganizationSearch } from "~/components/organizations/OrganizationSearch";
import { OrganizationPagination } from "~/components/organizations/OrganizationPagination";
import {
  ORGANIZATION_TYPES,
  ORGANIZATION_PAGE_SIZE,
  organizationNamePattern,
  readOrganizationFilters,
} from "~/lib/organization-directory";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { formatNumber } from "~/lib/format";
import { many } from "~/lib/query";
import { supabase } from "~/lib/session";
import { useLocaleLoader } from "../layout";

export const useOrganizations = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const { query, type, page } = readOrganizationFilters(ev.url.searchParams);

    let organizationsQuery = db
      .from("organizations")
      .select(
        "id, community_id, name, slug, type, description, website, logo_url, verified_at, created_at",
      )
      .not("verified_at", "is", null)
      .order("name")
      .order("id")
      .range(
        (page - 1) * ORGANIZATION_PAGE_SIZE,
        page * ORGANIZATION_PAGE_SIZE,
      );

    if (query) {
      organizationsQuery = organizationsQuery.filter(
        "name",
        "imatch",
        organizationNamePattern(query),
      );
    }
    if (type) organizationsQuery = organizationsQuery.eq("type", type);

    const rows = await many(
      ev,
      "instituciones/organizations",
      organizationsQuery,
    );

    const organizations = rows.slice(0, ORGANIZATION_PAGE_SIZE);
    const ids = organizations
      .map((org) => org.community_id)
      .filter((id): id is string => !!id);

    const communities = ids.length
      ? await many(
          ev,
          "instituciones/comunidades",
          db.from("communities").select("id, name, emoji").in("id", ids),
        )
      : [];

    const byId = new Map(
      communities.map((community) => [community.id, community]),
    );

    return {
      query,
      type,
      page,
      hasMore: rows.length > ORGANIZATION_PAGE_SIZE,
      organizations: organizations.map((organization) => ({
        ...organization,
        community: organization.community_id
          ? (byId.get(organization.community_id) ?? null)
          : null,
      })),
    };
  },
  { search: ["q", "tipo", "pagina"] },
);

export default component$(() => {
  const data = useOrganizations();
  const locale = useLocale();
  const { organizations, query, type, page, hasMore } = data.value;
  const hasFilters = !!query || !!type || page > 1;
  return (
    <div class="container-content py-8">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-sm font-semibold text-brand">
            {translate(locale, "Identidad institucional")}
          </p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight">
            {translate(locale, "Instituciones verificadas")}
          </h1>
          <p class="mt-2 max-w-2xl text-ink-muted">
            {translate(
              locale,
              "Organismos y organizaciones cuyos representantes pueden responder públicamente.",
            )}
          </p>
        </div>
        <ButtonLink
          href="/instituciones/solicitar"
          variant="secondary"
          class="min-h-11 w-full sm:w-auto"
        >
          {translate(locale, "Solicitar verificación")}
        </ButtonLink>
      </header>

      {/* `method="get"`: la búsqueda queda en la URL y por lo tanto se puede
          compartir, marcar y recargar. Funciona sin JavaScript. */}
      <Card class="mt-6 p-4 sm:p-5">
        <OrganizationSearch query={query} type={type} />
        <p id="institution-search-hint" class="mt-3 text-xs text-ink-muted">
          {translate(
            locale,
            "Buscá por nombre completo o una parte. Podés combinarlo con el tipo de institución.",
          )}
        </p>
      </Card>

      <div class="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p role="status" aria-live="polite" class="text-sm text-ink-muted">
          {translate(
            locale,
            "Página {{page}} · {{count}} instituciones en esta página.",
            { page, count: formatNumber(organizations.length, locale) },
          )}
          {query && (
            <span class="ugc-text">
              {translate(locale, " para “{{query}}”", { query })}
            </span>
          )}
          {type && (
            <span>
              {" · "}
              {translate(locale, ORGANIZATION_TYPES[type])}
            </span>
          )}
        </p>
        {hasFilters && (
          <Link
            href="/instituciones"
            class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
          >
            {translate(locale, "Limpiar filtros")}
          </Link>
        )}
      </div>

      {organizations.length === 0 ? (
        <div class="mt-8 [overflow-wrap:anywhere]">
          {/* Que la búsqueda no encuentre nada no es lo mismo que que no haya
              ninguna institución verificada todavía. */}
          {hasFilters ? (
            <EmptyState
              emoji="🔎"
              headingLevel="h2"
              title={
                query
                  ? translate(
                      locale,
                      "No encontramos instituciones con “{{query}}”",
                      { query },
                    )
                  : translate(
                      locale,
                      "No hay instituciones de este tipo todavía",
                    )
              }
              description="Probá con parte del nombre, cambiá el tipo o mirá la lista completa."
            >
              <ButtonLink
                href="/instituciones"
                variant="secondary"
                class="min-h-11"
              >
                {translate(locale, "Ver todas")}
              </ButtonLink>
            </EmptyState>
          ) : (
            <EmptyState
              emoji="🏛️"
              headingLevel="h2"
              title="Todavía no hay instituciones verificadas"
              description="Las primeras solicitudes aparecerán acá después de ser revisadas."
            />
          )}
        </div>
      ) : (
        <ul
          aria-label={translate(locale, "Instituciones verificadas")}
          class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        >
          {organizations.map((organization) => (
            <li key={organization.id} class="min-w-0">
              <Link
                href={`/instituciones/${organization.slug}`}
                class="group block h-full rounded-2xl"
              >
                <Card class="flex h-full flex-col p-5 transition-[border-color,box-shadow] group-hover:border-brand-500 group-hover:shadow-soft group-focus-visible:border-brand-500">
                  <div class="flex flex-wrap items-center gap-2">
                    <span
                      class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl"
                      aria-hidden="true"
                    >
                      {organization.type === "government" ? "🏛️" : "🏢"}
                    </span>
                    <span class="text-xs font-medium text-ink-muted">
                      {translate(
                        locale,
                        ORGANIZATION_TYPES[organization.type] ?? "Institución",
                      )}
                    </span>
                    <Badge tone="success">
                      <Icon name="check" /> {translate(locale, "Verificada")}
                    </Badge>
                  </div>
                  <h2
                    dir="auto"
                    class="ugc-text mt-3 text-lg font-semibold group-hover:text-brand"
                  >
                    {organization.name}
                  </h2>
                  {organization.community && (
                    <p dir="auto" class="ugc-text mt-1 text-sm text-ink-muted">
                      <span aria-hidden="true">
                        {organization.community.emoji}
                      </span>{" "}
                      {organization.community.name}
                    </p>
                  )}
                  {organization.description && (
                    <p
                      dir="auto"
                      class="ugc-text mt-3 mb-4 line-clamp-3 text-sm leading-relaxed text-ink-muted"
                    >
                      {organization.description}
                    </p>
                  )}
                  <span class="mt-auto flex items-center justify-between gap-2 border-t border-subtle pt-4 text-sm font-medium text-brand">
                    {translate(locale, "Ver respuestas y actividad")}{" "}
                    <Icon name="arrow-right" />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <OrganizationPagination
        query={query}
        type={type}
        page={page}
        hasMore={hasMore}
      />
      {/* Con el directorio vacío y sin filtros, el botón de la cabecera ya
          es el llamado: el vacío y este recuadro lo repetían, tres veces en
          una pantalla. */}
      {(organizations.length > 0 || hasFilters) && (
        <aside class="mt-8 flex flex-col gap-4 rounded-2xl border border-subtle bg-muted p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold">
              {translate(locale, "¿Representás una institución?")}
            </h2>
            <p class="mt-1 max-w-2xl text-sm text-ink-muted">
              {translate(
                locale,
                "Verificá tu representación para responder públicamente.",
              )}
            </p>
          </div>
          <ButtonLink
            href="/instituciones/solicitar"
            variant="secondary"
            class="min-h-11 shrink-0"
          >
            {translate(locale, "Pedí su verificación")}
          </ButtonLink>
        </aside>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Instituciones verificadas")} · ${APP_NAME}`,
});
