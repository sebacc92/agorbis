import {
  $,
  component$,
  sync$,
  useOnDocument,
  useOnWindow,
  useSignal,
  useTask$,
  type QRL,
} from "@qwik.dev/core";
import { useNavigate } from "@qwik.dev/router";
import { triggerHapticFeedback } from "~/lib/haptics";
import { cx } from "./cx";
import {
  searchEverything,
  type HeaderHit,
} from "~/components/layout/CommunitySearch";
import { useLocale, translate } from "~/lib/i18n";
import { APP_NAME, LEVEL_NAMES } from "~/lib/constants";
import {
  CONTENT_KINDS,
  CONTENT_KIND_TONES,
  isContentKind,
  type ContentKind,
} from "~/lib/content-kinds";
import { toggleColorScheme } from "~/lib/theme";
import { Chip } from "./Chip";
import { DialogFrame } from "./Dialog";
import { Icon, type IconName } from "./Icon";
import { Illustration } from "./Illustration";

/**
 * Evento que abre la paleta desde otro componente (el botón del header).
 *
 * Se despacha y se escucha en `window`. El botón despachaba en `window` y la
 * paleta escuchaba con `useOnDocument`: un evento de `window` no baja a
 * `document`, así que el botón nunca abría nada y sólo andaba Ctrl/Cmd+K. Es
 * el mismo error que tenía `Toast`; las dos puntas usan esta constante.
 */
export const OPEN_COMMAND_PALETTE_EVENT = "open-command-palette";

/** Abre la paleta de comandos desde cualquier parte de la app. */
export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
}

/** Atajo de navegación de la paleta de comandos. */
export interface QuickLinkTarget {
  id: string;
  title: string;
  icon: IconName;
  /** Tipo de contenido al que lleva: su ícono va con el color del tipo. */
  kind?: ContentKind;
  href: string;
}

/** Una fila de "Acciones rápidas": un atajo o una acción en el lugar. */
type QuickAction = {
  id: string;
  title: string;
  icon: IconName;
  kind?: ContentKind;
  category: string;
  href?: string;
  action?: QRL<() => void>;
};

/*
 * Anatomía de las filas (D126). Cada fila lleva a la izquierda una caja con
 * su ícono, teñida con el color del tipo cuando es contenido y neutra cuando
 * es navegación. Antes eran emojis, y toda publicación se veía con la misma
 * hoja y una píldora "Publicaciones" aunque el resultado ya sabía su tipo.
 */
const ROW =
  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors duration-150 motion-reduce:transition-none";
const ROW_SELECTED =
  "bg-brand-50 text-brand-900 dark:bg-brand-950/50 dark:text-brand-200";
const ROW_IDLE = "text-ink-strong hover:bg-muted/60";
const ICON_BOX = "grid size-8 shrink-0 place-items-center rounded-lg";
const NEUTRAL_ICON_BOX = "bg-muted text-ink-muted";
const NEUTRAL_BADGE = "border-subtle bg-inset text-ink-muted";
/** Tecla del pie, con la anatomía de la ayuda de atajos. */
const KBD =
  "inline-flex min-h-5 min-w-5 items-center justify-center rounded-lg border border-subtle bg-muted px-1.5 font-mono text-2xs font-semibold text-ink-muted";

/** Caja del ícono: con el color del tipo si es contenido, neutra si no. */
function iconBox(kind?: ContentKind | null): string {
  if (!kind) return cx(ICON_BOX, NEUTRAL_ICON_BOX);
  const tone = CONTENT_KIND_TONES[kind];
  return cx(ICON_BOX, tone.bg, tone.text);
}

/*
 * `global_search` devuelve, además de comunidades, los cuatro tipos de
 * publicación e instituciones verificadas: lo que no es un tipo de contenido
 * es una institución.
 */
function hitIcon(hit: HeaderHit): IconName {
  if (hit.kind === "community") return "map-pin";
  return isContentKind(hit.kind) ? CONTENT_KINDS[hit.kind].icon : "building";
}

