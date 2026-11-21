import {
  $,
  component$,
  useComputed$,
  useSignal,
  useVisibleTask$,
  type Signal,
} from "@qwik.dev/core";
import {
  Button,
  EmptyState,
  Icon,
  Input,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { compareNames } from "~/lib/community";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { DebateColumn, type DebateColumnData } from "./DebateColumn";

/* Flechas del carrusel: botones redondos de 32 px con el área táctil
   extendida a 44 en pantallas de dedo, sin sombra ni escala al tocar. Las
   dibujaba cada una con su propio <svg>; ahora usan los chevrons del set. */
const ARROW_BUTTON =
  "touch-target grid size-8 place-items-center rounded-full border border-control bg-surface text-ink-strong transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface";

/**
 * La grilla de debate por sub-comunidad.
 *
 * Incluye carrusel con navegación horizontal por flechas, píldoras de salto
 * directo por sub-comunidad y buscador/ordenación dinámica en el cliente.
 */
export const DebateGrid = component$<{
  columns: DebateColumnData[];
  debateId: string;
  /** Columna donde el usuario reside; null si no vive en ninguna. */
  myColumnId: string | null;
  canVote: boolean;
  isAuthenticated: boolean;
  debateOpen: boolean;
  commentDraft?: Signal<string>;
}>(
  ({
    columns,
    debateId,
    myColumnId,
    canVote,
    isAuthenticated,
    debateOpen,
    commentDraft,
  }) => {
    const locale = useLocale();
    const sort = useSignal<"activas" | "alfabetico">("activas");
    const filter = useSignal("");
    const scrollContainer = useSignal<HTMLDivElement>();
    /**
     * Qué columna está a la vista, para marcar su pastilla.
     *
     * Arranca en la propia porque es la que el orden pone primera: si arrancara
     * vacío, el botón "Ir a mi columna" se dibujaría en el HTML del servidor y
     * desaparecería al hidratar, moviendo la barra justo cuando se la mira.
     */
    const activeId = useSignal<string | null>(myColumnId);
    /** El carrusel llegó a un extremo: la flecha de ese lado ya no hace nada. */
    const atStart = useSignal(true);
    const atEnd = useSignal(false);

    const visible = useComputed$(() => {
      const needle = filter.value.trim().toLowerCase();
      const filtered = needle
        ? columns.filter((c) => c.name.toLowerCase().includes(needle))
        : [...columns];

      filtered.sort((a, b) => {
        // La columna propia primero siempre: es donde el usuario puede actuar.
        if (a.id === myColumnId) return -1;
        if (b.id === myColumnId) return 1;
        if (sort.value === "activas" && a.commentCount !== b.commentCount) {
          return b.commentCount - a.commentCount;
        }
        return compareNames(a.name, b.name, locale);
      });

      return filtered;
    });

    const totalComments = columns.reduce((sum, c) => sum + c.commentCount, 0);

    const scrollBy$ = $((direction: "left" | "right") => {
      const el = scrollContainer.value;
      if (!el) return;
      const offset = direction === "left" ? -420 : 420;
      el.scrollBy({ left: offset, behavior: "smooth" });
    });

    /**
     * Dónde estamos dentro del carrusel.
     *
     * Con veinte o doscientas columnas, las pastillas de arriba eran una lista
     * de destinos sin ningún "acá estás": después de dos arrastres no había
     * forma de saber qué se estaba mirando salvo leer el nombre de la columna.
     * El observador marca la que ocupa el centro y, de paso, apaga las flechas
     * cuando ya no queda nada hacia ese lado.
     */
    // eslint-disable-next-line qwik/no-use-visible-task -- depende del scroll real del carrusel
    useVisibleTask$(({ track, cleanup }) => {
      // Al filtrar u ordenar, el carrusel se rearma con otros nodos.
      track(() => visible.value);

      // Un cuadro de espera: al pasar de "ninguna coincidencia" a la grilla, el
      // contenedor todavía no existe cuando esta tarea vuelve a correr, y la
      // referencia se leería vacía.
      let detach: (() => void) | undefined;
      const frame = requestAnimationFrame(() => {
        const container = scrollContainer.value;
        if (!container) return;

        const sync = () => {
          const max = container.scrollWidth - container.clientWidth;
          atStart.value = container.scrollLeft <= 8;
          atEnd.value = container.scrollLeft >= max - 8;

          // La columna cuyo borde izquierdo esté más cerca del inicio visible.
          const origin = container.scrollLeft + container.clientWidth / 3;
          let closest: string | null = null;
          let best = Infinity;
          for (const node of container.children) {
            const el = node as HTMLElement;
            const distance = Math.abs(
              el.offsetLeft - container.offsetLeft - origin,
            );
            if (distance < best) {
              best = distance;
              closest = el.id.replace("debate-column-", "");
            }
          }
          activeId.value = closest;
        };

        sync();
        container.addEventListener("scroll", sync, { passive: true });
        window.addEventListener("resize", sync);
        detach = () => {
          container.removeEventListener("scroll", sync);
          window.removeEventListener("resize", sync);
        };
      });

      cleanup(() => {
        cancelAnimationFrame(frame);
        detach?.();
      });
    });

    const scrollToColumn$ = $((id: string) => {
      triggerHapticFeedback("selection");
      const container = scrollContainer.value;
      if (!container) return;
      const target = container.querySelector<HTMLElement>(
        `#debate-column-${id}`,
      );
      if (target) {
        const left = target.offsetLeft - container.offsetLeft - 16;
        container.scrollTo({ left, behavior: "smooth" });
        target.focus();
      }
    });

    const currentIndex = visible.value.findIndex(
      (c) => c.id === activeId.value,
    );
    const prevColumn =
      currentIndex > 0 ? visible.value[currentIndex - 1] : null;
    const nextColumn =
      currentIndex >= 0 && currentIndex < visible.value.length - 1
        ? visible.value[currentIndex + 1]
        : null;

    return (
      <div class="space-y-4">
        {/* Título de la grilla: el esquema saltaba del h2 del resumen a los
            de las extensiones, y la grilla, que es el debate en sí, no tenía
            nombre. La instrucción va debajo en oración normal; antes era una
            oración entera en mayúsculas. */}
        <div class="space-y-2">
          <div class="flex items-end justify-between gap-3">
            <div class="min-w-0">
              <h2 class="text-display-xs">
                {translate(locale, "Columnas por sub-comunidad")}
              </h2>
              <p class="mt-0.5 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Desplazate horizontalmente para explorar cada perspectiva",
                )}
              </p>
            </div>
            {/* El mismo espacio que en el teléfono: una tableta también se usa
                con el dedo, y con `gap-1` las áreas de 44 px se pisaban. */}
            <div class="hidden shrink-0 items-center gap-3 sm:flex">
              <button
                type="button"
                aria-label={translate(locale, "Desplazar a la izquierda")}
                onClick$={() => scrollBy$("left")}
                disabled={atStart.value}
                class={ARROW_BUTTON}
              >
                <Icon name="chevron-left" class="text-base" />
              </button>
              <button
                type="button"
                aria-label={translate(locale, "Desplazar a la derecha")}
                onClick$={() => scrollBy$("right")}
                disabled={atEnd.value}
                class={ARROW_BUTTON}
              >
                <Icon name="chevron-right" class="text-base" />
              </button>
            </div>
          </div>

          {/* El scroll recorta en los dos ejes: con 6 px de aire alrededor
              entran el anillo de la pastilla activa (3 px), el contorno de
              foco (5 px) y el área táctil extendida, también en la primera,
              que es la activa al cargar. El margen negativo deja las
              pastillas alineadas con el título. */}
          <div class="scrollbar-slim -mx-1.5 flex items-center gap-1.5 overflow-x-auto px-1.5 py-1.5">
            {visible.value.map((col) => {
              const isMine = col.id === myColumnId;
              const isActive = col.id === activeId.value;
              return (
                <button
                  key={`pill-${col.id}`}
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  onClick$={() => scrollToColumn$(col.id)}
                  class={cx(
                    "touch-target inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                    isMine
                      ? "bg-success-600 font-semibold text-white"
                      : "border border-control bg-surface text-ink-strong hover:border-strong hover:bg-muted",
                    // El anillo y no un cambio de fondo: la pastilla propia ya usa
                    // el color para decir "acá podés escribir", y las dos cosas
                    // —dónde estoy y dónde puedo actuar— tienen que poder
                    // coincidir sin taparse.
                    isActive &&
                      "ring-2 ring-brand-500 ring-offset-1 ring-offset-[var(--surface-app)]",
                  )}
                >
                  <span class="text-3xs font-semibold tabular-nums opacity-75">
                    {String(col.position).padStart(2, "0")}
                  </span>
                  <span>{col.name}</span>
                  {/* El conteo es un dato: hundido y atenuado, no violeta. */}
                  {col.commentCount > 0 && (
                    <span
                      class={cx(
                        "rounded-full px-1.5 py-0.5 text-3xs font-semibold tabular-nums",
                        isMine
                          ? "bg-white/20 text-white"
                          : "bg-inset text-ink-muted",
                      )}
                    >
                      {col.commentCount}
                    </span>
                  )}
                  {/* La propia se marca con el mismo pin que "Ir a mi
                      columna", no con una estrella de favorito. El pin lleva
                      el nombre que usa la columna: el verde solo no le dice
                      nada a un lector de pantalla, y la estrella de antes sí
                      entraba en el nombre de la pastilla. */}
                  {isMine && (
                    <Icon
                      name="map-pin"
                      label={translate(locale, "Tu comunidad")}
                      class="text-xs opacity-90"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ------------------------------------------------------------ Toolbar */}
        <div class="flex flex-wrap items-center justify-between gap-3 border-y border-subtle py-3">
          <div class="flex flex-wrap items-center gap-3">
            <div
              class="flex rounded-2xl bg-inset p-1"
              role="group"
              aria-label={translate(locale, "Ordenar columnas")}
            >
              {(
                [
                  ["activas", "Más activas"],
                  ["alfabetico", "Alfabético"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sort.value === key}
                  class={cx(
                    "min-h-9 rounded-xl px-3 py-1 text-xs font-medium transition-colors",
                    sort.value === key
                      ? "bg-surface text-ink-strong shadow-soft font-semibold"
                      : "text-ink-muted hover:text-ink-strong",
                  )}
                  onClick$={() => (sort.value = key)}
                >
                  {translate(locale, label)}
                </button>
              ))}
            </div>

            <div class="min-w-40 max-w-64">
              <Input
                name="filtro-columnas"
                type="search"
                placeholder={translate(locale, "Buscar columna…")}
                aria-label={translate(locale, "Buscar una columna por nombre")}
                class="h-9 py-1.5 text-xs"
                value={filter.value}
                onInput$={(_, el) => (filter.value = el.value)}
              />
            </div>

            {/* La columna propia va primera, pero "primera" deja de significar
              algo apenas se arrastra el carrusel: sin esto, volver al único
              lugar donde se puede escribir era desplazarse a mano hasta el
              principio. Sólo aparece cuando ya no está a la vista. */}
            {myColumnId && activeId.value !== myColumnId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick$={() => scrollToColumn$(myColumnId)}
              >
                <Icon name="map-pin" />
                {translate(locale, "Ir a mi columna")}
              </Button>
            )}
          </div>

          <div class="flex items-center gap-3">
            <p class="text-xs text-ink-faint" aria-live="polite">
              {translate(
                locale,
                "{{visible}} de {{total}} columnas · {{comments}}",
                {
                  visible: formatNumber(visible.value.length, locale),
                  total: formatNumber(columns.length, locale),
                  comments: `${formatNumber(totalComments, locale)} ${translate(
                    locale,
                    totalComments === 1 ? "comentario" : "comentarios",
                  )}`,
                },
              )}
            </p>

            {/* En el teléfono el área táctil crece a 44 px: el espacio entre
                las dos flechas evita que se pisen. */}
            <div class="flex items-center gap-3 sm:hidden">
              <button
                type="button"
                aria-label={translate(locale, "Desplazar a la izquierda")}
                onClick$={() => scrollBy$("left")}
                disabled={atStart.value}
                class={ARROW_BUTTON}
              >
                <Icon name="chevron-left" class="text-sm" />
              </button>
              <button
                type="button"
                aria-label={translate(locale, "Desplazar a la derecha")}
                onClick$={() => scrollBy$("right")}
                disabled={atEnd.value}
                class={ARROW_BUTTON}
              >
                <Icon name="chevron-right" class="text-sm" />
              </button>
            </div>
          </div>
        </div>

        {/* --------------------------------------------------- Selector de Perspectivas en Móvil */}
        {visible.value.length > 1 && (
          <nav
            aria-label={translate(locale, "Navegación rápida de perspectivas")}
            class="flex sm:hidden items-center justify-between gap-2 rounded-2xl border border-subtle bg-surface/95 p-2 shadow-xs backdrop-blur-md"
          >
            <button
              type="button"
              disabled={!prevColumn}
              onClick$={() => {
                if (prevColumn) {
                  scrollToColumn$(prevColumn.id);
                }
              }}
              class="touch-target flex items-center gap-1 rounded-xl border border-subtle bg-muted/60 px-2.5 py-1.5 text-xs font-semibold text-ink-strong transition-colors disabled:pointer-events-none disabled:opacity-30"
              aria-label={translate(locale, "Perspectiva anterior")}
            >
              <Icon name="chevron-left" class="text-sm" />
              <span class="max-w-24 truncate">
                {prevColumn?.name ?? translate(locale, "Anterior")}
              </span>
            </button>

            <div class="flex flex-col items-center text-center px-1">
              <span class="text-3xs font-bold uppercase tracking-wider text-ink-faint">
                {translate(locale, "Perspectiva")}
              </span>
              <span class="text-xs font-bold text-ink-strong">
                {currentIndex >= 0 ? currentIndex + 1 : 1} /{" "}
                {visible.value.length}
              </span>
            </div>

            <button
              type="button"
              disabled={!nextColumn}
              onClick$={() => {
                if (nextColumn) {
                  scrollToColumn$(nextColumn.id);
                }
              }}
              class="touch-target flex items-center gap-1 rounded-xl border border-subtle bg-muted/60 px-2.5 py-1.5 text-xs font-semibold text-ink-strong transition-colors disabled:pointer-events-none disabled:opacity-30"
              aria-label={translate(locale, "Perspectiva siguiente")}
            >
              <span class="max-w-24 truncate">
                {nextColumn?.name ?? translate(locale, "Siguiente")}
              </span>
              <Icon name="chevron-right" class="text-sm" />
            </button>
          </nav>
        )}

        {/* -------------------------------------------------------------- Grilla con Scroll Horizontal */}
        {visible.value.length === 0 ? (
          // EmptyState traduce título y descripción: pasarlos ya traducidos
          // los traducía dos veces.
          <EmptyState
            illustration="search"
            title="Ninguna columna coincide"
            description="Probá con otro nombre o limpiá el buscador."
          >
            {/* Decir "limpiá el buscador" y no ofrecer cómo obliga a volver al
              campo, seleccionar y borrar. El estado vacío es el lugar donde
              esa acción se está pidiendo. */}
            <Button
              type="button"
              variant="secondary"
              onClick$={() => (filter.value = "")}
            >
              {translate(locale, "Limpiar el buscador")}
            </Button>
          </EmptyState>
        ) : (
          <div class="relative group">
            <div
              ref={scrollContainer}
              role="region"
              aria-label={translate(
                locale,
                "Grilla de debate por sub-comunidad. Usá las flechas para desplazarte.",
              )}
              tabIndex={0}
              class="scrollbar-slim -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 pt-1 sm:mx-0 sm:px-0"
            >
              {visible.value.map((column) => (
                <DebateColumn
                  key={`${debateId}:${column.id}`}
                  column={column}
                  debateId={debateId}
                  totalColumns={columns.length}
                  isMine={column.id === myColumnId}
                  canVote={canVote}
                  isAuthenticated={isAuthenticated}
                  debateOpen={debateOpen}
                  commentDraft={
                    column.id === myColumnId ? commentDraft : undefined
                  }
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);
