import { $, component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { triggerHapticFeedback } from "~/components/ui";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import { useLocale, translate } from "~/lib/i18n";
import { markSeenClaimIds, readSeenClaimIds } from "~/lib/claim-activity";
import { PERSONAL_DATA_CLEARED_EVENT } from "~/lib/local-data";

export interface NewActivityBannerProps {
  communitySlug: string;
  claimDates: { id: string; created_at: string }[];
}

export const NewActivityBanner = component$<NewActivityBannerProps>(
  ({ communitySlug, claimDates }) => {
    const locale = useLocale();
    const newIds = useSignal<string[]>([]);
    const isDismissed = useSignal(false);
    const stopped = useSignal(false);

    // eslint-disable-next-line qwik/no-use-visible-task -- los IDs observados viven sólo en el almacenamiento personal del dispositivo
    useVisibleTask$(
      ({ track, cleanup }) => {
        track(() => communitySlug);
        const ids = track(() => claimDates.map((claim) => claim.id));
        if (stopped.untrackedValue) return;
        const seen = readSeenClaimIds(communitySlug);
        newIds.value =
          seen === null ? [] : ids.filter((id) => !seen.includes(id));
        if (seen === null) markSeenClaimIds(communitySlug, []);
        isDismissed.value = false;
        let active = true;

        const observer =
          typeof IntersectionObserver === "undefined"
            ? null
            : new IntersectionObserver(
                (entries) => {
                  if (!active || stopped.untrackedValue) return;
                  const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .map((entry) =>
                      entry.target.getAttribute("data-claim-activity-id")!,
                    )
                    .filter(Boolean);
                  if (!visible.length) return;
                  markSeenClaimIds(communitySlug, visible);
                  newIds.value = newIds.value.filter(
                    (id) => !visible.includes(id),
                  );
                  for (const entry of entries)
                    if (entry.isIntersecting) observer?.unobserve(entry.target);
                },
                { threshold: 0.1 },
              );
        for (const link of document.querySelectorAll<HTMLAnchorElement>(
          '#listado-reclamos a[href^="/reclamos/"]',
        )) {
          const id = link.getAttribute("href")!.split("/")[2];
          if (!ids.includes(id)) continue;
          link.setAttribute("data-claim-activity-id", id);
          observer?.observe(link);
        }
        const stop = () => {
          stopped.untrackedValue = true;
          observer?.disconnect();
        };
        window.addEventListener(PERSONAL_DATA_CLEARED_EVENT, stop);
        cleanup(() => {
          active = false;
          observer?.disconnect();
          window.removeEventListener(PERSONAL_DATA_CLEARED_EVENT, stop);
        });
      },
      { strategy: "document-ready" },
    );

    const scrollToFirst = $(() => {
      triggerHapticFeedback("selection");
      const firstCard = document.querySelector(
        newIds.value[0]
          ? `#listado-reclamos a[href="/reclamos/${newIds.value[0]}"]`
          : "#listado-reclamos",
      );
      if (firstCard) {
        firstCard.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }
      isDismissed.value = true;
    });

    const dismiss = $(() => {
      triggerHapticFeedback("light");
      isDismissed.value = true;
    });

    return (
      <div class="contents">
        {!isDismissed.value && newIds.value.length > 0 && (
          <div
            role="status"
            aria-live="polite"
            class="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/10 px-4 py-2.5 text-xs text-ink-strong shadow-xs backdrop-blur-sm dark:bg-brand-950/40"
          >
            <div class="flex items-center gap-2">
              <span class="text-base" aria-hidden="true">
                ✨
              </span>
              <span class="font-semibold text-brand-700 dark:text-brand-300">
                {newIds.value.length === 1
                  ? translate(
                      locale,
                      "1 reclamo de esta página fuera de tu historial reciente",
                    )
                  : translate(
                      locale,
                      "{{count}} reclamos de esta página fuera de tu historial reciente",
                      { count: newIds.value.length },
                    )}
              </span>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick$={scrollToFirst}
                class="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-3 py-1 font-semibold text-white shadow-soft transition hover:bg-brand-700 active:scale-95 dark:bg-brand-600"
              >
                {translate(locale, "Ver novedades")}
              </button>
              <button
                type="button"
                onClick$={dismiss}
                aria-label={translate(locale, "Descartar")}
                class="grid min-h-11 min-w-11 place-items-center rounded-lg p-1 text-ink-faint hover:bg-muted hover:text-ink-strong"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    );
  },
);
