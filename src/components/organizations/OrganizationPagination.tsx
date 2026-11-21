import { Icon } from "~/components/ui";
import { component$ } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { translate, useLocale } from "~/lib/i18n";
import { organizationListHref } from "~/lib/organization-directory";

export const OrganizationPagination = component$<{
  query: string;
  type: string;
  page: number;
  hasMore: boolean;
}>(({ query, type, page, hasMore }) => {
  const locale = useLocale();
  const location = useLocation();
  if (page === 1 && !hasMore) return null;
  return (
    <nav
      aria-label={translate(locale, "Paginación de instituciones")}
      class="mt-6 flex flex-wrap items-center justify-center gap-3"
    >
      {page > 1 && (
        <Link
          href={`${location.url.pathname}${organizationListHref({ query, type }, page - 1)}`}
          class="inline-flex min-h-11 items-center rounded-xl border border-subtle px-4 text-sm font-semibold text-brand"
        >
          {translate(locale, "← Anterior")}
        </Link>
      )}
      {hasMore && (
        <Link
          href={`${location.url.pathname}${organizationListHref({ query, type }, page + 1)}`}
          class="inline-flex min-h-11 items-center rounded-xl border border-subtle px-4 text-sm font-semibold text-brand"
        >
          {translate(locale, "Siguiente")}{" "}
          <Icon name="arrow-right" class="text-[1.1em]" />
        </Link>
      )}
    </nav>
  );
});
