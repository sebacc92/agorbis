import {
  $,
  component$,
  useOnDocument,
  useOnWindow,
  useSignal,
} from "@qwik.dev/core";
import { triggerHapticFeedback } from "~/components/ui";
import { useLocale, translate } from "~/lib/i18n";
import {
  THEME_CHANGED_EVENT,
  toggleColorScheme,
  type ThemeChangedDetail,
} from "~/lib/theme";

/**
 * Alterna claro/oscuro y guarda la preferencia con animación morfológica y háptica.
 * El estado inicial lo pone el script de `root.tsx`; acá sólo lo leemos del DOM
 * cuando el componente se activa, para que el ícono coincida con lo que se está viendo.
 */
export const ThemeToggle = component$(() => {
  const isDark = useSignal(false);
  const locale = useLocale();

  useOnDocument(
    "qinit",
    $(() => {
      isDark.value = document.documentElement.classList.contains("dark");
    }),
  );

  // El tema también se cambia desde la paleta de comandos: sin esto el ícono y
  // `aria-pressed` quedaban mostrando el tema anterior.
  useOnWindow(
    THEME_CHANGED_EVENT,
    $((event: Event) => {
      const detail = (event as CustomEvent<ThemeChangedDetail>).detail;
      isDark.value =
        typeof detail?.dark === "boolean"
          ? detail.dark
          : document.documentElement.classList.contains("dark");
    }),
  );

  return (
    <button
      type="button"
      class="group relative flex size-11 items-center justify-center overflow-hidden rounded-2xl text-ink-muted transition-all duration-200 hover:bg-muted hover:text-ink-strong active:scale-90 sm:size-9"
      // Etiqueta fija + `aria-pressed`: "Cambiar a modo claro, presionado"
      // decía dos cosas a la vez.
      aria-label={translate(locale, "Modo oscuro")}
      aria-pressed={isDark.value}
      onClick$={() => {
        triggerHapticFeedback("selection");
        // La barra del navegador acompaña al cambio en el momento, sin recarga.
        isDark.value = toggleColorScheme();
      }}
    >
      {/* Ícono de Sol (Modo Oscuro -> Pasar a Claro) */}
      <span
        aria-hidden="true"
        class={`absolute grid place-items-center transition-all duration-300 ease-out ${
          isDark.value
            ? "rotate-0 scale-100 opacity-100"
            : "-rotate-90 scale-50 opacity-0 pointer-events-none"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5 transition-transform duration-300 group-hover:rotate-45"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <circle cx="12" cy="12" r="4" />
          <path
            stroke-linecap="round"
            d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
          />
        </svg>
      </span>

      {/* Ícono de Luna (Modo Claro -> Pasar a Oscuro) */}
      <span
        aria-hidden="true"
        class={`absolute grid place-items-center transition-all duration-300 ease-out ${
          isDark.value
            ? "rotate-90 scale-50 opacity-0 pointer-events-none"
            : "rotate-0 scale-100 opacity-100"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          class="size-5 transition-transform duration-300 group-hover:-rotate-12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M20.4 14.2A8.4 8.4 0 019.8 3.6a8.4 8.4 0 1010.6 10.6z"
          />
        </svg>
      </span>
    </button>
  );
});
