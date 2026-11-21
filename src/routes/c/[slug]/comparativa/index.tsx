import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Badge, ButtonLink, Card, Icon, cx } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { escapeLike } from "~/lib/community";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { communityClaimTallies, makeTally } from "~/lib/claim-stats";
import { many, single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";

export interface CommunityBenchmark {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  member_count: number;
  totalClaims: number;
  resolvedClaims: number;
  activeClaims: number;
  resolutionRate: number;
  isCurrent: boolean;
}

export const useCommunityBenchmark = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const community = await single(
    ev,
    "comparativa/comunidad",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path, member_count")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community) {
    throw ev.error(404, translate(locale, "No encontramos esa comunidad."));
  }

  // Buscar comunidades hermanas en el mismo nivel territorial
  const pathParts = community.path.split(".");
  const parentPath = pathParts.slice(0, -1).join(".");

  const siblingsQuery = parentPath
    ? db
        .from("communities")
        .select("id, slug, name, emoji, level, path, member_count")
        .eq("level", community.level)
        .ilike("path", `${escapeLike(parentPath)}.%`)
        .order("member_count", { ascending: false })
        .limit(6)
    : db
        .from("communities")
        .select("id, slug, name, emoji, level, path, member_count")
        .eq("level", community.level)
        .order("member_count", { ascending: false })
        .limit(6);

  const siblingCommunities = await many(
    ev,
    "comparativa/hermanas",
    siblingsQuery,
  );

  // Asegurar que la comunidad actual esté incluida
  const targetCommunities = [
    community,
    ...siblingCommunities.filter((s) => s.id !== community.id),
  ].slice(0, 5);

  // Conteos exactos por comunidad, en paralelo. Antes se traían las filas de
  // las cinco juntas y PostgREST cortaba en mil: la comunidad más grande se
  // comía el recorte y las demás aparecían con menos reclamos de los que
  // tienen.
  const tallies = await communityClaimTallies(
    ev,
    db,
    "comparativa/reclamos",
    targetCommunities.map((c) => c.id),
  );

  const benchmarks: CommunityBenchmark[] = targetCommunities.map((c) => {
    const tally = tallies.get(c.id) ?? makeTally(0, 0, 0);
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      emoji: c.emoji,
      member_count: c.member_count,
      totalClaims: tally.total,
      resolvedClaims: tally.resolved,
      // Abiertos de verdad: los rechazados no están "en curso".
      activeClaims: tally.open,
      resolutionRate: tally.rate,
      isCurrent: c.id === community.id,
    };
  });

  return {
    community,
    benchmarks,
  };
});

