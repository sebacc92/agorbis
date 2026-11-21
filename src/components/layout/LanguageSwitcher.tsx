import { $, component$, sync$, useOnDocument, useSignal } from "@qwik.dev/core";
import { useLocation } from "@qwik.dev/router";
import {
  useLocale,
  translate,
  localeSwitchHref,
  SUPPORTED_LOCALES,
  type Locale,
} from "~/lib/i18n";
import { Icon } from "~/components/ui";

const LANGUAGE_NAMES: Record<Locale, string> = {
  es: "Español",
  en: "English",
};

export const LanguageSwitcher = component$(() => {
  const locale = useLocale();
  const location = useLocation();
  const details = useSignal<HTMLDetailsElement>();

  // Un `<details>` nativo no se cierra ni con Escape ni al tocar fuera: el
  // desplegable de idiomas quedaba abierto sobre la página mientras el resto
  // de los menús del header ya se habían cerrado. Se le da el mismo
  // comportamiento sin cambiar el elemento, que es lo que lo hace funcionar
  // sin JavaScript.
  useOnDocument(
    "keydown",
    $((event: KeyboardEvent) => {
      if (event.key !== "Escape" || !details.value?.open) return;
      details.value.open = false;
      details.value.querySelector("summary")?.focus();
    }),
  );

  useOnDocument(
    "pointerdown",
    $((event: PointerEvent) => {
      const el = details.value;
      if (!el?.open) return;
      const target = event.target as Node | null;
      if (target && el.contains(target)) return;
      el.open = false;
    }),
  );

  return (
    <details ref={details} class="group relative">
      <summary
        aria-label={`${translate(locale, "Cambiar idioma")}: ${locale.toUpperCase()}`}
        title={translate(locale, "Cambiar idioma")}
        class="flex h-11 cursor-pointer list-none items-center gap-1.5 rounded-2xl border border-subtle bg-surface px-2.5 text-xs font-medium text-ink-muted transition-all duration-150 hover:bg-muted hover:text-ink-strong active:scale-95 sm:h-9 [&::-webkit-details-marker]:hidden touch-manipulation"
      >
        <span aria-hidden="true">🌐</span>
        <span>{locale.toUpperCase()}</span>
        <span
          aria-hidden="true"
          class="inline-flex text-xs transition-transform duration-200 group-open:rotate-180"
        >
          <Icon name="chevron-down" />
        </span>
      </summary>
      <div class="animate-scale-pop absolute right-0 top-full z-50 mt-1.5 min-w-36 rounded-2xl border border-subtle bg-surface/95 backdrop-blur-md p-1.5 shadow-lift">
        {SUPPORTED_LOCALES.map((item) => (
          <a
            key={item}
            href={localeSwitchHref(location.url, item)}
            lang={item}
            aria-current={item === locale ? "true" : undefined}
            onClick$={[
              // Cancelar la navegación nativa tiene que ser síncrono: el
              // manejador de abajo se carga de forma diferida y un
              // `preventDefault()` ahí puede llegar tarde.
              sync$((event: MouseEvent) => {
                if (
                  event.button === 0 &&
                  !event.metaKey &&
                  !event.ctrlKey &&
                  !event.shiftKey &&
                  !event.altKey
                ) {
                  event.preventDefault();
                }
              }),
              $((event: MouseEvent) => {
                // El fragmento no llega al SSR. En una activación normal usamos
                // la URL real del browser para conservarlo; clicks modificados
                // mantienen el comportamiento nativo de abrir otra pestaña.
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                ) {
                  return;
                }
                window.location.assign(
                  localeSwitchHref(new URL(window.location.href), item),
                );
              }),
            ]}
            class="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-ink transition-all active:scale-95 hover:bg-muted aria-[current=true]:bg-muted aria-[current=true]:font-semibold touch-manipulation"
          >
            {LANGUAGE_NAMES[item]}
            {item === locale && (
              <Icon name="check" class="text-sm text-brand" />
            )}
          </a>
        ))}
      </div>
    </details>
  );
});
