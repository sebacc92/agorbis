import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Badge, ButtonLink, Card, EmptyState, Icon } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { single, many } from "~/lib/query";
import { supabase } from "~/lib/session";
import { safeHttpUrl } from "~/lib/url";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { communitySlugFromRoute, routes } from "~/lib/community";
import { useLocaleLoader } from "~/routes/layout";
import { OrganizationSearch } from "~/components/organizations/OrganizationSearch";
import { OrganizationPagination } from "~/components/organizations/OrganizationPagination";
import {
  ORGANIZATION_PAGE_SIZE,
  organizationNamePattern,
  readOrganizationFilters,
} from "~/lib/organization-directory";

export const useCommunityOrganizations = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const locale = resolveLocale(ev.locale());
    const { query, type, page } = readOrganizationFilters(ev.url.searchParams);

    const community = await single(
      ev,
      "c-instituciones/comunidad",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, member_count")
        .eq("slug", communitySlugFromRoute(ev.params, ev.url))
        .maybeSingle(),
    );

    if (!community) {
      throw ev.error(404, translate(locale, "No encontramos esa comunidad."));
    }

    let listing = db
      .from("organizations")
      .select(
        "id, name, slug, type, description, website, logo_url, verified_at, created_at",
      )
      .eq("community_id", community.id)
      .not("verified_at", "is", null);
    if (query)
      listing = listing.filter(
        "name",
        "imatch",
        organizationNamePattern(query),
      );
    if (type) listing = listing.eq("type", type);
    const rows = await many(
      ev,
      "c-instituciones/listado",
      listing
        .order("name")
        .order("id")
        .range(
          (page - 1) * ORGANIZATION_PAGE_SIZE,
          page * ORGANIZATION_PAGE_SIZE,
        ),
    );
    // El CHECK de la tabla sólo exige `^https?://`: una URL con credenciales
    // (`https://municipio.gob.ar@phishing.example/`) pasa y se mostraría con
    // el sello. `safeHttpUrl` la descarta, como en la ficha y en la cola.
    const organizations = rows
      .slice(0, ORGANIZATION_PAGE_SIZE)
      .map((org) => ({ ...org, website: safeHttpUrl(org.website) }));

    return {
      community,
      organizations,
      query,
      type,
      page,
      hasMore: rows.length > ORGANIZATION_PAGE_SIZE,
    };
  },
  { search: ["q", "tipo", "pagina"] },
);

export default component$(() => {
  const data = useCommunityOrganizations();
  const locale = useLocale();
  const { community, organizations, query, type, page, hasMore } = data.value;

  return (
    <section aria-labelledby="instituciones-titulo">
      {/* Cabecera de listado dentro de la comunidad: el layout ya pone el
          contenedor, la miga, el h1 y el chip de "Instituciones". La tarjeta
          propia repetía todo eso con otro h1, un "← Volver a" y un emoji. */}
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <h2
            id="instituciones-titulo"
            class="text-xl font-semibold tracking-tight"
          >
            {translate(locale, "Instituciones de {{community}}", {
              community: community.name,
            })}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Organismos oficiales, sociedades de fomento, comisiones vecinales y entidades acreditadas de {{name}} para canalizar respuestas.",
              { name: community.name },
            )}
          </p>
        </div>
        <div class="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          <ButtonLink href="/instituciones" variant="secondary" size="sm">
            <Icon name="globe" />
            {translate(locale, "Ver directorio global")}
          </ButtonLink>
          <ButtonLink href="/instituciones/solicitar" variant="ghost" size="sm">
            <Icon name="shield" />
            {translate(locale, "Acreditar una institución")}
          </ButtonLink>
        </div>
      </div>

      <Card class="p-4 sm:p-5">
        <OrganizationSearch query={query} type={type} />
      </Card>
      <p role="status" class="mt-4 text-sm text-ink-muted">
        {translate(
          locale,
          "Página {{page}} · {{count}} instituciones en esta página.",
          { page, count: organizations.length },
        )}
      </p>
      {(query || type || page > 1) && (
        <Link
          href={`${routes.community(community.slug)}/instituciones/`}
          class="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
        >
          {translate(locale, "Limpiar filtros")}
        </Link>
      )}
      {/* Listado */}
      {organizations.length === 0 ? (
        <div class="mt-8">
          <EmptyState
            emoji="🏛️"
            title={translate(
              locale,
              query || type || page > 1
                ? "No hay instituciones con estos filtros."
                : "Todavía no hay instituciones acreditadas en {{name}}",
              {
                name: community.name,
              },
            )}
            description={translate(
              locale,
              "Si formás parte de una sociedad de fomento, delegación municipal, centro de salud o club de la zona, podés verificar tu representación oficial.",
            )}
          >
            <div class="mt-4">
              <ButtonLink href="/instituciones/solicitar">
                {translate(locale, "Solicitar acreditación institucional")}
              </ButtonLink>
            </div>
          </EmptyState>
        </div>
      ) : (
        <section class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card key={org.id} class="flex flex-col p-5">
              <div class="flex items-center justify-between gap-2">
                <Badge tone="brand">
                  {translate(locale, "Acreditada oficial")}
                </Badge>
                {org.website && (
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs font-semibold text-brand hover:underline"
                  >
                    {translate(locale, "Sitio web")} ↗
                  </a>
                )}
              </div>

              <h2 class="mt-3 text-base font-bold text-ink-strong">
                <Link
                  href={`/instituciones/${org.slug}`}
                  class="inline-flex min-h-11 items-center rounded-lg hover:text-brand hover:underline"
                >
                  {org.name}
                </Link>
              </h2>

              {org.description && (
                <p class="mt-2 line-clamp-3 text-xs leading-relaxed text-ink-muted">
                  {org.description}
                </p>
              )}

              <div class="mt-auto border-t border-subtle pt-3 mt-4 text-2xs text-ink-faint">
                {translate(
                  locale,
                  "Habilitada para responder reclamos ciudadanos",
                )}
              </div>
            </Card>
          ))}
        </section>
      )}
      <OrganizationPagination
        query={query}
        type={type}
        page={page}
        hasMore={hasMore}
      />
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useCommunityOrganizations);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const name = data?.community.name ?? "Comunidad";

  return {
    title: `${translate(locale, "Instituciones")} · ${name} · ${APP_NAME}`,
  };
};
