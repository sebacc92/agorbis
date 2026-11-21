import { component$, useComputed$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { routes } from "~/lib/community";
import { pluralize } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";

export interface ExistingClaimItem {
  id: string;
  title: string;
  support_count: number;
}

export const SimilarClaimsDetector = component$<{
  titleQuery: string;
  existingClaims: ExistingClaimItem[];
}>(({ titleQuery, existingClaims }) => {
  const locale = useLocale();

  const matches = useComputed$(() => {
    const raw = titleQuery.trim().toLowerCase();
    if (raw.length < 4) return [];

    const stopWords = new Set([
      "para",
      "como",
      "pero",
      "hace",
      "este",
      "esta",
      "está",
      "estos",
      "unas",
      "unos",
      "calle",
      "sobre",
      "entre",
      "reclamo",
      "problema",
      "falta",
      "necesita",
    ]);

    const words = raw
      .split(/\s+/)
      .map((w) => w.replace(/[^a-záéíóúñ0-9]/gi, ""))
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    if (words.length === 0) return [];

    return existingClaims
      .filter((c) => {
        const cTitle = c.title.toLowerCase();
        return words.some((word) => cTitle.includes(word));
      })
      .slice(0, 4);
  });

  if (matches.value.length === 0) return null;

  return (
    <div class="mt-3 animate-scale-pop rounded-2xl border-2 border-brand-500/40 bg-brand-50/80 p-4 dark:border-brand-900 dark:bg-brand-950/40 shadow-xs transition-all duration-200 hover:shadow-soft">
      <div class="flex items-start gap-3">
        <span class="text-xl" aria-hidden="true">
          🔍
        </span>
        <div class="text-xs">
          <p class="font-bold text-ink-strong sm:text-sm">
            {translate(
              locale,
              "¡Atención vecinal! Detectamos reclamos similares en tu zona",
            )}
          </p>
          <p class="mt-1 leading-relaxed text-ink-muted">
            {translate(
              locale,
              "Sumar tu apoyo a un reclamo ya abierto junta a las personas afectadas en un solo lugar, en vez de dividirlas entre reportes duplicados:",
            )}
          </p>

          <ul class="mt-3 space-y-2">
            {matches.value.map((c) => (
              <li
                key={c.id}
                class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle bg-surface p-2.5 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs active:scale-[0.99] touch-manipulation"
              >
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <span class="text-brand">📌</span>
                  <Link
                    href={routes.claim(c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate font-semibold text-ink-strong transition-colors hover:text-brand hover:underline active:scale-[0.98] touch-manipulation"
                  >
                    {c.title}
                  </Link>
                </div>

                <div class="flex items-center gap-2 shrink-0">
                  <span class="rounded-full bg-brand-100 px-2 py-0.5 text-2xs font-bold tabular-nums text-brand-900 dark:bg-brand-900/60 dark:text-brand-100">
                    {pluralize(c.support_count, "apoyo", "apoyos", locale)}
                  </span>
                  <Link
                    href={routes.claim(c.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-2xs font-bold text-white transition-all duration-150 hover:bg-brand-700 hover:-translate-y-0.5 active:scale-95 touch-manipulation"
                  >
                    <span>{translate(locale, "Sumar mi apoyo")}</span>
                    <span>↗</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
});
