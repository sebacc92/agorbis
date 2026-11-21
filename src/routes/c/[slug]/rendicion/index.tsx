import { $, component$, useOnWindow, useSignal } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  Icon,
  Button,
  Card,
  Chip,
  DialogFrame,
  EmptyState,
  ProgressBar,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { MetricTile } from "~/components/ui/MetricTile";
import { APP_NAME, CLAIM_CATEGORIES } from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { categoryClaimTallies } from "~/lib/claim-stats";
import { formatNumber, pluralize } from "~/lib/format";
import { single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { routes } from "~/lib/community";
import { useLocaleLoader } from "~/routes/layout";

export const useCommunityAccountability = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const community = await single(
    ev,
    "rendicion/comunidad",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, member_count")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );

  if (!community) {
    throw ev.error(404, translate(locale, "No encontramos esa comunidad."));
  }

  // Conteos exactos en la base y no filas contadas en JS: con más de mil
  // reclamos, PostgREST cortaba en silencio y la tasa "auditable" salía de un
  // recorte. Ver `src/lib/claim-stats.ts`.
  const { overall, byCategory } = await categoryClaimTallies(
    ev,
    db,
    "rendicion/reclamos",
    community.id,
  );

  const totalClaims = overall.total;
  const resolvedClaims = overall.resolved;
  // Sólo los abiertos de verdad: los rechazados no están "en curso".
  const openClaims = overall.open;
  const globalRate = overall.rate;

  // Lo que no está resuelto ni abierto (hoy, los rechazados). Se informa
  // aparte para que las tarjetas cierren: sin esto, "resueltos + en curso"
  // no daba el total y no había cómo saber por qué.
  const closedUnresolved = Math.max(
    0,
    totalClaims - resolvedClaims - openClaims,
  );
  const categoryStats = byCategory;

  return {
    community,
    totalClaims,
    resolvedClaims,
    openClaims,
    closedUnresolved,
    globalRate,
    categoryStats,
  };
});

