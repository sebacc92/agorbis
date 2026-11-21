import { component$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  useLocation,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Icon,
  Badge,
  Card,
  EmptyState,
  ExternalLinkHint,
} from "~/components/ui";
import { contentHref, routes } from "~/lib/community";
import { APP_NAME, CLAIM_STATUS_LABEL } from "~/lib/constants";
import type { ContentType } from "~/lib/database.types.helpers";
import { formatDate } from "~/lib/format";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { single, many } from "~/lib/query";
import { readPage, pageHref } from "~/lib/pagination";
import { organizationSlugFromRoute } from "~/lib/organization-directory";
import {
  INSTITUTIONAL_HISTORY_PAGE_SIZE,
  institutionalResponseTitles,
} from "~/lib/institutional-history";
import { supabase } from "~/lib/session";
import { safeHttpUrl } from "~/lib/url";
import { useLocaleLoader } from "../../layout";

export const useOrganization = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const page = readPage(ev.url.searchParams, "respuestas");
    const organization = await single(
      ev,
      "instituciones-c/organization",
      db
        .from("organizations")
        .select(
          "id, community_id, name, slug, type, description, website, logo_url, verified_at, created_at",
        )
        .eq("slug", organizationSlugFromRoute(ev.params, ev.url))
        .not("verified_at", "is", null)
        .maybeSingle(),
    );
    if (!organization) {
      throw ev.error(
        404,
        translate(
          resolveLocale(ev.locale()),
          "No encontramos esa institución verificada.",
        ),
      );
    }

    const [community, responseRows, claims] = await Promise.all([
      organization.community_id
        ? single(
            ev,
            "instituciones/comunidad",
            db
              .from("communities")
              .select("name, emoji, slug")
              .eq("id", organization.community_id)
              .maybeSingle(),
          )
        : null,
      many(
        ev,
        "instituciones/historial",
        db
          .from("institutional_responses")
          .select(
            "id, organization_id, content_type, content_id, response_type, body, source_url, created_at",
          )
          .eq("organization_id", organization.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(
            (page - 1) * INSTITUTIONAL_HISTORY_PAGE_SIZE,
            page * INSTITUTIONAL_HISTORY_PAGE_SIZE,
          ),
      ),
      many(
        ev,
        "instituciones/asignados",
        db
          .from("claims")
          .select("id, title, status, created_at")
          .eq("responsible_organization_id", organization.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(30),
      ),
    ]);
    const visibleResponses = responseRows.slice(
      0,
      INSTITUTIONAL_HISTORY_PAGE_SIZE,
    );
    const titles = await institutionalResponseTitles(ev, db, visibleResponses);
    const responses = visibleResponses.map((response) => ({
      ...response,
      source_url: safeHttpUrl(response.source_url),
      title:
        titles.get(`${response.content_type}:${response.content_id}`) ?? null,
      href: contentHref(
        response.content_type as ContentType,
        response.content_id,
      ),
    }));

    return {
      organization: {
        ...organization,
        website: safeHttpUrl(organization.website),
      },
      community,
      responses,
      claims,
      page,
      hasMore: responseRows.length > INSTITUTIONAL_HISTORY_PAGE_SIZE,
    };
  },
  { search: ["respuestas"] },
);

