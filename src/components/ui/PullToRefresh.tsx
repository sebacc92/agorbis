import { $, component$, Slot, useSignal, type QRL } from "@qwik.dev/core";
import { triggerHapticFeedback } from "~/lib/haptics";
import { cx } from "./cx";

const PULL_THRESHOLD = 65;

export const PullToRefresh = component$<{
  onRefresh$?: QRL<() => Promise<void> | void>;
}>(({ onRefresh$ }) => {
  const pullY = useSignal(0);
  const isRefreshing = useSignal(false);
  const startY = useSignal(0);
  const isPulling = useSignal(false);
  const thresholdReached = useSignal(false);

  const handleTouchStart = $((e: TouchEvent) => {
    if (window.scrollY <= 2 && !isRefreshing.value) {
      startY.value = e.touches[0]?.clientY ?? 0;
      isPulling.value = true;
      thresholdReached.value = false;
    }
  });

  const handleTouchMove = $((e: TouchEvent) => {
    if (!isPulling.value || isRefreshing.value) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const diff = currentY - startY.value;

    if (diff > 0 && window.scrollY <= 2) {
      // Resistencia elástica tipo rubber-band
      const dampened = Math.min(90, Math.pow(diff, 0.82));
      pullY.value = dampened;

      if (dampened >= PULL_THRESHOLD && !thresholdReached.value) {
        thresholdReached.value = true;
        triggerHapticFeedback("medium");
      } else if (dampened < PULL_THRESHOLD && thresholdReached.value) {
        thresholdReached.value = false;
      }
    } else {
      pullY.value = 0;
      isPulling.value = false;
    }
  });

  const handleTouchEnd = $(async () => {
    if (!isPulling.value || isRefreshing.value) return;
    isPulling.value = false;

    if (pullY.value >= PULL_THRESHOLD) {
      isRefreshing.value = true;
      pullY.value = 45;
      triggerHapticFeedback("success");

      try {
        if (onRefresh$) {
          await onRefresh$();
        } else {
          window.location.reload();
        }
      } finally {
        setTimeout(() => {
          isRefreshing.value = false;
          pullY.value = 0;
          thresholdReached.value = false;
        }, 600);
      }
    } else {
      pullY.value = 0;
      thresholdReached.value = false;
    }
  });

  return (
    <div
      onTouchStart$={handleTouchStart}
      onTouchMove$={handleTouchMove}
      onTouchEnd$={handleTouchEnd}
      class="relative"
    >
      {/* Indicador de pull-to-refresh */}
      <div
        class="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-center overflow-hidden transition-all duration-150"
        style={{
          height: `${pullY.value}px`,
          opacity: pullY.value > 10 ? 1 : 0,
        }}
        aria-hidden="true"
      >
        <div
          class={cx(
            "flex size-9 items-center justify-center rounded-full border border-subtle bg-surface/95 backdrop-blur-md shadow-lift transition-all duration-200",
            thresholdReached.value
              ? "scale-110 border-brand-500 text-brand ring-4 ring-brand-500/20"
              : "text-ink-muted",
          )}
        >
          {isRefreshing.value ? (
            <svg
              class="size-4 animate-spin text-brand"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="3"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <span
              class="text-xs transition-transform duration-200"
              style={{
                transform: `rotate(${Math.min(180, (pullY.value / PULL_THRESHOLD) * 180)}deg)`,
              }}
            >
              ↓
            </span>
          )}
        </div>
      </div>

      {/* Contenido con desplazamiento elástico */}
      <div
        style={{
          transform:
            pullY.value > 0
              ? `translate3d(0, ${pullY.value * 0.4}px, 0)`
              : undefined,
          transition: isPulling.value
            ? "none"
            : "transform 250ms cubic-bezier(0, 0, 0.2, 1)",
        }}
      >
        <Slot />
      </div>
    </div>
  );
});
