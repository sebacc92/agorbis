import { $, component$, useSignal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Badge, Card, Icon, cx, triggerHapticFeedback } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { showToast } from "~/components/ui/Toast";
import { routes } from "~/lib/community";
import { CLAIM_CATEGORIES, CLAIM_STATUS_LABEL } from "~/lib/constants";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import type { ClaimCategory } from "~/lib/database.types.helpers";
import { pluralize } from "~/lib/format";
import { clockBadge, responseClock } from "~/lib/claim-escalation";
import { safeClaimMediaUrl } from "~/lib/claim-media";
import { useLocale, translate } from "~/lib/i18n";

export interface ClaimCardData {
  id: string;
  title: string;
  description: string;
  category: ClaimCategory;
  status: string;
  image_url: string | null;
  support_count: number;
  created_at: string;
  /** Reloj de respuesta (D58). Opcional: no todos los listados lo cargan. */
  response_due_at?: string | null;
  first_response_at?: string | null;
  escalated_at?: string | null;
}

export const ClaimCard = component$<{ claim: ClaimCardData }>(({ claim }) => {
  const locale = useLocale();
  const category = CLAIM_CATEGORIES.find((c) => c.key === claim.category);
  const status = CLAIM_STATUS_LABEL[claim.status];
  const isResolved = claim.status === "resolved";
  const imageUrl = safeClaimMediaUrl(claim.image_url);

  // Gesto táctil horizontal en móvil: deslizar a derecha para abrir, a izquierda para compartir
  const translateX = useSignal(0);
  const isDragging = useSignal(false);
  const touchStartX = useSignal(0);
  const touchStartY = useSignal(0);
  const isHorizontalSwipe = useSignal<boolean | null>(null);

  const handleTouchStart = $((e: TouchEvent) => {
    if (!e.touches[0]) return;
    touchStartX.value = e.touches[0].clientX;
    touchStartY.value = e.touches[0].clientY;
    isHorizontalSwipe.value = null;
    isDragging.value = true;
  });

  const handleTouchMove = $((e: TouchEvent) => {
    if (!e.touches[0] || !isDragging.value) return;
    const diffX = e.touches[0].clientX - touchStartX.value;
    const diffY = e.touches[0].clientY - touchStartY.value;

    if (isHorizontalSwipe.value === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalSwipe.value = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    if (isHorizontalSwipe.value === true) {
      const dampened =
        Math.sign(diffX) * Math.min(84, Math.pow(Math.abs(diffX), 0.82) * 2);
      translateX.value = dampened;
    }
  });

  const handleTouchEnd = $(async () => {
    isDragging.value = false;
    const current = translateX.value;
    translateX.value = 0;
    isHorizontalSwipe.value = null;

    if (current > 65) {
      triggerHapticFeedback("medium");
      window.location.href = routes.claim(claim.id);
    } else if (current < -65) {
      triggerHapticFeedback("medium");
      const url = window.location.origin + routes.claim(claim.id);
      if (navigator.share) {
        try {
          await navigator.share({ title: claim.title, url });
          triggerHapticFeedback("success");
          showToast(translate(locale, "¡Gracias por compartir!"), "success");
        } catch (error) {
          // Cerrar la hoja del sistema es una decisión, no un fallo.
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "AbortError"
          )
            return;
          triggerHapticFeedback("warning");
          showToast(
            translate(
              locale,
              "No pudimos compartir el reclamo. Abrilo para volver a intentarlo.",
            ),
            "danger",
          );
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
          triggerHapticFeedback("success");
          showToast(
            translate(locale, "Enlace copiado al portapapeles"),
            "success",
          );
        } catch {
          triggerHapticFeedback("warning");
          showToast(translate(locale, "No se pudo copiar el enlace"), "danger");
        }
      }
    }
  });

  // Sólo se dibuja si el listado trajo las columnas del reloj.
  const clock =
    claim.response_due_at === undefined
      ? null
      : clockBadge(
          responseClock({
            response_due_at: claim.response_due_at ?? null,
            first_response_at: claim.first_response_at ?? null,
            escalated_at: claim.escalated_at ?? null,
            status: claim.status,
          }),
          locale,
        );

  return (
    <div class="relative overflow-hidden rounded-2xl">
      {/* Indicadores visuales durante el deslizamiento en móvil */}
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 flex items-center justify-between rounded-2xl bg-muted/60 px-5 text-xs font-semibold"
      >
        <div
          class={cx(
            "flex items-center gap-1.5 text-brand-600 transition-opacity duration-150 dark:text-brand-400",
            translateX.value > 20 ? "opacity-100" : "opacity-0",
          )}
        >
          <Icon name="arrow-right" />
          <span>{translate(locale, "Ver el reclamo")}</span>
        </div>
        <div
          class={cx(
            "flex items-center gap-1.5 text-accent-600 transition-opacity duration-150 dark:text-accent-400",
            translateX.value < -20 ? "opacity-100" : "opacity-0",
          )}
        >
          <span>{translate(locale, "Compartir")}</span>
          <Icon name="globe" />
        </div>
      </div>

      <div
        style={{
          transform: `translateX(${translateX.value}px)`,
          transition: isDragging.value ? "none" : "transform 0.22s ease-out",
        }}
        onTouchStart$={handleTouchStart}
        onTouchMove$={handleTouchMove}
        onTouchEnd$={handleTouchEnd}
        class="h-full"
      >
        {/* Tarjeta plana con la franja del tipo (D123); un reclamo resuelto
            cambia la franja al verde, que es la única celebración que hace
            falta. */}
        <Card
          interactive
          accent={
            isResolved
              ? "border-l-success-500"
              : CONTENT_KIND_TONES.claim.accent
          }
          class="group h-full overflow-hidden"
        >
          <Link
            href={routes.claim(claim.id)}
            class="flex h-full gap-4 rounded-2xl p-5"
          >
            {imageUrl && (
              <div class="size-16 shrink-0 overflow-hidden rounded-2xl sm:size-24">
                <img
                  src={imageUrl}
                  alt=""
                  width={160}
                  height={160}
                  loading="lazy"
                  decoding="async"
                  class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            )}

            <div class="flex min-w-0 flex-1 flex-col">
              {/* Meta en una línea: la categoría con su ícono propio (D125:
                  las categorías son de la app, no de la persona) y la fecha
                  a la derecha. El estado baja al pie para no repetirse con la
                  franja. */}
              <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                {category && (
                  <span class="inline-flex items-center gap-1">
                    <Icon name={category.icon} class="text-sm" />
                    {translate(locale, category.label)}
                  </span>
                )}
                {clock && <Badge tone={clock.tone}>{clock.label}</Badge>}
                <span class="ml-auto text-ink-faint">
                  <RelativeTime value={claim.created_at} />
                </span>
              </div>

              <h3
                dir="auto"
                class="font-display text-display-xs text-ink-strong transition-colors group-hover:text-brand"
              >
                {claim.title}
              </h3>
              <p
                dir="auto"
                class="ugc-text mt-2 line-clamp-2 text-base text-ink-muted"
              >
                {claim.description}
              </p>

              {/* Un solo pie: estado y apoyo a la izquierda, llamada a la
                  derecha (D123). */}
              <div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-4 text-sm">
                <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  {isResolved ? (
                    <span class="inline-flex items-center gap-1 font-medium text-success animate-scale-pop">
                      <Icon name="trophy" />
                      {translate(locale, "Resuelto por la comunidad")}
                    </span>
                  ) : status ? (
                    <Badge
                      tone={
                        status.tone as "warn" | "brand" | "success" | "danger"
                      }
                      pulse={claim.status === "open"}
                    >
                      {translate(locale, status.label)}
                    </Badge>
                  ) : null}
                  <span aria-hidden="true">·</span>
                  <span class="inline-flex items-center gap-1 font-medium">
                    <Icon name="users" />
                    {isResolved
                      ? pluralize(
                          claim.support_count,
                          "vecino apoyó",
                          "vecinos apoyaron",
                          locale,
                        )
                      : claim.support_count === 0
                        ? translate(locale, "Todavía nadie más se sumó")
                        : pluralize(
                            claim.support_count,
                            "persona afectada",
                            "personas afectadas",
                            locale,
                          )}
                  </span>
                </span>
                <span class="inline-flex items-center gap-1 font-medium text-brand">
                  {translate(locale, "Ver el reclamo")}
                  <Icon
                    name="arrow-right"
                    class="transition-transform group-hover:translate-x-1"
                  />
                </span>
              </div>
            </div>
          </Link>
        </Card>
      </div>
    </div>
  );
});