/** Color y nombre del tipo de un resultado que no es una comunidad. */
function hitBadge(kind: ContentKind | null): { tone: string; label: string } {
  if (!kind) return { tone: NEUTRAL_BADGE, label: "Institución" };
  return {
    tone: CONTENT_KIND_TONES[kind].badge,
    label: CONTENT_KINDS[kind].label,
  };
}

/**
 * Atajos de navegación de la paleta según la comunidad de residencia.
 *
 * Antes apuntaban siempre a `/c/argentina/…`: alguien de Rosario terminaba
 * creando un reclamo en la comunidad nacional (o chocando con la base, que
 * sólo deja publicar donde vivís). Con residencia conocida, los atajos van a
 * esa comunidad; sin ella, a rutas generales que existen para cualquiera.
 * Los textos llegan ya traducidos para que esto siga siendo una función pura.
 */
export function communityQuickLinks(
  homeSlug: string | null | undefined,
  t: (source: string) => string,
): QuickLinkTarget[] {
  const slug = homeSlug?.trim();
  if (!slug) {
    return [
      {
        id: "action-explore",
        title: t("Explorar comunidades"),
        icon: "compass",
        href: "/explorar",
      },
      {
        id: "action-search",
        title: t("Buscar reclamos, encuestas y debates"),
        icon: "search",
        href: "/buscar",
      },
    ];
  }
  const base = `/c/${encodeURIComponent(slug)}`;
  return [
    {
      id: "action-claim",
      title: t("Crear un reclamo"),
      icon: CONTENT_KINDS.claim.icon,
      kind: "claim",
      href: `${base}/reclamos/nuevo`,
    },
    {
      id: "action-polls",
      title: t("Ver encuestas activas"),
      icon: CONTENT_KINDS.poll.icon,
      kind: "poll",
      href: `${base}/encuestas`,
    },
    {
      id: "action-debates",
      title: t("Participar en debates"),
      icon: CONTENT_KINDS.debate.icon,
      kind: "debate",
      href: `${base}/debates`,
    },
  ];
}

