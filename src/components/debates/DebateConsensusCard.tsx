import { $, component$, useComputed$, useSignal } from "@qwik.dev/core";
import {
  Badge,
  Button,
  Card,
  Icon,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import type { DebateColumnData } from "./DebateColumn";

export const DebateConsensusCard = component$<{
  columns: DebateColumnData[];
  myColumnId: string | null;
  communityName: string;
}>(({ columns, myColumnId, communityName }) => {
  const locale = useLocale();
  const isExpanded = useSignal(false);

  const totalComments = useComputed$(() =>
    columns.reduce((sum, col) => sum + col.commentCount, 0),
  );

  const activeColumns = useComputed$(() =>
    columns.filter((col) => col.commentCount > 0),
  );

  const topColumns = useComputed$(() =>
    [...columns]
      .filter((col) => col.commentCount > 0)
      .sort((a, b) => b.commentCount - a.commentCount)
      .slice(0, 3),
  );

  const bestVotedComment = useComputed$(() => {
    let best: { body: string; score: number; columnName: string } | null = null;
    for (const col of columns) {
      for (const comment of col.comments) {
        if (!best || comment.score > best.score) {
          best = {
            body: comment.body,
            score: comment.score,
            columnName: col.name,
          };
        }
      }
    }
    return best;
  });

  const jumpToColumn$ = $((columnId: string) => {
    triggerHapticFeedback("selection");
    playCivicSound("click");
    const el = document.getElementById(`debate-column-${columnId}`);
    if (el) {
      el.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
      el.classList.add("ring-2", "ring-brand-500", "transition-all");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-brand-500");
      }, 2000);
    }
  });

  const toggleOpen$ = $(() => {
    triggerHapticFeedback("selection");
    playCivicSound("toggle");
    isExpanded.value = !isExpanded.value;
  });

  if (columns.length === 0) return null;

  return (
    // Tarjeta plana (D123): no es clicable entera, así que no se eleva.
    <Card class="overflow-hidden">
      {/* La misma anatomía que el cajón de citas: cuadro con el color del
          tipo, título con un dato neutro y el plegado como botón del sistema.
          El plegado sigue siendo el primer botón de la tarjeta. */}
      <div class="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div class="flex min-w-0 items-center gap-3">
          <span
            class={cx(
              "grid size-10 shrink-0 place-items-center rounded-xl",
              CONTENT_KIND_TONES.debate.bg,
              CONTENT_KIND_TONES.debate.text,
            )}
          >
            <Icon name="chart" class="text-xl" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-bold text-ink-strong sm:text-base">
                {translate(locale, "Resumen de participación territorial")}
              </h2>
              {/* Un dato, no una acción: neutro y no violeta (D123). */}
              <Badge class="tabular-nums">
                {activeColumns.value.length} / {columns.length}{" "}
                {translate(locale, "comunidades")}
              </Badge>
            </div>
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Actividad por zona y puntajes de los comentarios cargados en {{community}}.",
                { community: communityName },
              )}
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          class="shrink-0"
          onClick$={toggleOpen$}
          aria-expanded={isExpanded.value}
        >
          {isExpanded.value
            ? translate(locale, "Ocultar síntesis")
            : translate(locale, "Ver síntesis")}
          <Icon
            name="chevron-down"
            class={cx(
              "transition-transform duration-200",
              isExpanded.value && "rotate-180",
            )}
          />
        </Button>
      </div>

      {isExpanded.value && (
        <div class="animate-fade-in border-t border-subtle p-4 sm:p-5">
          <p class="mb-4 text-xs text-ink-muted">
            {translate(
              locale,
              "Los puntajes corresponden a los comentarios cargados al abrir esta página: votos a favor menos votos en contra. No miden el acuerdo de toda la comunidad.",
            )}
          </p>
          {totalComments.value === 0 ? (
            // El vacío es una línea atenuada, no un emoji en grande (D123).
            <p class="flex items-start gap-2 text-sm text-ink-faint">
              <Icon name="chat" class="mt-0.5 shrink-0" />
              <span>
                <span class="font-medium text-ink-muted">
                  {translate(locale, "Aún no hay comentarios en este debate")}
                </span>{" "}
                {translate(
                  locale,
                  "Compartí tu perspectiva desde tu comunidad para iniciar la conversación.",
                )}
              </span>
            </p>
          ) : (
            <div class="grid gap-4 md:grid-cols-2">
              {/* Distribución territorial. Las cajas no son clicables: no se
                  levantan al pasar el mouse. */}
              <div class="space-y-3 rounded-xl border border-subtle p-4">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-xs font-semibold text-ink-muted">
                    {translate(locale, "Distribución de aportes por zona")}
                  </h3>
                  <span class="text-xs font-semibold tabular-nums text-ink-muted">
                    {formatNumber(totalComments.value, locale)}{" "}
                    {translate(locale, "totales")}
                  </span>
                </div>

                <div class="space-y-2.5 pt-1">
                  {topColumns.value.map((col) => {
                    const pct = Math.round(
                      (col.commentCount / totalComments.value) * 100,
                    );
                    const isMine = col.id === myColumnId;
                    return (
                      <div key={`consensus-col-${col.id}`} class="space-y-1">
                        <div class="flex items-center justify-between gap-2 text-xs">
                          {/* Con la altura de una línea de text-xs el salto
                              quedaba en 16 a 20 px. A 32 px, las áreas de 44
                              de dos zonas vecinas no se pisan: la barra y el
                              espacio entre filas dejan unos 52 px entre
                              centros. */}
                          <button
                            type="button"
                            onClick$={() => jumpToColumn$(col.id)}
                            class="touch-target inline-flex min-h-8 min-w-0 cursor-pointer items-center gap-1.5 font-medium text-ink-strong transition-colors duration-150 hover:text-brand hover:underline touch-manipulation"
                          >
                            <span class="truncate">{col.name}</span>
                            {isMine && (
                              <Badge tone="success">
                                {translate(locale, "Tu zona")}
                              </Badge>
                            )}
                          </button>
                          <span class="shrink-0 font-semibold tabular-nums text-ink-muted">
                            {col.commentCount} ({pct}%)
                          </span>
                        </div>
                        {/* Barras con el color del tipo sobre el hundido del
                            tema: el violeta queda para la acción (D123). La
                            propia sigue en verde, como su columna. */}
                        <div class="h-1.5 w-full overflow-hidden rounded-full bg-inset">
                          <div
                            class={cx(
                              "h-full rounded-full transition-all duration-300",
                              isMine ? "bg-success-500" : "bg-kind-debate",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {myColumnId && (
                  <div class="border-t border-subtle pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick$={() => jumpToColumn$(myColumnId)}
                    >
                      <Icon name="map-pin" />
                      {translate(locale, "Ir directamente a tu columna")}
                      <Icon name="arrow-right" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Puntos destacados de deliberación */}
              <div class="space-y-3 rounded-xl border border-subtle p-4">
                <h3 class="text-xs font-semibold text-ink-muted">
                  {translate(locale, "Pulso y síntesis cívica")}
                </h3>

                <div class="space-y-2.5 text-xs">
                  {/* Se retiró una "convergencia territorial" fija que se mostraba
                      igual en todo debate: la síntesis sólo cita aportes reales. */}
                  {bestVotedComment.value && (
                    <div class="flex items-start gap-2.5 rounded-lg bg-muted/60 p-3">
                      {/* El trofeo va fuera del bloque del título: el primer
                          span junto al título tiene que ser el puntaje. */}
                      <Icon
                        name="trophy"
                        class="mt-0.5 shrink-0 text-base text-accent"
                      />
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5">
                          <p class="font-semibold text-ink-strong">
                            {translate(
                              locale,
                              "Mayor puntaje entre los comentarios cargados",
                            )}
                          </p>
                          <Badge class="tabular-nums">
                            {bestVotedComment.value.score > 0 ? "+" : ""}
                            {formatNumber(bestVotedComment.value.score, locale)}
                          </Badge>
                        </div>
                        <blockquote
                          dir="auto"
                          class="ugc-text mt-1 line-clamp-2 border-l-2 border-kind-debate/50 pl-2.5 text-ink-muted"
                        >
                          {bestVotedComment.value.body}
                        </blockquote>
                        <p class="mt-1 text-2xs text-ink-faint">
                          {translate(locale, "En columna:")}{" "}
                          <span class="font-medium text-ink-strong">
                            {bestVotedComment.value.columnName}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
});