export default component$(() => {
  const data = useCommunityBenchmark();
  const locale = useLocale();
  const { community, benchmarks } = data.value;

  const currentBenchmark = benchmarks.find((b) => b.isCurrent);

  return (
    <section aria-labelledby="comparativa-titulo">
      {/* Cabecera de listado, como contraste y rendición: el layout ya pone
          el contenedor, la miga y el nombre de la comunidad. La tarjeta con
          degradé, el emoji y un título en mayúsculas repetía todo eso con
          otro lenguaje visual (D123, D126). */}
      <header class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <h2
            id="comparativa-titulo"
            class="text-xl font-semibold tracking-tight"
          >
            {translate(locale, "Comparativa territorial e impacto vecinal")}
          </h2>
        </div>

        <div class="flex flex-wrap gap-2">
          <ButtonLink
            href={`/c/${community.slug}/rendicion`}
            variant="secondary"
            size="sm"
          >
            {translate(locale, "Ver rendición de cuentas")}
          </ButtonLink>
          <ButtonLink
            href={`/c/${community.slug}/victorias`}
            variant="secondary"
            size="sm"
          >
            {translate(locale, "Muro de victorias")}
          </ButtonLink>
        </div>
      </header>

      {/* Sin "hallazgos" ni porcentajes de mejora: Agorbis no tiene un estudio
          que los respalde. La página compara sólo lo publicado en la base. */}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {benchmarks.map((b) => (
          <Card
            key={b.id}
            class={cx(
              "flex min-w-0 flex-col p-5",
              b.isCurrent &&
                "border-brand-500 bg-brand-50/20 dark:bg-brand-950/20",
            )}
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="flex min-w-0 items-center gap-2 font-display font-semibold text-ink-strong">
                <span aria-hidden="true">{b.emoji}</span>
                <Link
                  href={`/c/${b.slug}`}
                  class="truncate hover:text-brand hover:underline"
                >
                  {b.name}
                </Link>
              </h3>
              {b.isCurrent && (
                <Badge tone="brand">
                  {translate(locale, "Comunidad consultada")}
                </Badge>
              )}
            </div>

            {/* La anatomía de `MetricTile`: el color va en el rótulo y el
                número queda neutro. Sin reclamos no hay tasa que mostrar: un
                "0%" grande y verde se leía como un resultado. */}
            {/* Cada celda en columna y la cifra abajo: un rótulo que ocupa
                dos renglones no deja las cifras a distinta altura. */}
            <dl class="mt-4 grid grid-cols-2 gap-3 border-y border-subtle py-4">
              <div class="flex flex-col">
                <dt class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success">
                  <Icon name="trophy" />
                  {translate(locale, "Tasa de victoria")}
                </dt>
                {b.totalClaims > 0 ? (
                  <dd class="mt-auto pt-1.5 font-display text-display-md tabular-nums text-ink-strong">
                    {b.resolutionRate}%
                  </dd>
                ) : (
                  <dd class="mt-auto pt-1.5 text-sm text-ink-muted">
                    {translate(locale, "Todavía sin reclamos")}
                  </dd>
                )}
              </div>
              <div class="flex flex-col">
                <dt class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  <Icon name="users" />
                  {translate(locale, "Personas miembro")}
                </dt>
                <dd class="mt-auto pt-1.5 font-display text-display-md tabular-nums text-ink-strong">
                  {formatNumber(b.member_count, locale)}
                </dd>
              </div>
            </dl>

            <dl class="mt-4 space-y-2 text-sm text-ink-muted">
              <div class="flex justify-between gap-3">
                <dt>{translate(locale, "Reclamos resueltos:")}</dt>
                <dd class="font-semibold tabular-nums text-ink-strong">
                  {b.resolvedClaims}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt>{translate(locale, "Reclamos en curso:")}</dt>
                <dd class="font-semibold tabular-nums text-ink-strong">
                  {b.activeClaims}
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt>{translate(locale, "Total reportados:")}</dt>
                <dd class="font-semibold tabular-nums text-ink-strong">
                  {b.totalClaims}
                </dd>
              </div>
            </dl>

            <div class="mt-auto pt-5">
              <Link
                href={`/c/${b.slug}/rendicion`}
                class="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
              >
                {translate(locale, "Ver rendición completa")}
                <Icon name="arrow-right" />
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {/* Invitación a fortalecer la comunidad */}
      {currentBenchmark && currentBenchmark.resolutionRate < 50 && (
        <div class="mt-10 rounded-2xl border border-warn-500/30 bg-warn-50/30 p-6 text-center dark:bg-warn-950/20">
          <h3 class="text-base font-bold text-ink-strong">
            {translate(locale, "¿Querés que {{name}} resuelva más reclamos?", {
              name: community.name,
            })}
          </h3>
          <div class="mt-4">
            <ButtonLink href={`/c/${community.slug}/reclamos`} size="sm">
              {translate(locale, "Ver reclamos y sumar apoyos")}
            </ButtonLink>
          </div>
        </div>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useCommunityBenchmark);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const name = data?.community.name ?? "Comunidad";

  return {
    title: `${translate(locale, "Comparativa Territorial")} · ${name} · ${APP_NAME}`,
  };
};
