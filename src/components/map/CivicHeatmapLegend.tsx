import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { cx, ExternalLinkHint, Icon } from "~/components/ui";
import { CLAIM_STATUS_LABEL } from "~/lib/constants";
import { translate, useLocale } from "~/lib/i18n";

/** Los tonos de `CLAIM_STATUS_LABEL`, los mismos que pinta el `Badge`. */
export type StatusTone = "warn" | "brand" | "success" | "danger";

interface StatusToneColor {
  /** Relleno del punto en el esquema: el SVG pinta con `currentColor`. */
  marker: string;
  /** Punto de la leyenda. */
  dot: string;
}

/**
 * Un solo color por tono de estado (D126), el mismo en el punto del esquema y
 * en la leyenda. Los puntos ya se pintaban por estado, pero nada decía qué
 * color era cuál, y "Abierto" salía ámbar en el punto y naranja en su badge.
 * Cadenas completas porque Tailwind sólo genera lo que encuentra escrito; en
 * oscuro sube un tono para no perderse contra el fondo.
 */
export const STATUS_TONE_COLOR: Record<StatusTone, StatusToneColor> = {
  warn: {
    marker: "text-warn-600 dark:text-warn-400",
    dot: "bg-warn-600 dark:bg-warn-400",
  },
  brand: {
    marker: "text-brand-600 dark:text-brand-400",
    dot: "bg-brand-600 dark:bg-brand-400",
  },
  success: {
    marker: "text-success-600 dark:text-success-400",
    dot: "bg-success-600 dark:bg-success-400",
  },
  danger: {
    marker: "text-danger-600 dark:text-danger-400",
    dot: "bg-danger-600 dark:bg-danger-400",
  },
};

export const CivicHeatmapLegend = component$<{
  communitySlug: string;
  statusCounts: Record<string, number>;
  criticalPoints: number;
}>(({ communitySlug, statusCounts, criticalPoints }) => {
  const locale = useLocale();

  return (
    <section
      aria-label={translate(locale, "Estado de los reclamos")}
      class="rounded-2xl border border-subtle bg-surface p-4"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 class="flex items-center gap-2 font-display text-display-xs text-ink-strong">
          <Icon name="chart" class="text-ink-muted" />
          {translate(locale, "Estado de los reclamos")}
        </h3>

        {/* Son acciones sueltas, no enlaces dentro de una oración: llevan el
            área táctil de 44 px del resto de los controles del mapa. */}
        <div class="flex items-center gap-2 text-2xs">
          <Link
            href={`/c/${communitySlug}/datos.json`}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
            title={translate(locale, "GeoJSON abierto para mapas y SIG")}
          >
            {translate(locale, "Descargar GeoJSON")}
            <ExternalLinkHint />
          </Link>
          <span class="text-ink-faint">·</span>
          <Link
            href={`/c/${communitySlug}/feed.xml`}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center font-semibold text-brand hover:underline"
            title={translate(locale, "Feed RSS para lectores de noticias")}
          >
            {translate(locale, "Canal RSS")}
            <ExternalLinkHint />
          </Link>
        </div>
      </div>
      <p class="mt-1 text-xs text-ink-muted">
        {translate(
          locale,
          "El color de cada punto del esquema indica el estado del reclamo.",
        )}
      </p>

      {/* Filas compactas en lugar de seis cajas: el punto es el color del
          esquema y el `dt` conserva sólo la etiqueta como texto. */}
      <dl class="mt-3 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        {Object.entries(CLAIM_STATUS_LABEL)
          .filter(([status]) => status !== "removed")
          .map(([status, metadata]) => {
            const count = statusCounts[status] ?? 0;
            const color =
              STATUS_TONE_COLOR[metadata.tone as StatusTone] ??
              STATUS_TONE_COLOR.warn;
            // El cero va atenuado: no es un dato que destacar (D123).
            const countClass =
              count > 0 ? "font-semibold text-ink-strong" : "text-ink-faint";
            return (
              <div
                key={status}
                class="flex items-center justify-between gap-3 border-b border-subtle/60 py-1.5 text-sm"
              >
                <dt class="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
                  <span
                    aria-hidden="true"
                    class={cx("size-2.5 shrink-0 rounded-full", color.dot)}
                  />
                  {translate(locale, metadata.label)}
                </dt>
                <dd class={cx("font-display tabular-nums", countClass)}>
                  {count}
                </dd>
              </div>
            );
          })}
      </dl>
      {/* El mismo criterio que los conteos de arriba: sin focos, el cero no
          se destaca (D123). */}
      <p class="mt-3 text-xs text-ink-muted">
        <strong
          class={
            criticalPoints > 0
              ? "font-semibold text-ink-strong"
              : "font-normal text-ink-faint"
          }
        >
          {translate(locale, "Focos críticos")}: {criticalPoints}
        </strong>
        {" · "}
        {translate(locale, "Reclamos abiertos con al menos 5 apoyos.")}
      </p>
      <p class="mt-1 text-xs text-ink-muted">
        {translate(
          locale,
          "Conteos de los resultados cargados, incluidos los reclamos fuera del radio o sin ubicación.",
        )}
      </p>
    </section>
  );
});
