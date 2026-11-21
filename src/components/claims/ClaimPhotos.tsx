import {
  $,
  component$,
  sync$,
  useSignal,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Icon, cx, triggerHapticFeedback } from "~/components/ui";
import { safeClaimMediaUrl } from "~/lib/claim-media";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Las fotos de un reclamo, ampliables.
 *
 * Se dibujaban con `aspect-video object-cover`: una foto vertical —la mayoría,
 * porque se sacan con el teléfono en la mano— salía cortada arriba y abajo, y
 * no había forma de verla entera. En un reclamo la foto **es** la evidencia:
 * es lo que convierte "la vereda está rota" en algo difícil de ignorar, y
 * recortarla sin salida le saca justamente eso.
 *
 * La miniatura sigue recortada a propósito, porque una grilla con fotos de
 * proporciones mezcladas se vuelve ilegible; lo que cambia es que ahora se
 * puede abrir.
 *
 * Usa `<dialog>` nativo y no un div flotante: el navegador ya resuelve el
 * modal —foco atrapado adentro, Escape que cierra, resto de la página inerte—
 * y reimplementar eso a mano es de donde salen los diálogos que no se pueden
 * cerrar con teclado.
 */
export const ClaimPhotos = component$<{
  urls: string[];
  claimTitle: string;
}>(({ urls, claimTitle }) => {
  const safeUrls = urls.flatMap((url) => {
    const safe = safeClaimMediaUrl(url);
    return safe ? [safe] : [];
  });
  if (safeUrls.length === 0) return null;
  return <PhotoGallery urls={safeUrls} claimTitle={claimTitle} />;
});

