import {
  $,
  component$,
  sync$,
  useId,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import { triggerHapticFeedback } from "~/lib/haptics";
import { cx } from "./cx";
import { playCivicSound } from "~/lib/audio-feedback";
import { useLocale, translate } from "~/lib/i18n";
import { focusWhenRendered } from "~/lib/focus-when-rendered";
import { calendarDates, escapeCalendarText } from "~/lib/calendar";

export interface CivicCalendarButtonProps {
  title: string;
  description: string;
  endDate: string;
  allDay?: boolean;
  tentative?: boolean;
  location?: string;
  class?: string;
}

export const CivicCalendarButton = component$<CivicCalendarButtonProps>(
  ({
    title,
    description,
    endDate,
    allDay = false,
    tentative = false,
    location,
    class: className,
  }) => {
    const locale = useLocale();
    const isOpen = useSignal(false);
    const focusLast = useSignal(false);
    const trigger = useSignal<HTMLButtonElement>();
    const menu = useSignal<HTMLDivElement>();
    const instanceId = useId();
    const triggerId = `calendar-trigger-${instanceId}`;
    const menuId = `calendar-menu-${instanceId}`;

    // eslint-disable-next-line qwik/no-use-visible-task -- el menú debe estar montado antes de enfocar una opción
    useVisibleTask$(
      ({ track, cleanup }) => {
        if (!track(() => isOpen.value)) return;
        // El menú se dibuja por primera vez en el cliente: puede llegar un
        // frame después (o más, si hay que bajar su chunk). Se reintenta hasta
        // que exista, en vez de enfocar una sola vez y perder el foco.
        cleanup(
          focusWhenRendered(() => {
            const items =
              menu.value?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              );
            return items?.[focusLast.value ? items.length - 1 : 0];
          }),
        );
      },
      { strategy: "document-ready" },
    );

    const close = $(() => {
      isOpen.value = false;
      trigger.value?.focus({ preventScroll: true });
    });

    const addToGoogleCalendar$ = $(() => {
      triggerHapticFeedback("selection");
      playCivicSound("click");
      close();
      const dates = calendarDates(endDate, allDay);
      if (!dates) return;

      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${dates.start}/${dates.end}&details=${encodeURIComponent(description)}${location ? `&location=${encodeURIComponent(location)}` : ""}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    const downloadIcs$ = $(() => {
      triggerHapticFeedback("selection");
      playCivicSound("celebrate");
      close();
      const dates = calendarDates(endDate, allDay);
      if (!dates) return;
      const dtStamp = calendarDates(new Date().toISOString())!.end;

      const icsLines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Agorbis//Civic Calendar//ES",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${Date.now()}@agorbis.org`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART${allDay ? ";VALUE=DATE" : ""}:${dates.start}`,
        `DTEND${allDay ? ";VALUE=DATE" : ""}:${dates.end}`,
        `SUMMARY:${escapeCalendarText(title)}`,
        `DESCRIPTION:${escapeCalendarText(description)}`,
        location ? `LOCATION:${escapeCalendarText(location)}` : "",
        tentative ? "STATUS:TENTATIVE" : "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
      ]
        .filter(Boolean)
        .join("\r\n");

      const blob = new Blob([icsLines], {
        type: "text/calendar;charset=utf-8",
      });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `evento-civico-${Date.now()}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    });

    if (!calendarDates(endDate, allDay)) return null;

    return (
      <div
        class={cx("relative inline-block text-left", className)}
        onFocusOut$={(event, el) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !el.contains(event.relatedTarget)
          ) {
            isOpen.value = false;
          }
        }}
      >
        <button
          ref={trigger}
          id={triggerId}
          type="button"
          onClick$={() => {
            triggerHapticFeedback("selection");
            playCivicSound("toggle");
            if (isOpen.value) close();
            else {
              focusLast.value = false;
              isOpen.value = true;
            }
          }}
          onKeyDown$={[
            sync$((event: KeyboardEvent) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp")
                event.preventDefault();
            }),
            $((event: KeyboardEvent) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              focusLast.value = event.key === "ArrowUp";
              isOpen.value = true;
            }),
          ]}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-subtle bg-surface px-2.5 py-1 text-xs font-semibold text-ink-muted shadow-2xs transition-all hover:border-brand-500 hover:text-ink-strong active:scale-95 touch-manipulation"
          aria-expanded={isOpen.value}
          aria-haspopup="menu"
          aria-controls={isOpen.value ? menuId : undefined}
          title={translate(locale, "Agregar recordatorio al calendario")}
        >
          <span aria-hidden="true">📅</span>
          <span>{translate(locale, "Agendar")}</span>
        </button>

        {isOpen.value && (
          <>
            <div
              class="fixed inset-0 z-40"
              onClick$={close}
              aria-hidden="true"
            />
            <div
              ref={menu}
              id={menuId}
              role="menu"
              aria-labelledby={triggerId}
              onKeyDown$={[
                sync$((event: KeyboardEvent) => {
                  if (
                    ["ArrowDown", "ArrowUp", "Home", "End", "Escape"].includes(
                      event.key,
                    )
                  )
                    event.preventDefault();
                }),
                $((event: KeyboardEvent, el: HTMLDivElement) => {
                  if (event.key === "Tab") {
                    // Tab conserva su recorrido nativo; se retira el menú
                    // después de que el navegador haya movido el foco.
                    requestAnimationFrame(() => (isOpen.value = false));
                    return;
                  }
                  if (event.key === "Escape") {
                    close();
                    return;
                  }
                  const items = Array.from(
                    el.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
                  );
                  const current = items.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  let next: number;
                  if (event.key === "ArrowDown")
                    next = (current + 1) % items.length;
                  else if (event.key === "ArrowUp")
                    next = (current - 1 + items.length) % items.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = items.length - 1;
                  else return;
                  items[next]?.focus();
                }),
              ]}
              class="absolute right-0 z-50 mt-1.5 w-56 animate-scale-pop rounded-2xl border border-subtle bg-surface/95 p-1.5 shadow-lift ring-1 ring-black/5 backdrop-blur-md dark:ring-white/10"
            >
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick$={addToGoogleCalendar$}
                class="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink-strong transition-all duration-150 hover:bg-muted hover:-translate-y-0.5 hover:shadow-2xs active:scale-[0.98] touch-manipulation"
              >
                <span aria-hidden="true">🌐</span>
                <span>{translate(locale, "Google Calendar")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick$={downloadIcs$}
                class="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium text-ink-strong transition-all duration-150 hover:bg-muted hover:-translate-y-0.5 hover:shadow-2xs active:scale-[0.98] touch-manipulation"
              >
                <span aria-hidden="true">📥</span>
                <span>
                  {translate(locale, "Descargar .ics (Apple / Outlook)")}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  },
);
