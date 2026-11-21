import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  CommunityCard,
  type CommunityCardData,
} from "~/components/community/CommunityCard";
import { Button, EmptyState, Input, Icon } from "~/components/ui";
import { communitySlugFromRoute } from "~/lib/community";
import {
  communityDirectoryHref,
  loadChildDirectory,
  readCommunityDirectoryFilters,
} from "~/lib/community-directory";
import { APP_NAME, CHILD_LEVEL_LABEL } from "~/lib/constants";
import { single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useCommunity } from "../layout";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "../../../layout";
import { formatNumber } from "~/lib/format";

export const useChildren = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const viewer = await getViewer(ev);
    const filters = readCommunityDirectoryFilters(ev.url.searchParams);

    const community = await single(
      ev,
      "sub/comunidad",
      db
        .from("communities")
        .select("id")
        .eq("slug", communitySlugFromRoute(ev.params, ev.url))
        .maybeSingle(),
    );

    if (!community)
      return {
        ...filters,
        children: [] as CommunityCardData[],
        hasMore: false,
        homePath: viewer.homePath,
      };

    return {
      ...(await loadChildDirectory(ev, db, community.id, filters)),
      homePath: viewer.homePath,
    };
  },
  { search: ["q", "pagina"] },
);

export default component$(() => {
  const data = useChildren();
  const ctx = useCommunity();
  const locale = useLocale();
  const { query, page, children, hasMore } = data.value;

  const label =
    CHILD_LEVEL_LABEL[ctx.value.community.level] ?? "Sub-comunidades";

  return (
    <section aria-labelledby="sub-titulo">
      <div class="mb-6">
        <h2 id="sub-titulo" class="text-xl font-semibold tracking-tight">
          {translate(locale, "{{level}} de {{name}}", {
            level: translate(locale, label),
            name: ctx.value.community.name,
          })}
        </h2>
        <p role="status" class="mt-1 text-sm text-ink-muted">
          {translate(
            locale,
            "Página {{page}} · {{count}} sub-comunidades en esta página.",
            {
              page: formatNumber(page, locale),
              count: formatNumber(children.length, locale),
            },
          )}
        </p>
      </div>

      <form
        key={query}
        method="get"
        role="search"
        aria-label={translate(locale, "Buscar sub-comunidades")}
        class="mb-5 flex flex-wrap items-end gap-3"
      >
        <div class="min-w-0 flex-1">
          <label for="sub-query" class="mb-1.5 block text-sm font-medium">
            {translate(locale, "Buscar sub-comunidades por nombre")}
          </label>
          <Input
            id="sub-query"
            name="q"
            type="search"
            value={query}
            maxLength={120}
            class="min-h-11"
          />
        </div>
        <Button type="submit" class="min-h-11">
          {translate(locale, "Buscar")}
        </Button>
        {query && (
          <Link
            href="?"
            class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
          >
            {translate(locale, "Limpiar búsqueda")}
          </Link>
        )}
      </form>

      {children.length === 0 ? (
        <EmptyState
          emoji="🧭"
          title={translate(
            locale,
            page > 1
              ? "No hay más sub-comunidades para mostrar."
              : query
                ? "No encontramos comunidades con ese nombre."
                : "{{name}} no tiene sub-comunidades",
            { name: ctx.value.community.name },
          )}
          description={translate(
            locale,
            query || page > 1
              ? "Probá otro nombre o volvé al principio del directorio."
              : "Es el nivel más específico que existe por ahora en esta rama de la jerarquía.",
          )}
        />
      ) : (
        <div
          id="sub-list"
          // `grid-cols-1`: sin columnas explícitas la única columna mide su
          // contenido, y una ficha con el nombre largo se salía 7 px de un
          // teléfono de 390.
          class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
        >
          {children.map((child) => (
            <CommunityCard
              key={child.id}
              community={child}
              compact
              isMember={
                !!data.value.homePath &&
                (data.value.homePath === child.path ||
                  data.value.homePath.startsWith(`${child.path}.`))
              }
            />
          ))}
        </div>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label={translate(locale, "Paginación de sub-comunidades")}
          class="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          {page > 1 && (
            <>
              <Link
                href={communityDirectoryHref(query, page - 1)}
                class="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted"
              >
                {translate(locale, "← Anterior")}
              </Link>
              <Link
                href={communityDirectoryHref(query)}
                class="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted"
              >
                {translate(locale, "← Volver al principio")}
              </Link>
            </>
          )}
          {hasMore && (
            <Link
              href={communityDirectoryHref(query, page + 1)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted"
            >
              {translate(locale, "Siguiente")}{" "}
              <Icon name="arrow-right" class="text-[1.1em]" />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader);
  return {
    title: `${translate(locale, "Sub-comunidades de {{name}}", { name: ctx?.community.name ?? "" })} · ${APP_NAME}`,
  };
};