export default component$(() => {
  const data = useOrganization();
  const locale = useLocale();
  const location = useLocation();
  const { organization, community, responses, claims, page, hasMore } =
    data.value;
  return (
    <div class="container-content py-8">
      <Link
        href="/instituciones"
        class="text-sm font-medium text-brand hover:underline"
      >
        ← {translate(locale, "Instituciones verificadas")}
      </Link>

      <div class="mt-5 grid gap-6 lg:grid-cols-[22rem_1fr]">
        {/* Ficha de identidad a un lado; el historial, que es lo que se viene
            a leer, ocupa la columna ancha. */}
        <header class="lg:sticky lg:top-24 lg:self-start">
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-4xl" aria-hidden="true">
              {organization.type === "government" ? "🏛️" : "🏢"}
            </span>
            <Badge tone="success">
              <Icon name="check" /> {translate(locale, "Perfil verificado")}
            </Badge>
          </div>
          <h1 class="mt-3 text-3xl font-semibold tracking-tight">
            {organization.name}
          </h1>
          {community && (
            <p class="mt-2 text-sm text-ink-muted">
              {community.emoji} {community.name}
            </p>
          )}
          {organization.description && (
            <p class="mt-4 leading-relaxed text-ink-muted">
              {organization.description}
            </p>
          )}
          {organization.website && (
            <a
              href={organization.website}
              target="_blank"
              rel="noopener noreferrer"
              class="mt-3 inline-block text-sm font-medium text-brand hover:underline"
            >
              {translate(locale, "Sitio oficial")}
              <ExternalLinkHint />
            </a>
          )}

          {/* Semáforo de Rendición de Cuentas Rápido */}
          <div class="mt-6 rounded-2xl border border-subtle bg-surface p-4 shadow-sm">
            <p class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              {translate(locale, "Rendición de Cuentas Pública")}
            </p>
            <p class="mt-2 text-xs text-ink-muted">
              {translate(
                locale,
                "Los conteos describen las respuestas de esta página y hasta 30 reclamos asignados.",
              )}
            </p>
            <div class="mt-3 grid grid-cols-3 gap-2 text-center">
              <div class="rounded-xl bg-muted/60 p-2.5">
                <span class="block text-xl font-bold text-ink-strong">
                  {responses.length}
                </span>
                <span class="text-2xs text-ink-muted">
                  {translate(locale, "Respuestas")}
                </span>
              </div>
              <div class="rounded-xl bg-success-50/60 p-2.5 dark:bg-success-950/30">
                <span class="block text-xl font-bold text-success-600 dark:text-success-400">
                  {claims.filter((c) => c.status === "resolved").length}
                </span>
                <span class="text-2xs text-success-700 dark:text-success-300">
                  {translate(locale, "Resueltos 🏆")}
                </span>
              </div>
              <div class="rounded-xl bg-blue-50/60 p-2.5 dark:bg-blue-950/30">
                <span class="block text-xl font-bold text-blue-600 dark:text-blue-400">
                  {claims.length}
                </span>
                <span class="text-2xs text-blue-700 dark:text-blue-300">
                  {translate(locale, "Asignados")}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section class="min-w-0" aria-labelledby="historial-respuestas">
          {/* Sin semáforo ni "promedio verificado": los conteos reales ya están
              en la cabecera y un puntaje sobre una institución real tiene que
              salir de datos medidos, no de constantes. */}
          <h2 id="historial-respuestas" class="text-xl font-semibold">
            {translate(locale, "Historial de respuestas")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Registro público de sus intervenciones institucionales en Agorbis.",
            )}
          </p>
          <p role="status" class="mt-2 text-xs text-ink-muted">
            {translate(
              locale,
              "Página {{page}} · {{count}} respuestas en esta página.",
              { page, count: responses.length },
            )}
          </p>
          {responses.length === 0 ? (
            <div class="mt-4">
              <EmptyState
                emoji="💬"
                title={
                  page > 1
                    ? "No hay más respuestas para mostrar."
                    : "Sin respuestas todavía"
                }
                description="Cuando la institución responda una publicación, quedará registrada acá."
              />
            </div>
          ) : (
            <ol class="mt-4 space-y-3">
              {responses.map((response) => (
                <li key={response.id}>
                  <Card class="p-5">
                    <div class="flex flex-wrap gap-2">
                      <Badge tone="brand">
                        {translate(locale, "Respuesta oficial")}
                      </Badge>
                      <time
                        class="text-xs text-ink-faint"
                        dateTime={response.created_at}
                      >
                        {formatDate(response.created_at, locale)}
                      </time>
                    </div>
                    <Link
                      href={response.href}
                      dir="auto"
                      class="mt-2 block font-semibold text-brand hover:underline"
                    >
                      {response.title ?? translate(locale, "Publicación")}
                    </Link>
                    <p
                      dir="auto"
                      class="ugc-text mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted"
                    >
                      {response.body}
                    </p>
                    {response.source_url && (
                      <a
                        href={response.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                      >
                        {translate(locale, "Documento respaldatorio")}
                        <ExternalLinkHint />
                      </a>
                    )}
                  </Card>
                </li>
              ))}
            </ol>
          )}
          {(page > 1 || hasMore) && (
            <nav
              aria-label={translate(
                locale,
                "Paginación del historial de respuestas",
              )}
              class="mt-6 flex flex-wrap gap-3"
            >
              {page > 1 && (
                <Link
                  href={`${location.url.pathname}${pageHref(
                    location.url.searchParams,
                    "respuestas",
                    page - 1,
                  )}`}
                  class="inline-flex min-h-11 items-center rounded-xl border border-subtle px-4 text-sm font-semibold text-brand"
                >
                  {translate(locale, "← Anterior")}
                </Link>
              )}
              {hasMore && (
                <Link
                  href={`${location.url.pathname}${pageHref(
                    location.url.searchParams,
                    "respuestas",
                    page + 1,
                  )}`}
                  class="inline-flex min-h-11 items-center rounded-xl border border-subtle px-4 text-sm font-semibold text-brand"
                >
                  {translate(locale, "Siguiente")}{" "}
                  <Icon name="arrow-right" class="text-[1.1em]" />
                </Link>
              )}
            </nav>
          )}
        </section>

        {claims.length > 0 && (
          <section class="mt-9 min-w-0">
            <h2 class="text-xl font-semibold">
              {translate(locale, "Reclamos bajo su responsabilidad")}
            </h2>
            <ul class="mt-4 space-y-2">
              {claims.map((claim) => (
                <li key={claim.id}>
                  <Link
                    href={routes.claim(claim.id)}
                    class="flex items-center gap-3 rounded-2xl border border-subtle bg-surface p-4 hover:border-brand-500"
                  >
                    <span
                      dir="auto"
                      class="min-w-0 flex-1 font-medium text-ink-strong"
                    >
                      {claim.title}
                    </span>
                    <Badge
                      tone={
                        claim.status === "resolved"
                          ? "success"
                          : claim.status === "in_progress"
                            ? "brand"
                            : "neutral"
                      }
                    >
                      {translate(
                        locale,
                        CLAIM_STATUS_LABEL[claim.status]?.label ?? claim.status,
                      )}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useOrganization);
  const locale = resolveValue(useLocaleLoader);
  return {
    title: `${data?.organization.name ?? translate(locale, "Institución")} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: (
          data?.organization.description ??
          translate(
            locale,
            "Perfil institucional verificado e historial de respuestas.",
          )
        ).slice(0, 160),
      },
    ],
  };
};
