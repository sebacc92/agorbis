import { component$, useSignal } from "@qwik.dev/core";
import { Icon, Illustration, cx, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { currentPageUrl, shareOnWhatsApp } from "~/lib/share";

export interface PollResultRow {
  option_id: string;
  label: string;
  votes: number;
  percentage: number;
}

/**
 * Barras horizontales en SVG propio, sin librería de charting.
 *
 * La barra es un `<rect>` dentro de un `viewBox` de 100 unidades de ancho, así
 * que su ancho *es* el porcentaje. La animación de entrada la hace CSS
 * (`transform: scaleX` con origen a la izquierda): dibujar los resultados no
 * cuesta un solo byte de JavaScript.
 *
 * Las etiquetas y los números van en HTML, **no** dentro del SVG. El `viewBox`
 * usa `preserveAspectRatio="none"` para que el ancho sea exactamente el
 * porcentaje, y eso deforma cualquier texto que viva adentro (se estira en
 * horizontal tanto como el SVG). El redondeo de las puntas lo da el contenedor
 * HTML, por el mismo motivo: un `rx` también se deformaría.
 */
export const PollResults = component$<{
  results: PollResultRow[];
  totalVotes: number;
  totalVoters: number;
  question?: string;
  communityName?: string;
}>(({ results, totalVotes, totalVoters, question, communityName }) => {
  const locale = useLocale();
  const copied = useSignal(false);
  if (results.length === 0) return null;

  /**
   * Sin un solo voto, `poll_results` devuelve igual una fila por opción: la
   * pantalla mostraba la lista completa con 0 % y todas las barras vacías,
   * que se lee como "los resultados están rotos" y no como "todavía no votó
   * nadie". Las opciones ya están arriba, en el formulario de votación.
   */
  if (totalVotes === 0) {
    return (
      <div class="py-6 text-center">
        <Illustration name="empty" class="mx-auto size-16" />
        <p class="mt-2 text-sm font-medium text-ink-strong">
          {translate(locale, "Todavía no votó nadie")}
        </p>
        <p class="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
          {translate(
            locale,
            "El primer voto es el que hace que valga la pena mirar esta página.",
          )}
        </p>
      </div>
    );
  }

  const leader = Math.max(...results.map((r) => r.votes));
  const participants = translate(locale, "Participantes: {{count}}", {
    count: formatNumber(totalVoters, locale),
  });

  return (
    <div>
      {/* Sólo se muestran resultados agregados reales; no hay datos por zona. */}
      <div class="mb-4 rounded-2xl border border-subtle bg-muted/40 px-3.5 py-3 text-sm">
        <p class="font-medium text-ink-strong">{participants}</p>
        <p class="mt-1 text-xs leading-relaxed text-ink-muted">
          {translate(
            locale,
            "Los resultados reflejan sólo a quienes participaron. En encuestas de varias respuestas, una persona puede emitir más de un voto.",
          )}
        </p>
      </div>

      <ul class="space-y-3">
        {results.map((row, i) => {
          const isLeader = row.votes === leader && leader > 0;

          return (
            <li
              key={row.option_id}
              class={cx(
                "rounded-2xl p-3 transition-colors",
                isLeader
                  ? "border border-brand-500/20 bg-muted/40 dark:border-brand-500/30 dark:bg-muted/20"
                  : "bg-transparent",
              )}
            >
              <div class="flex items-baseline justify-between gap-3">
                <span
                  dir="auto"
                  class="min-w-0 text-sm font-medium text-ink-strong"
                >
                  {row.label}
                  {/* La opción que va ganando se distinguía sólo por el tono
                        de la barra: en escala de grises, impresa o con
                        daltonismo, el resultado principal de la encuesta
                        desaparecía (WCAG 1.4.1). */}
                  {isLeader && (
                    <span class="ml-1.5 align-middle text-3xs font-semibold uppercase tracking-wide text-brand">
                      {translate(locale, "Más votada")}
                    </span>
                  )}
                </span>
                <span class="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">
                  {formatNumber(row.percentage, locale)}%
                </span>
              </div>

              {/* El wrapper redondea; el SVG aporta geometría con degradado */}
              <div class="mt-2 h-3 w-full overflow-hidden rounded-full bg-inset shadow-inner">
                <svg
                  viewBox="0 0 100 12"
                  preserveAspectRatio="none"
                  width="100%"
                  height="100%"
                  aria-hidden="true"
                  class="block"
                >
                  <defs>
                    <linearGradient
                      id={`grad-${row.option_id}`}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop
                        offset="0%"
                        stop-color={isLeader ? "#7c3aed" : "#94a3b8"}
                      />
                      <stop
                        offset="100%"
                        stop-color={isLeader ? "#a855f7" : "#cbd5e1"}
                      />
                    </linearGradient>
                  </defs>
                  <rect
                    x="0"
                    y="0"
                    width={Math.max(row.percentage, 0)}
                    height="12"
                    fill={`url(#grad-${row.option_id})`}
                    class="origin-left animate-bar-grow"
                    style={{ animationDelay: `${i * 70}ms` }}
                  />
                </svg>
              </div>

              <p class="mt-1.5 text-xs tabular-nums text-ink-faint">
                {pluralize(row.votes, "voto", "votos", locale)}
              </p>
            </li>
          );
        })}
      </ul>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-subtle pt-4">
        <p class="text-sm text-ink-muted">
          <strong class="font-semibold tabular-nums text-ink-strong">
            {formatNumber(totalVotes, locale)}
          </strong>{" "}
          {translate(
            locale,
            totalVotes === 1 ? "voto emitido" : "votos emitidos",
          )}
        </p>

        {/* Botones para compartir resultados */}
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick$={async () => {
              triggerHapticFeedback("success");
              const lines = [
                `🗳️ *${translate(locale, "Resultados de la encuesta en Agorbis")}*`,
                question ? `"${question}"` : "",
                communityName ? `📍 ${communityName}` : "",
                "",
                ...results.map(
                  (r) =>
                    `• ${r.label}: ${formatNumber(r.percentage, locale)}% (${pluralize(r.votes, "voto", "votos", locale)})`,
                ),
                "",
                `👥 ${translate(locale, "Total:")} ${formatNumber(totalVotes, locale)} ${translate(locale, totalVotes === 1 ? "voto emitido" : "votos emitidos")}`,
                translate(locale, "Participantes: {{count}}", {
                  count: formatNumber(totalVoters, locale),
                }),
                typeof window !== "undefined" ? window.location.href : "",
              ].filter(Boolean);
              const text = lines.join("\n");
              try {
                await navigator.clipboard.writeText(text);
                copied.value = true;
                showToast(
                  translate(locale, "Resumen de resultados copiado."),
                  "success",
                );
                setTimeout(() => {
                  copied.value = false;
                }, 2500);
              } catch {
                // Sin permiso de portapapeles el botón no puede quedarse
                // callado: la persona creería que copió.
                showToast(translate(locale, "No se pudo copiar"), "danger");
              }
            }}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-control bg-surface px-3 py-1.5 text-xs font-semibold text-ink-strong shadow-xs transition hover:border-brand-500 hover:bg-muted"
          >
            <Icon name={copied.value ? "check" : "copy"} class="text-sm" />
            <span>
              {copied.value
                ? translate(locale, "Copiado")
                : translate(locale, "Copiar resumen")}
            </span>
          </button>

          <button
            type="button"
            onClick$={() => {
              triggerHapticFeedback("selection");
              const lines = [
                `🗳️ *${translate(locale, "Resultados de la encuesta en Agorbis")}*`,
                question ? `"${question}"` : "",
                communityName ? `📍 ${communityName}` : "",
                "",
                ...results.map(
                  (r) =>
                    `• ${r.label}: ${formatNumber(r.percentage, locale)}% (${pluralize(r.votes, "voto", "votos", locale)})`,
                ),
                "",
                `👥 ${translate(locale, "Total:")} ${formatNumber(totalVotes, locale)} ${translate(locale, totalVotes === 1 ? "voto emitido" : "votos emitidos")}`,
                translate(locale, "Participantes: {{count}}", {
                  count: formatNumber(totalVoters, locale),
                }),
                currentPageUrl(),
              ].filter(Boolean);
              shareOnWhatsApp(lines.join("\n"));
            }}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-success-600 px-3 py-1.5 text-xs font-semibold text-white shadow-soft transition hover:bg-success-500 active:scale-95"
          >
            <span aria-hidden="true">💬</span>
            <span>{translate(locale, "Compartir en WhatsApp")}</span>
          </button>
        </div>
      </div>
    </div>
  );
});
