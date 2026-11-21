import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Badge, Card, EmptyState, Icon, cx } from "~/components/ui";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { routes } from "~/lib/community";
import { APP_NAME, CLAIM_CATEGORIES } from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { many, single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";
import { useCommunity } from "../layout";

export const useContrast = routeLoader$(async (ev) => {
  const db = supabase(ev);

  const community = await single(
    ev,
    "contraste/comunidad",
    db
      .from("communities")
      .select("id")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );
  if (!community) return { claims: [] };

  const claims = await many(
    ev,
    "contraste/reclamos",
    db.rpc("sibling_claim_profile", { p_community: community.id }),
  );

  return { claims };
});

export default component$(() => {
  const data = useContrast();
  const ctx = useCommunity();
  const locale = useLocale();
  const { community } = ctx.value;
  const { claims } = data.value;

  const categoryOf = (key: string | null) =>
    CLAIM_CATEGORIES.find((c) => c.key === key);

  const rated = claims.filter((c) => c.claims_per_1k !== null);
  const maxRate = Math.max(1, ...rated.map((c) => Number(c.claims_per_1k)));

  return (
    <section aria-labelledby="contraste-titulo">
      <header class="mb-6">
        <h2 id="contraste-titulo" class="text-xl font-semibold tracking-tight">
          {translate(locale, "Contraste entre las sub-comunidades")}
        </h2>
        <p class="mt-1.5 max-w-2xl text-sm text-ink-muted">
          {translate(
            locale,
            "En qué se parecen y en qué difieren los territorios que componen {{community}}. No es un ranking: cada eje se lee por separado.",
            { community: community.name },
          )}
        </p>
      </header>

      {claims.length === 0 && (
        <EmptyState
          emoji="🔍"
          title="Todavía no hay suficientes datos para contrastar"
          description="Hace falta que al menos dos sub-comunidades participen para poder compararlas sin exponer a nadie."
        />
      )}

      {/* ------------------------------------------------ Perfil de reclamos */}
      {claims.length > 0 && (
        <section aria-labelledby="reclamos-perfil-titulo">
          <h3
            id="reclamos-perfil-titulo"
            class="flex items-center gap-2 text-lg font-semibold"
          >
            <Icon name="megaphone" class={CONTENT_KIND_TONES.claim.text} />
            {translate(locale, "Qué reclama cada territorio")}
          </h3>
          <p class="mt-1.5 max-w-2xl text-sm text-ink-muted">
            {/* D60: sin esta frase, la lectura por defecto es la contraria. */}
            {translate(
              locale,
              "Más reclamos no significa peor lugar: suele significar que ahí la gente está más organizada para publicarlos. Las tasas van por cada mil habitantes para que el tamaño no distorsione la comparación.",
            )}
          </p>

          <ul class="mt-4 space-y-2">
            {claims.map((row) => {
              const cat = categoryOf(row.top_category);
              const rate =
                row.claims_per_1k === null ? null : Number(row.claims_per_1k);
              return (
                <li key={row.child_id}>
                  <Card class="p-4">
                    <div class="flex flex-wrap items-center gap-3">
                      <span aria-hidden="true" class="text-lg">
                        {row.child_emoji ?? "📍"}
                      </span>
                      <Link
                        href={`${routes.community(row.child_slug)}/reclamos`}
                        class="min-w-0 flex-1 font-medium text-ink-strong hover:text-brand hover:underline"
                      >
                        {row.child_name}
                      </Link>

                      {cat && (
                        <Badge tone="neutral">
                          <span aria-hidden="true">{cat.emoji}</span>{" "}
                          {translate(locale, cat.label)}
                        </Badge>
                      )}

                      {row.answered_rate !== null && (
                        <Badge
                          tone={
                            Number(row.answered_rate) >= 50
                              ? "success"
                              : Number(row.answered_rate) > 0
                                ? "neutral"
                                : "warn"
                          }
                        >
                          {translate(locale, "{{rate}}% con respuesta", {
                            rate: formatNumber(
                              Number(row.answered_rate),
                              locale,
                            ),
                          })}
                        </Badge>
                      )}
                    </div>

                    <div class="mt-3 flex items-center gap-3">
                      <div
                        class="h-2 flex-1 overflow-hidden rounded-full bg-inset"
                        aria-hidden="true"
                      >
                        <div
                          class={cx(
                            "h-full rounded-full bg-data-500",
                            rate === null && "opacity-0",
                          )}
                          style={{
                            width: `${rate === null ? 0 : (rate / maxRate) * 100}%`,
                          }}
                        />
                      </div>
                      <p class="shrink-0 text-xs tabular-nums text-ink-muted">
                        {rate === null
                          ? translate(locale, "{{count}} reclamos", {
                              count: formatNumber(
                                Number(row.claims_total),
                                locale,
                              ),
                            })
                          : translate(
                              locale,
                              "{{rate}} por mil hab. · {{count}} en total",
                              {
                                rate: formatNumber(rate, locale),
                                count: formatNumber(
                                  Number(row.claims_total),
                                  locale,
                                ),
                              },
                            )}
                      </p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const name = ctx?.community.name ?? "";
  return {
    title: `${translate(locale, "Contraste")} · ${name} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "En qué coinciden y en qué difieren las sub-comunidades de {{community}}.",
          { community: name },
        ),
      },
    ],
  };
};
