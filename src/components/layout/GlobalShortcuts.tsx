import { $, component$, sync$, useOnDocument, useSignal } from "@qwik.dev/core";
import { useNavigate } from "@qwik.dev/router";
import { Modal } from "~/components/ui";
import { isSingleKeyShortcutsOn } from "~/lib/accessibility-preferences";
import { translate, useLocale } from "~/lib/i18n";

type ShortcutEvent = Pick<
  KeyboardEvent,
  | "key"
  | "keyCode"
  | "shiftKey"
  | "ctrlKey"
  | "metaKey"
  | "altKey"
  | "defaultPrevented"
  | "isComposing"
>;

export function globalShortcut(
  event: ShortcutEvent,
  editing: boolean,
  dialogOpen: boolean,
): "search" | "help" | "home" | "explore" | null {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    editing ||
    dialogOpen
  )
    return null;
  if (event.key === "?" || (event.shiftKey && event.key === "/")) return "help";
  if (event.key === "/") return "search";
  if (event.key.toLowerCase() === "h") return "home";
  if (event.key.toLowerCase() === "e") return "explore";
  return null;
}

export const GlobalShortcuts = component$(() => {
  const locale = useLocale();
  const nav = useNavigate();
  const isHelpOpen = useSignal(false);

  // Enfocar y cancelar / deben ocurrir en el mismo evento. El guard síncrono
  // ya está en el HTML y no depende de que haya terminado de cargar un efecto.
  useOnDocument(
    "keydown",
    sync$((e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.keyCode === 229 ||
        e.key !== "/" ||
        e.shiftKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      // `sync$` no puede importar: el literal es `A11Y_STORAGE_KEYS.shortcuts`
      // (ver `accessibility-preferences.ts`). Apagados desde el panel, ni
      // siquiera `/` cambia el foco.
      try {
        if (localStorage.getItem("agorbis_a11y_shortcuts") === "false") return;
      } catch {
        // Sin almacenamiento, los atajos siguen con su valor predeterminado.
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active && (active as HTMLElement).isContentEditable)
      )
        return;
      if (document.querySelector("dialog[open]")) return;
      // La primera instancia desktop queda oculta en móvil: se busca sólo
      // entre controles visibles y se respeta el teclado del diálogo abierto.
      const input = Array.from(
        document.querySelectorAll<HTMLInputElement>(
          'input[type="search"], input[name="q"], #buscador',
        ),
      ).find(
        (candidate) =>
          !candidate.disabled && candidate.getClientRects().length > 0,
      );
      if (input) {
        e.preventDefault();
        input.focus();
      }
    }),
  );

  useOnDocument(
    "keydown",
    $((e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        activeEl instanceof HTMLSelectElement ||
        !!(activeEl && (activeEl as HTMLElement).isContentEditable);

      if (e.key === "Escape") {
        if (isHelpOpen.value) {
          isHelpOpen.value = false;
        }
        return;
      }

      // Apagados desde el panel de accesibilidad (WCAG 2.1.4): Escape sigue
      // cerrando la ayuda, el resto no navega.
      if (!isSingleKeyShortcutsOn()) return;
      const shortcut = globalShortcut(
        e,
        isInput,
        !!document.querySelector("dialog[open]"),
      );
      if (shortcut === "search") {
        // Si había un buscador visible, el guard ya lo enfocó y canceló el
        // evento. Sin él se conserva el acceso a la página de búsqueda.
        nav("/buscar");
        return;
      }

      if (shortcut === "help") {
        isHelpOpen.value = !isHelpOpen.value;
        return;
      }

      if (shortcut === "home") {
        nav("/inicio");
        return;
      }

      if (shortcut === "explore") {
        nav("/explorar");
        return;
      }
    }),
  );

  return (
    <div class="contents">
      {isHelpOpen.value && (
        <Modal
          open={isHelpOpen.value}
          onClose$={() => {
            isHelpOpen.value = false;
          }}
          title={translate(locale, "Atajos de teclado rápidos")}
        >
          <div class="space-y-4">
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Agorbis cuenta con atajos globales para navegar rápidamente por tu comunidad y reclamos sin levantar las manos del teclado:",
              )}
            </p>

            <ul class="divide-y divide-[var(--border-subtle)] text-sm">
              <li class="flex items-center justify-between py-2.5">
                <span class="text-ink-strong font-medium">
                  {translate(locale, "Buscar reclamos o comunidades")}
                </span>
                <kbd class="rounded-lg border border-subtle bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-ink-strong shadow-xs">
                  /
                </kbd>
              </li>
              <li class="flex items-center justify-between py-2.5">
                <span class="text-ink-strong font-medium">
                  {translate(locale, "Ver esta ayuda de atajos")}
                </span>
                <kbd class="rounded-lg border border-subtle bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-ink-strong shadow-xs">
                  ?
                </kbd>
              </li>
              <li class="flex items-center justify-between py-2.5">
                <span class="text-ink-strong font-medium">
                  {translate(locale, "Cerrar modales o búsquedas")}
                </span>
                <kbd class="rounded-lg border border-subtle bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-ink-strong shadow-xs">
                  {"Esc"}
                </kbd>
              </li>
              <li class="flex items-center justify-between py-2.5">
                <span class="text-ink-strong font-medium">
                  {translate(locale, "Ir a Mi Inicio vecinal")}
                </span>
                <kbd class="rounded-lg border border-subtle bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-ink-strong shadow-xs">
                  {"H"}
                </kbd>
              </li>
              <li class="flex items-center justify-between py-2.5">
                <span class="text-ink-strong font-medium">
                  {translate(locale, "Explorar mapa y comunidades")}
                </span>
                <kbd class="rounded-lg border border-subtle bg-muted px-2.5 py-1 font-mono text-xs font-semibold text-ink-strong shadow-xs">
                  {"E"}
                </kbd>
              </li>
            </ul>

            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Podés apagar los atajos de una sola tecla desde el panel de accesibilidad, al pie de la página.",
              )}
            </p>

            <div class="pt-2 text-right">
              <button
                type="button"
                onClick$={() => {
                  isHelpOpen.value = false;
                }}
                class="min-h-[44px] cursor-pointer rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                {translate(locale, "Entendido")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
});
