import { component$ } from "@qwik.dev/core";
import {
  Link,
  routeLoader$,
  useLocation,
  type DocumentHead,
} from "@qwik.dev/router";
import { Button, Card, Input, Icon } from "~/components/ui";
import { APP_NAME, LEVEL_NAMES } from "~/lib/constants";
import { translate, useLocale } from "~/lib/i18n";
import { pageHref } from "~/lib/pagination";
import { many } from "~/lib/query";
import { supabase } from "~/lib/session";
import {
  readTerritorySearch,
  TERRITORIES_PAGE_SIZE,
  territoryPattern,
  territoryResultHref,
} from "~/lib/territory-search";
import { useLocaleLoader } from "~/routes/layout";

export const useTerritories = routeLoader$(
  async (ev) => {
    const filters = readTerritorySearch(ev.url.searchParams);
    const rows =
      filters.query.length >= 2
        ? await many(
            ev,
            "buscar/territorios",
            supabase(ev)
              .from("communities")
              .select("id, slug, name, emoji, level")
              .ilike("name", territoryPattern(filters.query))
              .order("name")
              .order("id")
              .range(
                (filters.page - 1) * TERRITORIES_PAGE_SIZE,
                filters.page * TERRITORIES_PAGE_SIZE,
              ),
          )
        : [];
    return {
      ...filters,
      items: rows.slice(0, TERRITORIES_PAGE_SIZE),
      hasMore: rows.length > TERRITORIES_PAGE_SIZE,
    };
  },
  {
    search: [
      "q",
      "tipo",
      "estado",
      "comunidad",
      "orden",
      "territorio",
      "pagina",
    ],
  },
);

export default component$(() => {
  const data = useTerritories();
  const locale = useLocale();
  const location = useLocation();
  const { context, query, page, items, hasMore } = data.value;
  const back = territoryResultHref(context, context.community || null);
  return (
    <div class="container-reading py-8">
      <h1 class="text-2xl font-semibold">
        {translate(locale, "Elegir territorio de búsqueda")}
      </h1>
      <p class="mt-2 text-sm text-ink-muted">
        {translate(
          locale,
          "Buscá una comunidad y elegí un resultado. Conservamos tu término y los demás filtros.",
        )}
      </p>
      <Card class="mt-5 p-4">
        <form
          method="get"
          role="search"
          aria-label={translate(locale, "Buscar territorio")}
          class="space-y-3"
        >
          <input type="hidden" name="q" value={context.query} />
          <input type="hidden" name="tipo" value={context.kind} />
          <input type="hidden" name="estado" value={context.status} />
          <input type="hidden" name="comunidad" value={context.community} />
          <input type="hidden" name="orden" value={context.sort} />
          <label for="territory-query" class="block text-sm font-medium">
            {translate(locale, "Nombre del territorio")}
          </label>
          <Input
            id="territory-query"
            name="territorio"
            type="search"
            minLength={2}
            maxLength={100}
            value={query}
            required
          />
          <Button type="submit">
            {translate(locale, "Buscar territorio")}
          </Button>
        </form>
      </Card>
      <div class="my-4 flex flex-wrap gap-x-5 gap-y-1">
        <Link
          href={back}
          class="inline-flex min-h-11 items-center font-medium text-brand underline"
        >
          {translate(locale, "Volver sin cambiar el territorio")}
        </Link>
        <Link
          href={territoryResultHref(context, null)}
          class="inline-flex min-h-11 items-center font-medium text-brand underline"
        >
          {translate(locale, "Buscar en todo el territorio")}
        </Link>
      </div>
      {query.length < 2 ? (
        <p class="text-sm text-ink-muted">
          {translate(
            locale,
            "Escribí al menos dos letras para buscar un territorio.",
          )}
        </p>
      ) : items.length === 0 ? (
        <p role="status" class="text-sm text-ink-muted">
          {translate(
            locale,
            "No hay territorios en esta página. Probá otro nombre o volvé al principio.",
          )}
        </p>
      ) : (
        <ul
          aria-label={translate(locale, "Territorios encontrados")}
          class="space-y-2"
        >
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={territoryResultHref(context, item.slug)}
                class="flex min-h-11 items-center gap-3 rounded-xl border border-subtle p-3 hover:bg-muted"
              >
                <span aria-hidden="true">{item.emoji}</span>
                <span class="min-w-0 flex-1">{item.name}</span>
                <span class="text-xs text-ink-muted">
                  {translate(locale, LEVEL_NAMES[item.level] ?? "Comunidad")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || hasMore) && (
        <nav
          aria-label={translate(locale, "Paginación de territorios")}
          class="mt-5 flex flex-wrap gap-4"
        >
          {page > 1 && (
            <Link
              href={`${location.url.pathname}${pageHref(location.url.searchParams, "pagina", page - 1)}`}
              class="inline-flex min-h-11 items-center text-brand underline"
            >
              {translate(locale, "← Anterior")}
            </Link>
          )}
          {hasMore && (
            <Link
              href={`${location.url.pathname}${pageHref(location.url.searchParams, "pagina", page + 1)}`}
              class="inline-flex min-h-11 items-center text-brand underline"
            >
              {translate(locale, "Siguiente")}{" "}
              <Icon name="arrow-right" class="text-[1.1em]" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Elegir territorio de búsqueda")} · ${APP_NAME}`,
});
