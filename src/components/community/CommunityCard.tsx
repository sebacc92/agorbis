import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Icon, cx } from "~/components/ui";
import { routes, type CommunityRef } from "~/lib/community";
import { LEVEL_NAMES } from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export type CommunityCardData = CommunityRef & {
  member_count: number;
  description?: string | null;
};

export const CommunityCard = component$<{
  community: CommunityCardData;
  /** Resalta las comunidades de las que el visitante es miembro. */
  isMember?: boolean;
  compact?: boolean;
  /** Permite reemplazar métricas poco útiles (por ejemplo, ceros de un seed). */
  supportingText?: string;
}>(({ community, isMember = false, compact = false, supportingText }) => {
  const locale = useLocale();
  return (
    <Link
      href={routes.community(community.slug)}
      class={cx(
        // Superficie plana en reposo y elevación sólo al pasar (D123).
        "group flex items-center gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow,transform]",
        "hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:transform-none",
        isMember ? "border-success-500/40" : "border-subtle",
      )}
    >
      <span
        aria-hidden="true"
        class={cx(
          "grid shrink-0 place-items-center rounded-2xl border border-subtle bg-surface",
          compact ? "size-10 text-xl" : "size-12 text-2xl",
        )}
      >
        {community.emoji ?? "📍"}
      </span>

      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-1.5">
          <span class="truncate font-display font-semibold text-ink-strong">
            {community.name}
          </span>
          {/* El punto verde era la única marca de "esta es tu comunidad" y
              vivía en un `title`: sin mouse no existía, y en escala de grises
              tampoco (WCAG 1.4.1). */}
          {isMember && (
            <span class="shrink-0 text-xs text-success">
              <span aria-hidden="true">●</span>
              <span class="sr-only">{translate(locale, "Vivís acá")}</span>
            </span>
          )}
        </span>
        <span class="mt-0.5 block truncate text-xs text-ink-faint">
          {supportingText ?? (
            <>
              {translate(locale, LEVEL_NAMES[community.level] ?? "Comunidad")} ·{" "}
              {formatNumber(community.member_count, locale)}{" "}
              {translate(
                locale,
                community.member_count === 1 ? "miembro" : "miembros",
              )}
            </>
          )}
        </span>
        {!compact && community.description && (
          <span class="mt-1.5 line-clamp-2 block text-sm text-ink-muted">
            {community.description}
          </span>
        )}
      </span>

      <Icon
        name="chevron-right"
        class="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
});
