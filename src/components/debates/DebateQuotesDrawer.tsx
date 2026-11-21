import { $, component$, useId, useSignal, type Signal } from "@qwik.dev/core";
import {
  Button,
  Card,
  Chip,
  Icon,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { translate, useLocale } from "~/lib/i18n";
import type { DebateColumnData } from "./DebateColumn";
import {
  appendDebateQuote,
  formatDebateQuote,
  hasProposalWords,
} from "~/lib/debate-quotes";
import { formatNumber, pluralize } from "~/lib/format";

/* Lo fijado es una elección de quien lee, como el botón de fijar
   presionado: los dos llevan el violeta de la acción y no el del tipo. */
const PINNED_TONE = "border-brand-500/30 bg-brand-500/10 text-brand";

export const DebateQuotesDrawer = component$<{
  columns: DebateColumnData[];
  debateTitle: string;
  replyColumn?: Pick<DebateColumnData, "id" | "name">;
  replyDraft?: Signal<string>;
}>(({ columns, debateTitle, replyColumn, replyDraft }) => {
  const locale = useLocale();
  const isOpen = useSignal(false);
  const filterType = useSignal<"all" | "top" | "proposals">("all");
  const pinnedIds = useSignal<string[]>([]);
  const panelId = useId();

  // Extraer comentarios válidos de todas las columnas. La columna se nombra
  // sola: el emoji fijo que la acompañaba no lo eligió nadie.
  const allComments = columns.flatMap((col) =>
    col.comments.map((comment) => ({
      ...comment,
      columnName: col.name,
    })),
  );

  if (allComments.length === 0) return null;

  // Filtrar y ordenar
  let displayedComments = [...allComments];
  if (filterType.value === "top") {
    // Ordenar por apoyos o extensión sustantiva
    displayedComments.sort((a, b) => b.score - a.score);
  } else if (filterType.value === "proposals") {
    displayedComments = displayedComments.filter((comment) =>
      hasProposalWords(comment.body),
    );
  }

  // Ordenar poniendo las fijadas primero
  displayedComments.sort((a, b) => {
    const aPinned = pinnedIds.value.includes(a.id);
    const bPinned = pinnedIds.value.includes(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  const togglePin = $((id: string) => {
    playCivicSound("toggle");
    triggerHapticFeedback("selection");
    if (pinnedIds.value.includes(id)) {
      pinnedIds.value = pinnedIds.value.filter((item) => item !== id);
    } else {
      pinnedIds.value = [...pinnedIds.value, id];
    }
  });

  const handleCopyQuote = $(
    async (text: string, author: string, column: string) => {
      playCivicSound("click");
      try {
        await navigator.clipboard.writeText(
          formatDebateQuote(text, author, column, debateTitle),
        );
        triggerHapticFeedback("success");
        showToast(
          translate(locale, "Cita copiada en formato markdown para responder"),
          "success",
        );
      } catch {
        triggerHapticFeedback("warning");
        showToast(
          translate(locale, "No pudimos copiar la cita. Volvé a intentarlo."),
          "danger",
        );
      }
    },
  );

  const handleInsertQuote = $(
    (text: string, author: string, column: string) => {
      if (!replyDraft || !replyColumn) return;
      const next = appendDebateQuote(
        replyDraft.value,
        formatDebateQuote(text, author, column, debateTitle),
      );
      if (next === null) {
        showToast(
          translate(
            locale,
            "La cita no entra en el límite de 1000 caracteres. Tu comentario se conserva; podés copiar la cita y acortarla.",
          ),
          "warn",
        );
        return;
      }
      replyDraft.value = next;
      triggerHapticFeedback("selection");
      showToast(
        translate(locale, "Cita agregada al borrador de {{name}}.", {
          name: replyColumn.name,
        }),
        "success",
      );
      requestAnimationFrame(() => {
        document.getElementById(`comentario-${replyColumn.id}`)?.focus();
      });
    },
  );

  return (
    // Tarjeta plana (D123): no es clicable entera, así que no se eleva. Va
    // sin `overflow-hidden`: el disparador la ocupa de borde a borde y el
    // recorte se comía su contorno de foco. Las esquinas del fondo del hover
    // las redondea el propio botón.
    <Card>
      {/* Disclosure válido: el h2 envuelve al botón y adentro sólo va
          contenido de frase. Con un h4, un p y dos div dentro del <button>,
          Qwik cortaba el servidor de desarrollo (Q12) y el título saltaba
          dos niveles al lado del h2 del resumen. El botón resetea la letra
          que hereda del h2; el título la recupera. */}
      <h2>
        <button
          type="button"
          onClick$={() => {
            isOpen.value = !isOpen.value;
            playCivicSound("toggle");
            triggerHapticFeedback("selection");
          }}
          class={cx(
            "flex w-full cursor-pointer items-center justify-between gap-3 p-4 text-left font-sans font-normal tracking-normal text-ink transition-colors duration-150 hover:bg-muted/60 touch-manipulation sm:p-5",
            isOpen.value ? "rounded-t-2xl" : "rounded-2xl",
          )}
          aria-expanded={isOpen.value}
          aria-controls={isOpen.value ? panelId : undefined}
        >
          <span class="flex min-w-0 items-center gap-3">
            <span
              class={cx(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                CONTENT_KIND_TONES.debate.bg,
                CONTENT_KIND_TONES.debate.text,
              )}
            >
              <Icon name="quote" class="text-xl" />
            </span>
            <span class="min-w-0">
              <span class="block font-display text-sm font-bold text-ink-strong sm:text-base">
                {translate(locale, "Citas destacadas del debate")}
              </span>
              <span class="block text-xs text-ink-muted">
                {pluralize(
                  allComments.length,
                  "comentario cargado para citar",
                  "comentarios cargados para citar",
                  locale,
                )}
              </span>
            </span>
          </span>

          <span class="flex shrink-0 items-center gap-2">
            {/* Un badge es un span, no otro botón: el disparador sigue siendo
                el primer botón del cajón. */}
            {pinnedIds.value.length > 0 && (
              <Chip
                variant="badge"
                icon="pin"
                toneClass={PINNED_TONE}
                class="tabular-nums"
              >
                {pluralize(pinnedIds.value.length, "fijada", "fijadas", locale)}
              </Chip>
            )}
            <Icon
              name="chevron-down"
              class={cx(
                "text-base text-ink-faint transition-transform duration-200",
                isOpen.value && "rotate-180",
              )}
            />
          </span>
        </button>
      </h2>

      {isOpen.value && (
        <div
          id={panelId}
          class="animate-fade-in space-y-4 border-t border-subtle p-4 sm:p-5"
        >
          {/* Filtros con el chip único (D123): `aria-pressed` lo pone el Chip
              y el ícono propio reemplaza al emoji del nombre accesible. */}
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <Chip
                selected={filterType.value === "all"}
                onClick$={() => {
                  filterType.value = "all";
                  playCivicSound("click");
                }}
              >
                <span>
                  {translate(locale, "Todos")}{" "}
                  <span class="tabular-nums">
                    ({formatNumber(allComments.length, locale)})
                  </span>
                </span>
              </Chip>
              <Chip
                icon="star"
                selected={filterType.value === "top"}
                onClick$={() => {
                  filterType.value = "top";
                  playCivicSound("click");
                }}
              >
                {translate(locale, "Más apoyados")}
              </Chip>
              <Chip
                icon="bulb"
                selected={filterType.value === "proposals"}
                onClick$={() => {
                  filterType.value = "proposals";
                  playCivicSound("click");
                }}
              >
                {translate(locale, "Propuestas")}
              </Chip>
            </div>

            <span class="text-xs text-ink-muted">
              {translate(
                locale,
                replyDraft && replyColumn
                  ? "Las citas se agregan al borrador de tu comunidad, sin publicar."
                  : "Podés copiar las citas para usarlas en tu respuesta.",
              )}
            </span>
          </div>

          {replyDraft && replyColumn && (
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Destino de la cita: tu comentario de {{name}}.",
                { name: replyColumn.name },
              )}
            </p>
          )}
          {filterType.value === "proposals" && (
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Busca palabras de propuesta en español o inglés, como «propongo», «solución», «proposal» o «suggest», sólo en los comentarios cargados. Puede omitir propuestas redactadas de otra forma.",
              )}
            </p>
          )}
          <p role="status" aria-live="polite" class="text-xs text-ink-muted">
            {translate(
              locale,
              "Mostrando {{shown}} de {{total}} citas cargadas.",
              {
                shown: formatNumber(
                  Math.min(displayedComments.length, 12),
                  locale,
                ),
                total: formatNumber(displayedComments.length, locale),
              },
            )}
          </p>
          {displayedComments.length === 0 && (
            <div class="rounded-xl border border-dashed border-subtle p-4 text-sm text-ink-muted">
              <p>
                {translate(
                  locale,
                  "No hay citas cargadas que coincidan con este filtro.",
                )}
              </p>
              <button
                type="button"
                class="mt-2 inline-flex min-h-11 items-center rounded-lg px-2 text-brand hover:bg-muted"
                onClick$={() => {
                  filterType.value = "all";
                }}
              >
                {translate(locale, "Mostrar todas las citas")}
              </button>
            </div>
          )}

          {/* Listado de citas: superficies planas que no se levantan, porque
              no son clicables enteras; la acción está en sus botones. */}
          <div class="grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {displayedComments.slice(0, 12).map((c) => {
              // Con autor nulo, lo mismo que dice la columna para ese
              // comentario (CommentCard), no un "Vecino" inventado.
              const authorLabel =
                c.author?.display_name ??
                c.author?.username ??
                translate(locale, "Cuenta eliminada");
              const isPinned = pinnedIds.value.includes(c.id);

              return (
                <div
                  key={c.id}
                  class={cx(
                    "flex flex-col justify-between rounded-xl border bg-surface p-3.5",
                    isPinned ? "border-brand-500/50" : "border-subtle",
                  )}
                >
                  <div>
                    <div class="mb-2 flex items-center justify-between gap-2 text-xs">
                      <p class="flex min-w-0 items-center gap-1.5">
                        <span
                          dir="auto"
                          class="truncate font-medium text-ink-strong"
                        >
                          {authorLabel}
                        </span>
                        <span aria-hidden="true" class="text-ink-faint">
                          ·
                        </span>
                        <span class="truncate text-ink-muted">
                          {c.columnName}
                        </span>
                      </p>
                      {/* Sólo ícono: el nombre es "Fijar cita" y el estado lo
                          dice `aria-pressed`, así no cambia al tocarlo. */}
                      <button
                        type="button"
                        aria-pressed={isPinned}
                        aria-label={translate(locale, "Fijar cita")}
                        title={translate(locale, "Fijar cita")}
                        onClick$={() => togglePin(c.id)}
                        class={cx(
                          "touch-target grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors duration-150 touch-manipulation",
                          isPinned
                            ? "bg-brand-500/10 text-brand"
                            : "text-ink-faint hover:bg-muted hover:text-ink-strong",
                        )}
                      >
                        <Icon
                          name="pin"
                          class={cx("text-base", isPinned && "fill-current")}
                        />
                      </button>
                    </div>

                    {/* Una cita es una cita: blockquote con la raya del tipo,
                        sin cursiva ni comillas rectas pegadas al texto. */}
                    <blockquote
                      dir="auto"
                      class="ugc-text line-clamp-3 border-l-2 border-kind-debate/50 pl-3 text-sm text-ink"
                    >
                      {c.body}
                    </blockquote>
                  </div>

                  <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-subtle pt-2.5">
                    {/* El mismo nombre que le da la columna al dato: es el
                        puntaje del comentario, no una cuenta de apoyos. */}
                    {c.score > 0 ? (
                      <span class="text-2xs tabular-nums text-ink-faint">
                        {translate(locale, "Puntaje {{score}}", {
                          score: `+${formatNumber(c.score, locale)}`,
                        })}
                      </span>
                    ) : (
                      <span />
                    )}

                    <span class="flex flex-wrap items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick$={() =>
                          handleCopyQuote(c.body, authorLabel, c.columnName)
                        }
                      >
                        <Icon name="copy" />
                        {translate(locale, "Copiar cita")}
                      </Button>
                      {replyDraft && replyColumn && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick$={() =>
                            handleInsertQuote(c.body, authorLabel, c.columnName)
                          }
                        >
                          <Icon name="chat" />
                          {translate(locale, "Citar en mi comentario")}
                        </Button>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
});