export default component$(() => {
  const data = useCommunityAccountability();
  const locale = useLocale();
  const {
    community,
    totalClaims,
    resolvedClaims,
    openClaims,
    closedUnresolved,
    globalRate,
    categoryStats,
  } = data.value;

  const isPresentation = useSignal(false);
  const slideIndex = useSignal(0);

  const activeCategories = categoryStats.filter((c) => c.total > 0);
  const totalSlides = 1 + activeCategories.length;
  // Las categorías sin reclamos no llevan tarjeta: ocho tarjetas con "0%
  // resuelto" eran casi mil píxeles de ceros en el teléfono.
  const emptyCategories = categoryStats.filter((c) => c.total === 0);
  const claimsHref = routes.communityTab(community.slug, "reclamos");
  const categoryIcon = (key: string) =>
    CLAIM_CATEGORIES.find((c) => c.key === key)?.icon ?? "tag";

  useOnWindow(
    "keydown",
    $((e) => {
      const key = (e as KeyboardEvent).key;
      // Escape lo resuelve el `<dialog>` nativo de `DialogFrame`.
      if (
        isPresentation.value &&
        (key === "ArrowRight" || key === "PageDown")
      ) {
        if (slideIndex.value < totalSlides - 1) slideIndex.value++;
      } else if (
        isPresentation.value &&
        (key === "ArrowLeft" || key === "PageUp")
      ) {
        if (slideIndex.value > 0) slideIndex.value--;
      }
    }),
  );

  return (
    <section aria-labelledby="rendicion-titulo">
      {/* Cabecera de listado, como la de los cuatro listados (ListingHeader).
          El layout ya pone el contenedor, la miga, el h1 con el nombre y el
          chip de "Rendición": la tarjeta propia, con su segundo contenedor,
          otro h1 y un "← Volver a", repetía todo eso y corría la página
          24 px a la derecha de los chips. */}
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <h2
            id="rendicion-titulo"
            class="text-xl font-semibold tracking-tight"
          >
            {translate(locale, "Reclamos por categoría y estado")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Reclamos de {{name}} por categoría y cuántos figuran como resueltos en Agorbis.",
              { name: community.name },
            )}
          </p>
        </div>
        {/* Sin reclamos, el proyector sólo tendría una diapositiva de ceros
            para mostrar en una asamblea. */}
        {totalClaims > 0 && (
          <Button
            variant="secondary"
            size="sm"
            class="w-full sm:w-auto sm:shrink-0"
            title={translate(
              locale,
              "Abrir modo proyector para asambleas y reuniones",
            )}
            onClick$={() => {
              triggerHapticFeedback("selection");
              slideIndex.value = 0;
              isPresentation.value = true;
            }}
          >
            <Icon name="projector" />
            {translate(locale, "Modo Asamblea / Proyector")}
          </Button>
        )}
      </div>

      {totalClaims === 0 ? (
        // Sin reclamos no hay nada que rendir: cuatro ceros y ocho "0%
        // resuelto" se leían como un fracaso medido y no como una comunidad
        // que todavía no empezó.
        <EmptyState
          illustration="empty"
          title={translate(locale, "Todavía no hay reclamos en {{community}}", {
            community: community.name,
          })}
          description="Cuando se publiquen reclamos, acá vas a ver cuántos hay por categoría y cuántos figuran como resueltos."
        />
      ) : (
        <>
          {/* Una sola anatomía por cifra (D123): el color va en el rótulo y
              el número queda neutro. Antes cada número tenía su color, el
              ámbar era crudo y el cero de resueltos salía en verde. */}
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricTile
              icon="chart"
              tone="text-brand"
              label={translate(locale, "Tasa de resolución")}
              value={`${globalRate}%`}
            />
            <MetricTile
              icon="trophy"
              tone="text-success"
              label={translate(locale, "Resueltos")}
              value={
                resolvedClaims > 0 ? formatNumber(resolvedClaims, locale) : null
              }
              emptyText={translate(locale, "Todavía ninguno")}
              href={`${claimsHref}?estado=resueltos`}
            />
            <MetricTile
              icon={CONTENT_KINDS.claim.icon}
              tone={CONTENT_KIND_TONES.claim.text}
              label={translate(locale, "En curso")}
              value={openClaims > 0 ? formatNumber(openClaims, locale) : null}
              emptyText={translate(locale, "Todavía ninguno")}
              note={translate(locale, "reclamos abiertos o escalando")}
              href={`${claimsHref}?estado=abiertos`}
            />
            <MetricTile
              icon="inbox"
              label={translate(locale, "Total")}
              value={formatNumber(totalClaims, locale)}
            />
          </div>
          {closedUnresolved > 0 && (
            <p class="mt-3 text-xs text-ink-faint">
              {translate(
                locale,
                "El total incluye {{count}} reclamos cerrados sin resolver (rechazados), que no cuentan como resueltos ni como en curso.",
                { count: closedUnresolved },
              )}
            </p>
          )}

          {/* Desglose por categoría: tarjeta sólo para las que tienen
              reclamos, con el ícono propio de la categoría (D125) y la
              tarjeta entera como enlace al listado filtrado. */}
          <section class="mt-8">
            <h2 class="text-lg font-semibold text-ink-strong">
              {translate(locale, "Por categoría")}
            </h2>

            <ul class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeCategories.map((cat) => (
                <li key={cat.key}>
                  <Card
                    interactive
                    class="group relative flex h-full flex-col p-5"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <span
                        class={cx(
                          "grid size-10 shrink-0 place-items-center rounded-xl",
                          CONTENT_KIND_TONES.claim.bg,
                          CONTENT_KIND_TONES.claim.text,
                        )}
                      >
                        <Icon name={categoryIcon(cat.key)} class="text-xl" />
                      </span>
                      <Chip variant="badge" class="tabular-nums">
                        {cat.rate}% {translate(locale, "resuelto")}
                      </Chip>
                    </div>

                    {/* El enlace vive en el título y se estira sobre la
                        tarjeta (`after:inset-0`): el nombre accesible es la
                        categoría y no todo el texto de la tarjeta. */}
                    <h3 class="mt-3 font-display text-display-xs text-ink-strong">
                      <Link
                        href={`${claimsHref}?categoria=${cat.key}`}
                        class="transition-colors after:absolute after:inset-0 after:rounded-2xl group-hover:text-brand focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
                      >
                        {translate(locale, cat.label)}
                      </Link>
                    </h3>

                    <div class="mt-3">
                      <ProgressBar
                        value={cat.resolved}
                        max={Math.max(1, cat.total)}
                        label={cat.label}
                        tone={cat.rate >= 50 ? "brand" : "data"}
                        valueText={`${cat.rate}%`}
                      />
                    </div>

                    {/* "En curso" como en la cabecera: "pendientes" nombraba
                        lo mismo con otra palabra y salía "1 pendientes". */}
                    <div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-subtle pt-3 text-xs text-ink-muted">
                      <span class="inline-flex items-center gap-1">
                        <Icon
                          name="trophy"
                          class={cat.resolved > 0 ? "text-success" : undefined}
                        />
                        {pluralize(
                          cat.resolved,
                          "resuelto",
                          "resueltos",
                          locale,
                        )}
                      </span>
                      <span class="inline-flex items-center gap-1">
                        <Icon name="clock" />
                        {translate(locale, "{{count}} en curso", {
                          count: formatNumber(cat.open, locale),
                        })}
                      </span>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            {emptyCategories.length > 0 && (
              <div class="mt-6">
                <h3 class="text-sm font-semibold text-ink-muted">
                  {translate(locale, "Categorías sin reclamos")}
                </h3>
                <ul class="mt-3 flex flex-wrap gap-2">
                  {emptyCategories.map((cat) => (
                    <li key={cat.key}>
                      <Chip
                        variant="badge"
                        icon={categoryIcon(cat.key)}
                        toneClass="border-subtle bg-transparent text-ink-muted"
                      >
                        {translate(locale, cat.label)}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </>
      )}

      {/* Se retiró la nota que prometía "duplicar la velocidad de respuesta":
          no hay medición que la respalde. */}

      {/* Modal de Modo Asamblea / Pantalla Completa para Proyectores */}
      {isPresentation.value && (
        <DialogFrame
          onClose$={() => {
            isPresentation.value = false;
          }}
          label={translate(locale, "Modo Asamblea y Proyector")}
          closeOnBackdrop={false}
          class="h-full max-h-none w-full max-w-none overflow-y-auto bg-neutral-950 p-6 text-white sm:p-12 open:flex open:flex-col open:justify-between"
        >
          {/* Header de la presentación */}
          <div class="flex items-center justify-between border-b border-neutral-800 pb-4">
            <div class="flex items-center gap-3">
              <span class="text-3xl" aria-hidden="true">
                {community.emoji ?? "🏛️"}
              </span>
              <div>
                <h2 class="text-lg font-black tracking-tight text-white sm:text-2xl">
                  {community.name} · {translate(locale, "Rendición de Cuentas")}
                </h2>
                <p class="text-xs text-neutral-400">
                  {translate(locale, "Asamblea Vecinal Abierta")}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick$={() => (isPresentation.value = false)}
              class="flex cursor-pointer items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-bold text-neutral-200 transition hover:bg-neutral-800"
            >
              <Icon name="x" />
              <span>{translate(locale, "Salir (Esc)")}</span>
            </button>
          </div>

          {/* Diapositiva Principal */}
          <div class="my-auto py-8">
            {slideIndex.value === 0 ? (
              /* Diapositiva 0: Resumen General */
              <div class="mx-auto max-w-5xl text-center">
                <span class="inline-block rounded-full bg-brand-900/60 px-4 py-1 text-sm font-bold text-brand-300">
                  {translate(locale, "Balance General de Respuestas")}
                </span>
                <h3 class="mt-4 text-3xl font-black text-white sm:text-5xl">
                  {globalRate}% {translate(locale, "marcados como resueltos")}
                </h3>
                <p class="mt-2 text-sm text-neutral-400 sm:text-base">
                  {translate(
                    locale,
                    "De {{total}} reclamos comunitarios presentados por los vecinos.",
                    { total: totalClaims },
                  )}
                </p>

                <div class="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div class="rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6">
                    <p class="text-4xl font-black tabular-nums text-brand-400 sm:text-5xl">
                      {globalRate}%
                    </p>
                    <p class="mt-2 text-sm font-bold text-neutral-300">
                      {translate(locale, "Tasa de Resolución")}
                    </p>
                  </div>
                  <div class="rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6">
                    <p class="text-4xl font-black tabular-nums text-success-400 sm:text-5xl">
                      {resolvedClaims}
                    </p>
                    <p class="mt-2 text-sm font-bold text-neutral-300">
                      {translate(locale, "Victorias Logradas")}
                    </p>
                  </div>
                  <div class="rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6">
                    <p class="text-4xl font-black tabular-nums text-amber-400 sm:text-5xl">
                      {openClaims}
                    </p>
                    <p class="mt-2 text-sm font-bold text-neutral-300">
                      {translate(locale, "Reclamos en Curso")}
                    </p>
                  </div>
                  <div class="rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6">
                    <p class="text-4xl font-black tabular-nums text-neutral-100 sm:text-5xl">
                      {totalClaims}
                    </p>
                    <p class="mt-2 text-sm font-bold text-neutral-300">
                      {translate(locale, "Total Vecinales")}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Diapositiva 1..N: Detalle de Categoría Activa */
              (() => {
                const currentCat = activeCategories[slideIndex.value - 1];
                if (!currentCat) return null;
                return (
                  <div class="mx-auto max-w-4xl text-center">
                    <span class="text-6xl sm:text-7xl" aria-hidden="true">
                      {currentCat.emoji}
                    </span>
                    <h3 class="mt-4 text-3xl font-black text-white sm:text-5xl">
                      {translate(locale, currentCat.label)}
                    </h3>
                    <p class="mt-2 text-base text-neutral-400">
                      {translate(
                        locale,
                        "{{resolved}} de {{total}} reclamos marcados como resueltos",
                        {
                          resolved: currentCat.resolved,
                          total: currentCat.total,
                        },
                      )}
                    </p>

                    <div class="mt-8 rounded-3xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-2xl">
                      <div class="flex items-center justify-between text-2xl font-black">
                        <span class="text-neutral-300">
                          {translate(locale, "Tasa de Resolución")}
                        </span>
                        <span class="text-brand-400">{currentCat.rate}%</span>
                      </div>
                      <div class="mt-4 h-5 w-full overflow-hidden rounded-full bg-neutral-800">
                        <div
                          class="h-full rounded-full bg-gradient-to-r from-brand-500 to-success-400 transition-all duration-500"
                          style={{ width: `${currentCat.rate}%` }}
                        />
                      </div>
                      <div class="mt-6 flex justify-around text-center">
                        <div>
                          <p class="text-3xl font-black text-success-400 sm:text-4xl">
                            {currentCat.resolved}
                          </p>
                          <p class="text-xs font-bold uppercase text-neutral-400">
                            {translate(locale, "Resueltos")}
                          </p>
                        </div>
                        <div>
                          <p class="text-3xl font-black text-amber-400 sm:text-4xl">
                            {currentCat.open}
                          </p>
                          <p class="text-xs font-bold uppercase text-neutral-400">
                            {translate(locale, "Pendientes")}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          {/* Barra de control inferior */}
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-800 pt-4">
            <div class="flex items-center gap-2">
              <button
                type="button"
                disabled={slideIndex.value === 0}
                onClick$={() => {
                  triggerHapticFeedback("selection");
                  if (slideIndex.value > 0) slideIndex.value--;
                }}
                class="cursor-pointer rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-30 active:scale-95"
              >
                ← {translate(locale, "Anterior")}
              </button>
              <button
                type="button"
                disabled={slideIndex.value >= totalSlides - 1}
                onClick$={() => {
                  triggerHapticFeedback("selection");
                  if (slideIndex.value < totalSlides - 1) slideIndex.value++;
                }}
                class="cursor-pointer rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-30 active:scale-95"
              >
                {translate(locale, "Siguiente")}
                <Icon name="arrow-right" class="ml-1" />
              </button>
            </div>

            <p class="text-xs text-neutral-400">
              {translate(locale, "Diapositiva {{current}} de {{total}}", {
                current: slideIndex.value + 1,
                total: totalSlides,
              })}{" "}
              ·{" "}
              <span class="text-neutral-500">
                {translate(locale, "Navegá con flechas ← → o teclado")}
              </span>
            </p>
          </div>
        </DialogFrame>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useCommunityAccountability);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const name = data?.community.name ?? "Comunidad";

  // El mismo nombre que el chip de la herramienta.
  return {
    title: `${translate(locale, "Rendición")} · ${name} · ${APP_NAME}`,
  };
};