const PhotoGallery = component$<{
  urls: string[];
  claimTitle: string;
}>(({ urls, claimTitle }) => {
  const locale = useLocale();
  /** Índice de la foto abierta, o `-1` si el diálogo está cerrado. */
  const opened = useSignal(-1);
  const isZoomed = useSignal(false);
  const dialog = useSignal<HTMLDialogElement>();
  const touchStartX = useSignal(0);
  const pinchDist = useSignal(0);
  const lastTapTime = useSignal(0);

  // eslint-disable-next-line qwik/no-use-visible-task -- `showModal()` sólo existe en el DOM real
  useVisibleTask$(({ track }) => {
    const index = track(() => opened.value);
    const el = dialog.value;
    if (!el) return;
    if (index >= 0 && !el.open) {
      isZoomed.value = false;
      el.showModal();
    }
    if (index < 0 && el.open) {
      isZoomed.value = false;
      el.close();
    }
  });

  const current = opened.value >= 0 ? urls[opened.value] : null;

  const step = $((delta: number) => {
    if (opened.value < 0 || urls.length < 2) return;
    triggerHapticFeedback("selection");
    isZoomed.value = false;
    opened.value = (opened.value + delta + urls.length) % urls.length;
  });

  const toggleZoom = $(() => {
    triggerHapticFeedback(isZoomed.value ? "light" : "medium");
    isZoomed.value = !isZoomed.value;
  });

  return (
    <>
      <ul class="mt-6 grid gap-3 sm:grid-cols-2">
        {urls.map((url, index) => (
          <li key={url}>
            <a
              href={url}
              class="group relative block w-full overflow-hidden rounded-2xl border border-subtle transition-all duration-200 hover:shadow-md active:scale-[0.99] touch-manipulation"
              onClick$={[
                sync$((event: MouseEvent) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    typeof HTMLDialogElement !== "undefined" &&
                    typeof HTMLDialogElement.prototype.showModal === "function"
                  )
                    event.preventDefault();
                }),
                $((event: MouseEvent) => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey &&
                    typeof dialog.value?.showModal === "function"
                  )
                    opened.value = index;
                }),
              ]}
            >
              <img
                src={url}
                alt={translate(
                  locale,
                  "Imagen {{number}} del reclamo: {{title}}",
                  {
                    number: index + 1,
                    title: claimTitle,
                  },
                )}
                width={1200}
                height={800}
                loading="lazy"
                decoding="async"
                // Sin zoom al pasar el mouse (D124): la miniatura ya responde
                // con la sombra del enlace y el rótulo que se oscurece.
                class="aspect-video w-full object-cover"
              />
              {/* `span` y no `div`: dentro de un enlace va sólo contenido de
                  frase. La lupa es un ícono propio (D126). */}
              <span class="pointer-events-none absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-semibold text-white shadow-xs backdrop-blur-sm transition-all group-hover:bg-black/75">
                <Icon name="search" />
                <span>{translate(locale, "Tocar para ampliar")}</span>
              </span>
              <span class="sr-only">
                {urls.length > 1
                  ? translate(
                      locale,
                      "Ampliar imagen {{current}} de {{total}}",
                      {
                        current: index + 1,
                        total: urls.length,
                      },
                    )
                  : translate(locale, "Ampliar imagen")}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        aria-label={translate(locale, "Imágenes del reclamo: {{title}}", {
          title: claimTitle,
        })}
        onClose$={() => (opened.value = -1)}
        onClick$={(event, el) => {
          if (event.target === el) opened.value = -1;
        }}
        onKeyDown$={(event) => {
          if (event.key === "ArrowRight") step(1);
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "Escape") opened.value = -1;
        }}
        onTouchStart$={(event) => {
          if (event.touches.length === 2) {
            pinchDist.value = Math.hypot(
              event.touches[0].clientX - event.touches[1].clientX,
              event.touches[0].clientY - event.touches[1].clientY,
            );
          } else if (event.touches.length === 1) {
            const now = Date.now();
            if (now - lastTapTime.value < 300) {
              toggleZoom();
              lastTapTime.value = 0;
            } else {
              lastTapTime.value = now;
            }
            touchStartX.value = event.touches[0].clientX;
          }
        }}
        onTouchMove$={(event) => {
          if (event.touches.length === 2 && pinchDist.value > 0) {
            const currentDist = Math.hypot(
              event.touches[0].clientX - event.touches[1].clientX,
              event.touches[0].clientY - event.touches[1].clientY,
            );
            if (currentDist > pinchDist.value + 30 && !isZoomed.value) {
              isZoomed.value = true;
              triggerHapticFeedback("medium");
            } else if (currentDist < pinchDist.value - 30 && isZoomed.value) {
              isZoomed.value = false;
              triggerHapticFeedback("light");
            }
          }
        }}
        onTouchEnd$={(event) => {
          pinchDist.value = 0;
          if (!isZoomed.value && event.changedTouches[0]) {
            const deltaX = event.changedTouches[0].clientX - touchStartX.value;
            if (Math.abs(deltaX) > 40) {
              if (deltaX < 0) {
                step(1);
              } else {
                step(-1);
              }
            }
          }
        }}
        class="max-h-[95dvh] max-w-[95vw] rounded-3xl bg-transparent p-0 shadow-2xl backdrop:bg-black/90 backdrop:backdrop-blur-md"
      >
        {current && (
          <figure class="relative flex flex-col items-center gap-3 p-3">
            {/* Barra superior de control del Lightbox */}
            <div class="flex w-full items-center justify-between gap-3 text-white">
              <div class="flex items-center gap-2">
                <span class="rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tabular-nums backdrop-blur-md">
                  {translate(locale, "{{current}} de {{total}}", {
                    current: opened.value + 1,
                    total: urls.length,
                  })}
                </span>
                <button
                  type="button"
                  onClick$={toggleZoom}
                  class="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold backdrop-blur-md transition hover:bg-black/80 active:scale-95"
                >
                  <Icon name="search" />
                  <span>
                    {isZoomed.value
                      ? translate(locale, "Alejar")
                      : translate(locale, "Acercar")}
                  </span>
                </button>
              </div>

              <button
                type="button"
                aria-label={translate(locale, "Cerrar")}
                class="grid size-9 place-items-center rounded-full bg-black/60 text-base font-bold text-white backdrop-blur-md transition hover:bg-black/80 active:scale-95"
                onClick$={() => (opened.value = -1)}
              >
                <Icon name="x" />
              </button>
            </div>

            {/* Contenedor de imagen ampliable */}
            <div class="relative max-h-[78dvh] w-full overflow-auto rounded-2xl text-center">
              {/* eslint-disable-next-line qwik/jsx-img -- el viewport fija la caja */}
              <img
                src={current}
                alt={translate(
                  locale,
                  "Imagen {{number}} del reclamo: {{title}}",
                  {
                    number: opened.value + 1,
                    title: claimTitle,
                  },
                )}
                onClick$={toggleZoom}
                class={cx(
                  "mx-auto max-h-[76dvh] w-auto max-w-full rounded-2xl object-contain shadow-lift transition-transform duration-200",
                  // La escala queda sólo para el estado ampliado; al pasar el
                  // mouse alcanza con el cursor de lupa (D124).
                  isZoomed.value
                    ? "scale-150 cursor-zoom-out"
                    : "cursor-zoom-in",
                )}
              />
            </div>

            <figcaption class="flex flex-wrap items-center justify-center gap-3 pb-2 pt-1">
              {urls.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label={translate(locale, "Imagen anterior")}
                    class="touch-target min-h-12 min-w-12 rounded-2xl bg-white/25 px-4 text-xl font-bold text-white backdrop-blur-md transition hover:bg-white/35 active:scale-95 touch-manipulation"
                    onClick$={() => step(-1)}
                  >
                    <Icon name="arrow-right" class="rotate-180" />
                  </button>
                  <span class="rounded-full bg-black/50 px-3.5 py-1.5 text-xs font-semibold tabular-nums text-white/95 backdrop-blur-md">
                    {translate(locale, "{{current}} de {{total}}", {
                      current: opened.value + 1,
                      total: urls.length,
                    })}
                  </span>
                  <button
                    type="button"
                    aria-label={translate(locale, "Imagen siguiente")}
                    class="touch-target min-h-12 min-w-12 rounded-2xl bg-white/25 px-4 text-xl font-bold text-white backdrop-blur-md transition hover:bg-white/35 active:scale-95 touch-manipulation"
                    onClick$={() => step(1)}
                  >
                    <Icon name="arrow-right" />
                  </button>
                </>
              )}
              <button
                type="button"
                class={cx(
                  "touch-target min-h-12 rounded-2xl bg-white/25 px-6 text-sm font-semibold text-white backdrop-blur-md transition touch-manipulation",
                  "hover:bg-white/35 active:scale-95",
                )}
                onClick$={() => (opened.value = -1)}
              >
                {translate(locale, "Cerrar")}
              </button>
            </figcaption>
          </figure>
        )}
      </dialog>
    </>
  );
});