export const CommandPalette = component$<{
  /** Slug de la comunidad de residencia del viewer, si se conoce. */
  homeSlug?: string | null;
  /** Sin sesión, las acciones de la cuenta terminaban en un redirect a ingresar. */
  signedIn?: boolean;
}>(({ homeSlug, signedIn = false }) => {
  const isOpen = useSignal(false);
  const query = useSignal("");
  const results = useSignal<HeaderHit[]>([]);
  const isSearching = useSignal(false);
  const searchedTerm = useSignal("");
  const searchFailed = useSignal(false);
  const retrySearch = useSignal(0);
  const queryField = useSignal<HTMLInputElement>();
  const selectedIndex = useSignal(0);
  const locale = useLocale();
  const nav = useNavigate();

  // Van aparte y con su tipo: dentro de un spread condicional TypeScript no
  // conserva el literal del ícono y lo ensancha a `string`.
  const accountActions: QuickAction[] = signedIn
    ? [
        {
          id: "action-profile",
          title: translate(locale, "Mi perfil"),
          icon: "user",
          href: "/perfil",
          category: translate(locale, "Acciones rápidas"),
        },
        {
          id: "action-security",
          title: translate(locale, "Ajustes de seguridad"),
          icon: "shield",
          href: "/perfil/seguridad",
          category: translate(locale, "Acciones rápidas"),
        },
      ]
    : [];

  // Acciones rápidas cuando el buscador está vacío
  const quickActions: QuickAction[] = [
    ...communityQuickLinks(homeSlug, (source) => translate(locale, source)).map(
      (link) => ({
        ...link,
        category: translate(locale, "Acciones rápidas"),
      }),
    ),
    ...accountActions,
    {
      id: "action-theme",
      title: translate(locale, "Cambiar tema claro/oscuro"),
      icon: "moon",
      action: $(() => {
        triggerHapticFeedback("selection");
        toggleColorScheme();
      }),
      category: translate(locale, "Acciones rápidas"),
    },
  ];

  // El guard queda serializado en el HTML: cancela el atajo del navegador
  // desde la primera tecla, antes de descargar el QRL que abre la paleta.
  // Un listener instalado por useVisibleTask perdía ese primer Ctrl/Cmd+K.
  useOnDocument(
    "keydown",
    sync$((e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
      } else if (
        e.key === "Escape" &&
        document.querySelector("[data-command-palette] dialog[open]")
      ) {
        // El cierre nativo oculta el diálogo antes de actualizar isOpen, y
        // su evento close tardío puede pisar una reapertura inmediata.
        e.preventDefault();
      }
    }),
  );
  useOnDocument(
    "keydown",
    $((e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        triggerHapticFeedback("medium");
        isOpen.value = !isOpen.value;
        if (isOpen.value) {
          query.value = "";
          selectedIndex.value = 0;
        }
      } else if (e.key === "Escape" && isOpen.value) {
        isOpen.value = false;
      }
    }),
  );

  useOnWindow(
    OPEN_COMMAND_PALETTE_EVENT,
    $(() => {
      triggerHapticFeedback("medium");
      isOpen.value = true;
      query.value = "";
      selectedIndex.value = 0;
    }),
  );

  // Búsqueda remota reactiva
  useTask$(async ({ track, cleanup }) => {
    const term = track(() => query.value.trim());
    const open = track(() => isOpen.value);
    track(() => retrySearch.value);
    results.value = [];
    searchedTerm.value = "";
    searchFailed.value = false;
    selectedIndex.value = 0;
    if (!open || term.length < 2) {
      isSearching.value = false;
      selectedIndex.value = 0;
      return;
    }

    isSearching.value = true;
    let cancelled = false;
    cleanup(() => {
      cancelled = true;
    });

    const timer = setTimeout(async () => {
      try {
        const hits = await searchEverything(term, locale);
        if (!cancelled) {
          results.value = hits;
          searchedTerm.value = term;
          selectedIndex.value = 0;
        }
      } catch {
        if (!cancelled) searchFailed.value = true;
      } finally {
        if (!cancelled) isSearching.value = false;
      }
    }, 180);

    cleanup(() => clearTimeout(timer));
  });

  const currentResults =
    !isSearching.value &&
    !searchFailed.value &&
    searchedTerm.value === query.value.trim()
      ? results.value
      : [];
  const totalItems =
    query.value.trim().length >= 2
      ? currentResults.length
      : quickActions.length;

  const executeSelection = $(async (index: number) => {
    if (query.value.trim().length >= 2) {
      if (
        isSearching.value ||
        searchFailed.value ||
        searchedTerm.value !== query.value.trim()
      )
        return;
      const hit = results.value[index];
      if (!hit) return;
      triggerHapticFeedback("selection");
      isOpen.value = false;
      await nav(hit.href);
    } else {
      const action = quickActions[index];
      if (action) {
        triggerHapticFeedback("selection");
        isOpen.value = false;
        if (action.action) {
          await action.action();
        } else if (action.href) {
          await nav(action.href);
        }
      }
    }
  });

  // `DialogFrame` lleva el foco al buscador al abrir (es el primer control),
  // lo atrapa adentro y cierra con Escape. Antes el foco se quedaba en la
  // página y lo que se tipeaba no llegaba al campo hasta hacer clic.
  return (
    // Un host estable conserva los handlers globales al cerrar el diálogo.
    // Alternar entre null y DialogFrame los perdía al reanudar en Qwik 2.
    <div class="contents" data-command-palette="">
      {isOpen.value && (
        <DialogFrame
          onClose$={() => {
            isOpen.value = false;
          }}
          label={translate(locale, "Paleta de comandos")}
          placement="top"
          backdropClass="backdrop:bg-black/60 backdrop:backdrop-blur-sm"
          class="w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-3xl border border-subtle bg-surface text-ink shadow-2xl ring-1 ring-black/5 animate-scale-pop max-sm:mb-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl"
        >
          {/* Input de búsqueda */}
          <div class="relative flex items-center border-b border-subtle px-4 py-3 sm:px-5">
            <Icon name="search" class="mr-3 text-lg text-ink-faint" />
            <input
              ref={queryField}
              type="search"
              aria-label={translate(
                locale,
                "Buscar comunidades y publicaciones",
              )}
              value={query.value}
              onInput$={(_, el) => (query.value = el.value)}
              onKeyDown$={[
                // Síncrono: el manejador de abajo se carga diferido y un
                // `preventDefault()` ahí puede llegar tarde (el cursor del
                // campo saltaría con las flechas).
                sync$((e: KeyboardEvent) => {
                  if (
                    e.key === "ArrowDown" ||
                    e.key === "ArrowUp" ||
                    e.key === "Enter"
                  ) {
                    e.preventDefault();
                  }
                }),
                $(async (e: KeyboardEvent) => {
                  if (e.key === "ArrowDown") {
                    selectedIndex.value =
                      (selectedIndex.value + 1) % Math.max(1, totalItems);
                  } else if (e.key === "ArrowUp") {
                    selectedIndex.value =
                      (selectedIndex.value - 1 + totalItems) %
                      Math.max(1, totalItems);
                  } else if (e.key === "Enter") {
                    await executeSelection(selectedIndex.value);
                  }
                }),
              ]}
              placeholder={translate(
                locale,
                "Buscar comunidades, reclamos, encuestas o acciones…",
              )}
              class="h-11 flex-1 bg-transparent text-sm text-ink-strong placeholder:text-ink-faint focus:outline-none sm:text-base touch-manipulation"
            />
            {query.value ? (
              <button
                type="button"
                onClick$={() => (query.value = "")}
                class="touch-target grid size-8 place-items-center rounded-xl text-xs text-ink-faint hover:bg-muted hover:text-ink-strong active:scale-95"
                aria-label={translate(locale, "Borrar búsqueda")}
              >
                <Icon name="x" class="text-sm" />
              </button>
            ) : (
              <kbd class="hidden rounded-lg border border-subtle bg-muted px-2 py-0.5 text-2xs font-semibold text-ink-muted sm:inline-block">
                {"Esc"}
              </kbd>
            )}
          </div>

          {/* Lista de resultados o acciones */}
          <div
            class="max-h-[60vh] overflow-y-auto p-2 sm:p-3"
            aria-busy={isSearching.value}
          >
            {query.value.trim().length >= 2 ? (
              currentResults.length === 0 ? (
                <div
                  class="py-10 text-center text-sm text-ink-muted"
                  role={searchFailed.value ? "alert" : "status"}
                >
                  {/* El ícono es inline-block: lo centra el `text-center`. */}
                  {searchFailed.value ? (
                    <Icon name="alert" class="text-2xl text-danger" />
                  ) : isSearching.value ? (
                    <Icon
                      name="search"
                      class="text-2xl text-ink-faint motion-safe:animate-pulse"
                    />
                  ) : (
                    // `max-*` y no `size-*`: la ilustración ya trae `size-24`
                    // y dos tamaños en la misma clase no garantizan cuál gana.
                    <Illustration
                      name="search"
                      class="mx-auto max-h-16 max-w-16"
                    />
                  )}
                  <p class="mt-2 font-medium">
                    {searchFailed.value
                      ? translate(locale, "No pudimos buscar. Probá de nuevo.")
                      : isSearching.value
                        ? translate(locale, "Buscando…")
                        : translate(locale, "No se encontraron resultados")}
                  </p>
                  {searchFailed.value && (
                    <button
                      type="button"
                      class="mt-3 inline-flex min-h-11 items-center rounded-xl border border-control px-3 font-medium text-brand hover:bg-muted"
                      onClick$={() => {
                        retrySearch.value += 1;
                        queryField.value?.focus();
                      }}
                    >
                      {translate(locale, "Reintentar búsqueda")}
                    </button>
                  )}
                </div>
              ) : (
                <ul class="space-y-1">
                  {currentResults.map((hit, idx) => {
                    const isSelected = selectedIndex.value === idx;
                    const kind = isContentKind(hit.kind) ? hit.kind : null;
                    const badge = hitBadge(kind);
                    return (
                      <li key={`${hit.kind}-${hit.href}`}>
                        {/* Dentro del botón, sólo contenido de frase: los
                          <div> y <p> de antes cortaban el servidor en
                          desarrollo (Q12). El foco elige la fila como el
                          mouse: con Tab, el resaltado quedaba en otra fila
                          que la que abre Enter. */}
                        <button
                          type="button"
                          onClick$={() => executeSelection(idx)}
                          onMouseEnter$={() => (selectedIndex.value = idx)}
                          onFocus$={() => (selectedIndex.value = idx)}
                          class={cx(ROW, isSelected ? ROW_SELECTED : ROW_IDLE)}
                        >
                          {hit.kind === "community" && hit.emoji ? (
                            // El emoji de una comunidad es identidad elegida,
                            // no un ícono de la interfaz.
                            <span
                              aria-hidden="true"
                              class={cx(ICON_BOX, "bg-muted text-lg")}
                            >
                              {hit.emoji}
                            </span>
                          ) : (
                            <span class={iconBox(kind)}>
                              <Icon name={hitIcon(hit)} class="text-base" />
                            </span>
                          )}
                          <span class="block min-w-0 flex-1">
                            <span dir="auto" class="block truncate font-medium">
                              {hit.name}
                            </span>
                            {hit.communityName && (
                              <span
                                dir="auto"
                                class="block truncate text-xs text-ink-muted"
                              >
                                {hit.communityName}
                              </span>
                            )}
                          </span>
                          {/* A la derecha, qué es: el nivel de una comunidad,
                            como en el desplegable del header, o el tipo de
                            la publicación con su color. */}
                          {hit.kind === "community" ? (
                            <span class="shrink-0 text-xs text-ink-faint">
                              {translate(
                                locale,
                                LEVEL_NAMES[hit.level ?? 0] ?? "Comunidad",
                              )}
                            </span>
                          ) : (
                            <Chip
                              variant="badge"
                              toneClass={badge.tone}
                              class="shrink-0"
                            >
                              {translate(locale, badge.label)}
                            </Chip>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              <div>
                <p class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {translate(locale, "Acciones rápidas")}
                </p>
                <ul class="mt-1 space-y-1">
                  {quickActions.map((action, idx) => {
                    const isSelected = selectedIndex.value === idx;
                    return (
                      <li key={action.id}>
                        {/* Como en los resultados, el foco elige la fila: si
                          no, al recorrer con Tab la tecla Enter quedaba
                          dibujada en otra fila que la que abre. */}
                        <button
                          type="button"
                          onClick$={() => executeSelection(idx)}
                          onMouseEnter$={() => (selectedIndex.value = idx)}
                          onFocus$={() => (selectedIndex.value = idx)}
                          class={cx(ROW, isSelected ? ROW_SELECTED : ROW_IDLE)}
                        >
                          <span class={iconBox(action.kind)}>
                            <Icon name={action.icon} class="text-base" />
                          </span>
                          <span class="min-w-0 flex-1 font-medium">
                            {action.title}
                          </span>
                          {/* Enter abre la fila elegida: la tecla se dibuja
                            sólo ahí, sin mover el texto al cambiar de fila. */}
                          <Icon
                            name="corner-down-left"
                            class={cx(
                              "text-sm text-ink-faint",
                              !isSelected && "invisible",
                            )}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Pie con los atajos: cada tecla es un ícono con nombre y una
            palabra. Las flechas tipográficas vivían dentro de un texto
            traducido y cada sistema las dibujaba distinto. */}
          <div class="hidden items-center justify-between border-t border-subtle bg-muted/30 px-4 py-2.5 text-xs text-ink-faint sm:flex">
            <span class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span class="inline-flex items-center gap-1.5">
                <kbd class={KBD}>
                  <Icon
                    name="arrow-right"
                    class="-rotate-90"
                    label={translate(locale, "Flecha arriba")}
                  />
                </kbd>
                <kbd class={KBD}>
                  <Icon
                    name="arrow-right"
                    class="rotate-90"
                    label={translate(locale, "Flecha abajo")}
                  />
                </kbd>
                {translate(locale, "Navegar")}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <kbd class={KBD}>
                  <Icon
                    name="corner-down-left"
                    label={translate(locale, "Enter")}
                  />
                </kbd>
                {translate(locale, "Abrir")}
              </span>
              <span class="inline-flex items-center gap-1.5">
                <kbd class={KBD}>{"Esc"}</kbd>
                {translate(locale, "Cerrar")}
              </span>
            </span>
            <span class="font-medium text-brand">{APP_NAME}</span>
          </div>
        </DialogFrame>
      )}
    </div>
  );
});
