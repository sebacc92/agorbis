import { component$, useId, useSignal, $, sync$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { contentHref } from "~/lib/community";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { Card, Icon, triggerHapticFeedback } from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import type { ContentType } from "~/lib/database.types.helpers";
import { translate, useLocale } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";

export interface CivicPublication {
  kind: ContentType;
  id: string;
  title: string;
  created_at: string;
}

/**
 * Día civil (`AAAA-MM-DD`) de un instante en la zona del visitante.
 *
 * El mapa de calor agrupaba por `created_at.slice(0, 10)` (día UTC) y armaba
 * la grilla con `getDate()`/`setDate()` (día local del navegador) para
 * después volver a UTC con `toISOString()`. En Buenos Aires, una publicación
 * de las 22:00 caía en el día siguiente y la columna de "hoy" podía correrse
 * un día según la hora. Ahora las dos puntas usan la misma zona: la del
 * contexto, que es la que usan el resto de las fechas de la app.
 */
export function dayKeyInZone(instant: Date | string, timeZone: string): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Suma días a una fecha civil. La cuenta se hace en UTC a propósito: una
 * fecha sin hora no tiene zona, y así ningún cambio de horario la corre.
 */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Día de la semana de una fecha civil: 0 = lunes … 6 = domingo. */
export function mondayBasedWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Intensidad de cada día con el color de datos (D123). Era violeta, el color
 * de la navegación y la acción primaria; el violeta queda para el día elegido.
 * La leyenda usa estas mismas clases, así que no se pueden separar.
 */
const INTENSITY = {
  none: "border-subtle bg-muted",
  some: "border-data-500 bg-data-500/40",
  many: "border-data-700 bg-data-700",
} as const;

export function heatmapNextIndex(
  index: number,
  key: string,
  last: number,
  control = false,
): number {
  if (key === "Home") return control ? 0 : index - (index % 7);
  if (key === "End")
    return control ? last : Math.min(last, index - (index % 7) + 6);
  const directions: Record<string, number> = {
    ArrowLeft: -7,
    ArrowRight: 7,
    ArrowUp: -1,
    ArrowDown: 1,
  };
  const delta = directions[key];
  return delta === undefined
    ? index
    : Math.max(0, Math.min(last, index + delta));
}

export const CivicActivityHeatmap = component$<{
  publicaciones: CivicPublication[];
}>(({ publicaciones }) => {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const instanceId = useId();
  const helpId = `activity-help-${instanceId}`;
  const detailId = `activity-detail-${instanceId}`;
  const today = dayKeyInZone(new Date(), timeZone);
  const firstDay = addDaysToKey(today, -105 - mondayBasedWeekday(today));
  const lastIndex = 105 + mondayBasedWeekday(today);
  const activeIndex = useSignal(lastIndex);
  const selected = useSignal(today);
  const buckets: Record<string, CivicPublication[]> = {};
  for (const item of publicaciones) {
    const day = dayKeyInZone(item.created_at, timeZone);
    if (!day || day < firstDay || day > today) continue;
    (buckets[day] ??= []).push(item);
  }
  const cells = Array.from({ length: 112 }, (_, index) => {
    const date = addDaysToKey(firstDay, index);
    return { index, date, count: buckets[date]?.length ?? 0 };
  });
  const selectedItems = buckets[selected.value] ?? [];
  const selectDay = $((index: number) => {
    activeIndex.value = index;
    selected.value = cells[index].date;
  });

  return (
    // Plana y con el mismo margen que el pasaporte de arriba (D123): no es
    // clicable entera. "Territorial" no correspondía en una página que a
    // propósito no muestra comunidades, y el h3 no tenía un h2 arriba.
    <Card class="min-w-0 p-6 sm:p-8">
      <h2 class="text-display-xs">
        {translate(locale, "Publicaciones por día")}
      </h2>
      <p class="mt-1 text-xs text-ink-muted">
        {translate(
          locale,
          "Actividad de las publicaciones mostradas en las últimas 16 semanas.",
        )}
      </p>
      <p id={helpId} class="mt-3 text-xs text-ink-muted">
        {translate(
          locale,
          "Usá las flechas para recorrer días y semanas. También podés elegir una fecha para consultar sus publicaciones.",
        )}
      </p>
      <div class="mt-3 overflow-x-auto pb-2">
        <div
          role="group"
          aria-label={translate(locale, "Actividad por día")}
          aria-describedby={helpId}
          class="grid w-max grid-flow-col grid-rows-7 gap-1"
          onKeyDown$={[
            sync$((event: KeyboardEvent) => {
              if (
                [
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(event.key)
              )
                event.preventDefault();
            }),
            $((event: KeyboardEvent, el: HTMLDivElement) => {
              const next = heatmapNextIndex(
                activeIndex.value,
                event.key,
                lastIndex,
                event.ctrlKey || event.metaKey,
              );
              if (next === activeIndex.value) return;
              selectDay(next);
              el.querySelector<HTMLButtonElement>(
                `[data-day-index="${next}"]`,
              )?.focus({ preventScroll: true });
              el.querySelector<HTMLButtonElement>(
                `[data-day-index="${next}"]`,
              )?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }),
          ]}
        >
          {/* El nombre HTML evita que el diff de Qwik2 beta borre tabindex al actualizarlo. */}
          {cells.map((cell) =>
            cell.index > lastIndex ? (
              <span key={cell.date} aria-hidden="true" class="size-6" />
            ) : (
              <button
                key={cell.date}
                type="button"
                data-day-index={cell.index}
                {...{ tabindex: activeIndex.value === cell.index ? 0 : -1 }}
                aria-pressed={selected.value === cell.date}
                aria-controls={detailId}
                aria-label={translate(
                  locale,
                  "{{date}}: {{count}} publicaciones",
                  { date: cell.date, count: cell.count },
                )}
                class={[
                  "size-6 shrink-0 rounded border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                  cell.count === 0
                    ? INTENSITY.none
                    : cell.count < 3
                      ? INTENSITY.some
                      : INTENSITY.many,
                  selected.value === cell.date
                    ? "ring-2 ring-brand-600 ring-offset-1 ring-offset-surface"
                    : "",
                ]}
                onFocus$={() => selectDay(cell.index)}
                onClick$={() => {
                  selectDay(cell.index);
                  triggerHapticFeedback("light");
                  playCivicSound("click");
                }}
              />
            ),
          )}
        </div>
      </div>
      {/* Las celdas no decían qué significa cada tono. La leyenda es sólo
          visual: cada día ya anuncia su número en el nombre accesible. */}
      <div
        aria-hidden="true"
        class="mt-1 flex flex-wrap items-center justify-end gap-1.5 text-2xs text-ink-faint"
      >
        <span>{translate(locale, "Menos")}</span>
        <span class={["size-3 rounded-sm border", INTENSITY.none]} />
        <span class={["size-3 rounded-sm border", INTENSITY.some]} />
        <span class={["size-3 rounded-sm border", INTENSITY.many]} />
        <span>{translate(locale, "Más")}</span>
      </div>
      <label
        class="mt-3 block text-sm font-medium"
        for={`activity-date-${instanceId}`}
      >
        {translate(locale, "Elegí un día")}
      </label>
      <input
        id={`activity-date-${instanceId}`}
        type="date"
        min={firstDay}
        max={today}
        value={selected.value}
        aria-controls={detailId}
        class="mt-1 min-h-11 max-w-full rounded-xl border border-control bg-surface px-3 text-sm"
        onInput$={(_, el) => {
          const index = cells.findIndex(
            (cell) => cell.date === el.value && cell.index <= lastIndex,
          );
          if (index >= 0) selectDay(index);
        }}
      />
      <section
        id={detailId}
        aria-label={translate(locale, "Publicaciones del día elegido")}
        class="mt-4 border-t border-subtle pt-3"
      >
        <p role="status" aria-live="polite" class="text-sm font-medium">
          {translate(locale, "{{date}}: {{count}} publicaciones", {
            date: selected.value,
            count: selectedItems.length,
          })}
        </p>
        {selectedItems.length === 0 ? (
          <p class="mt-2 text-sm text-ink-muted">
            {translate(
              locale,
              "No hay publicaciones de ese día entre las mostradas en este perfil.",
            )}
          </p>
        ) : (
          <ul class="mt-2 space-y-1">
            {selectedItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={contentHref(item.kind, item.id)}
                  class="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-brand hover:bg-muted hover:underline"
                >
                  <Icon
                    name={CONTENT_KINDS[item.kind].icon}
                    class={CONTENT_KIND_TONES[item.kind].text}
                  />
                  <bdi dir="auto">{item.title}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
});
