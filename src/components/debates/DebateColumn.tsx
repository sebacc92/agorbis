import { component$, useSignal, useTask$, type Signal } from "@qwik.dev/core";
import { Form, Link } from "@qwik.dev/router";
import { CharCounter } from "~/components/forms/FormShell";
import { Alert, Button, SubmitButton, Textarea, cx } from "~/components/ui";
import { routes } from "~/lib/community";
import { fetchDebateComments, usePostComment } from "~/lib/debate-actions";
import { appendDebateComments } from "~/lib/debate-comments";
import type { Cursor } from "~/lib/cursor";
import { formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { CommentCard, type DebateCommentData } from "./CommentCard";
import { AssertiveCivicToneAssistant } from "./AssertiveCivicToneAssistant";

export interface DebateColumnData {
  id: string;
  name: string;
  slug: string;
  /** Posición estable en el orden alfabético original (no cambia al filtrar). */
  position: number;
  commentCount: number;
  comments: DebateCommentData[];
  /** Hay más comentarios de los que trajimos en esta página. */
  truncated: boolean;
}

export const DebateColumn = component$<{
  column: DebateColumnData;
  debateId: string;
  /** Cuántas columnas tiene el debate, para situar la posición de ésta. */
  totalColumns: number;
  /** El usuario reside en esta columna: es la única donde puede escribir. */
  isMine: boolean;
  /** Puede votar comentarios (reside en la comunidad dueña del debate). */
  canVote: boolean;
  /** Puede reportar contenido aunque no resida en esta comunidad. */
  isAuthenticated: boolean;
  debateOpen: boolean;
  commentDraft?: Signal<string>;
}>(
  ({
    column,
    debateId,
    totalColumns,
    isMine,
    canVote,
    isAuthenticated,
    debateOpen,
    commentDraft,
  }) => {
    const locale = useLocale();
    const post = usePostComment();
    const accent = `debate-column-accent-${(column.position - 1) % 8}`;
    // El comentario tiene tope de 1000 caracteres y el navegador lo aplicaba en
    // silencio: se seguía escribiendo y las letras dejaban de entrar sin ninguna
    // señal. Mismo contador que en los formularios de creación.
    const localDraft = useSignal("");
    const draft = commentDraft ?? localDraft;
    const justPosted = useSignal(false);
    const preservedEdits = useSignal(false);
    const handledPostId = useSignal<string | null>(null);
    const comments = useSignal(column.comments);
    const initialIds = useSignal(column.comments.map((comment) => comment.id));
    const cursor = useSignal<Cursor | null>(null);
    const hasMore = useSignal(column.truncated);
    const loading = useSignal(false);
    const pageError = useSignal("");
    const pageAnnouncement = useSignal("");
    const commentsRegion = useSignal<HTMLDivElement>();

    // Una action revalida los destacados: conservar lo ya leído evita perder
    // páginas cargadas, mover tarjetas y reiniciar votos de otras personas.
    useTask$(({ track }) => {
      const incoming = track(() => column.comments);
      comments.value = appendDebateComments(comments.value, incoming);
    });

    /**
     * Vaciar el campo después de publicar.
     *
     * El `<textarea>` está atado a `draft`, y la action no desmonta el
     * componente: al volver, el comentario ya estaba en la columna **y** seguía
     * escrito abajo. Quedaba una trampa de doble publicación —tocar "Publicar"
     * otra vez parecía lo natural— que sólo frenaba el rate limit de la base,
     * con un mensaje de error por respuesta.
     */
    useTask$(({ track }) => {
      const result = track(() => post.value);
      if (
        result &&
        "posted" in result &&
        result.posted &&
        result.debateId === debateId &&
        result.columnId === column.id &&
        result.postedComment.id !== handledPostId.value
      ) {
        handledPostId.value = result.postedComment.id;
        const sentBody = post.formData?.get("body");
        preservedEdits.value = draft.value !== sentBody;
        if (!preservedEdits.value) draft.value = "";
        justPosted.value = true;
        // El nuevo aporte puede quedar fuera de los veinte destacados. La
        // respuesta confirmada lo incorpora sin obligar a recorrer el resto.
        comments.value = appendDebateComments(comments.value, [
          result.postedComment,
        ]);
      }
    });

    return (
      <section
        id={`debate-column-${column.id}`}
        /* El nombre accesible era sólo "Columna Rosario": dentro de un carrusel
         de doscientas, no decía si quedaban dos o ciento noventa. El número
         ya está a la vista para quien mira; acá lo está para quien no. */
        aria-label={translate(
          locale,
          "Columna {{position}} de {{total}}: {{name}}",
          {
            position: formatNumber(column.position, locale),
            total: formatNumber(totalColumns, locale),
            name: column.name,
          },
        )}
        /* Las pastillas de salto llaman a `focus()` sobre esta sección: sin
         `tabIndex` el navegador la ignora en silencio, así que la grilla se
         desplazaba pero el teclado seguía donde estaba y el siguiente Tab
         volvía al principio. `-1` la hace enfocable sin sumarla al orden. */
        tabIndex={-1}
        class={cx(
          "debate-column flex w-[88vw] shrink-0 snap-start flex-col overflow-hidden sm:w-96 lg:w-[26rem]",
          "rounded-2xl border border-t-4 transition-all duration-200",
          accent,
          isMine
            ? "debate-column-mine border-success-500/60 bg-success-50/30 dark:bg-success-950/20 shadow-soft"
            : "border-subtle bg-surface/80 dark:bg-muted/40 hover:shadow-md",
        )}
      >
        {/* Cabecera fija: al hacer scroll vertical se sabe siempre en qué columna estás. */}
        <header
          class={cx(
            "debate-column-header sticky top-0 z-10 flex items-start gap-3 border-b px-4 py-4 backdrop-blur-sm",
            isMine
              ? "border-success-500/30 bg-success-50/90 dark:bg-success-950/70"
              : "border-subtle bg-surface/90 dark:bg-muted/80",
          )}
        >
          <span
            aria-hidden="true"
            class="debate-column-number grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums"
          >
            {String(column.position).padStart(2, "0")}
          </span>
          <div class="min-w-0 flex-1">
            <p class="mb-0.5 text-3xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
              {translate(locale, "Perspectiva territorial")}
            </p>
            <Link
              href={routes.community(column.slug)}
              class="block text-balance text-xl font-semibold leading-tight tracking-tight text-ink-strong hover:underline sm:text-2xl"
            >
              {column.name}
            </Link>
            <p class="mt-1 text-xs text-ink-faint">
              {column.commentCount === 0
                ? translate(locale, "Todavía sin comentarios")
                : pluralize(
                    column.commentCount,
                    "comentario",
                    "comentarios",
                    locale,
                  )}
            </p>
          </div>
          {isMine && (
            <span class="shrink-0 rounded-full bg-success-500/15 px-2.5 py-1 text-2xs font-semibold text-success">
              {translate(locale, "Tu comunidad")}
            </span>
          )}
        </header>

        {/* El composer aparece sólo en la columna donde el usuario reside, y
            arriba: al pie quedaba después de hasta 60vh de comentarios, dentro
            de un carrusel, a varias pantallas de quien quería sumar el suyo. */}
        {isMine && debateOpen && (
          <Form
            action={post}
            class="space-y-2 border-b border-success-500/30 p-3"
          >
            <input type="hidden" name="debate_id" value={debateId} />
            <input type="hidden" name="column_community_id" value={column.id} />

            {post.value?.message && (
              <Alert class="text-xs">
                {translate(locale, post.value.message)}
              </Alert>
            )}

            {/* Publicar no daba ninguna señal: el comentario aparecía en algún
              lugar de una lista ordenada por puntaje —no necesariamente
              arriba, no necesariamente a la vista— y el formulario quedaba
              igual que antes. */}
            {justPosted.value && !post.value?.message && (
              <Alert tone="success" class="text-xs">
                {translate(
                  locale,
                  preservedEdits.value
                    ? "Tu comentario se publicó. Las ediciones posteriores siguen en el borrador."
                    : "Listo, tu comentario ya está en la columna.",
                )}
              </Alert>
            )}

            {/* `name` es lo que espera la action; el `id` se hace único por columna. */}
            <Textarea
              name="body"
              id={`comentario-${column.id}`}
              required
              maxLength={1000}
              aria-describedby={`comentario-${column.id}-count`}
              value={draft.value}
              onInput$={(_, el) => {
                draft.value = el.value;
                // La confirmación es del comentario anterior: en cuanto se
                // empieza a escribir el siguiente deja de ser cierta.
                justPosted.value = false;
                preservedEdits.value = false;
              }}
              rows={3}
              placeholder={translate(locale, "¿Qué se ve desde {{name}}?", {
                name: column.name,
              })}
              aria-label={translate(
                locale,
                "Escribir un comentario en la columna {{name}}",
                {
                  name: column.name,
                },
              )}
              class="min-h-20 bg-surface text-sm"
            />

            <p class="flex justify-end">
              <CharCounter
                value={draft.value}
                max={1000}
                id={`comentario-${column.id}-count`}
              />
            </p>

            <AssertiveCivicToneAssistant commentText={draft.value} />

            <SubmitButton
              variant="success"
              size="sm"
              class="w-full"
              pending={post.isRunning}
            >
              {translate(locale, "Publicar")}
            </SubmitButton>
          </Form>
        )}

        {/* Con el debate cerrado el formulario simplemente no se dibujaba: quien
          vive acá veía su columna marcada como propia y ningún lugar donde
          escribir, sin que nada explicara por qué. */}
        {isMine && !debateOpen && (
          <p class="border-b border-subtle px-3 py-3 text-center text-xs text-ink-muted">
            <span aria-hidden="true">🔒</span>{" "}
            {translate(
              locale,
              "Este debate está cerrado: ya no se aceptan comentarios nuevos.",
            )}
          </p>
        )}

        {/* La columna scrollea hasta 60vh de comentarios. */}
        <div
          ref={commentsRegion}
          role="region"
          aria-label={translate(locale, "Comentarios de {{name}}", {
            name: column.name,
          })}
          /* Sólo es un destino de teclado si hay algo que desplazar. Con
           doscientas sub-comunidades, una grilla de columnas vacías sumaba
           doscientas paradas de Tab que no llevaban a ninguna parte. */
          tabIndex={comments.value.length > 0 ? 0 : undefined}
          class="scrollbar-slim flex max-h-[60vh] flex-1 flex-col gap-2.5 overflow-y-auto p-3"
        >
          {comments.value.length === 0 ? (
            <div class="flex flex-1 flex-col items-center justify-center px-3 py-10 text-center">
              <span class="text-3xl text-ink-faint" aria-hidden="true">
                💬
              </span>
              {/* "Sé la primera persona de X en opinar" se le mostraba a todo
                el mundo, pero en una columna ajena nadie puede escribir: era
                una invitación a una acción que la propia página impide. */}
              <p class="mt-2 text-xs font-medium text-ink-muted">
                {isMine
                  ? debateOpen
                    ? translate(
                        locale,
                        "Nadie de tu comunidad escribió todavía. Estrenala vos.",
                      )
                    : translate(
                        locale,
                        "Nadie de tu comunidad llegó a escribir antes del cierre.",
                      )
                  : translate(locale, "Nadie de {{name}} escribió todavía", {
                      name: column.name,
                    })}
              </p>
            </div>
          ) : (
            comments.value.map((comment) => (
              <CommentCard
                key={comment.id}
                comment={comment}
                debateId={debateId}
                canVote={canVote}
                isAuthenticated={isAuthenticated}
              />
            ))
          )}
        </div>

        {column.truncated && (
          <div class="space-y-2 border-t border-subtle p-3">
            <p class="text-center text-xs text-ink-faint">
              {translate(
                locale,
                "Mostrando {{shown}} de {{total}} comentarios.",
                {
                  shown: formatNumber(comments.value.length, locale),
                  total: formatNumber(
                    Math.max(column.commentCount, comments.value.length),
                    locale,
                  ),
                },
              )}
            </p>
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Primero los comentarios destacados; el resto, del más reciente al más antiguo.",
              )}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              class="w-full"
              aria-disabled={loading.value || !hasMore.value}
              aria-busy={loading.value}
              onClick$={async () => {
                if (loading.value || !hasMore.value) return;
                loading.value = true;
                pageError.value = "";
                pageAnnouncement.value = "";
                try {
                  const result = await fetchDebateComments({
                    debateId,
                    columnId: column.id,
                    initialIds: initialIds.value,
                    cursor: cursor.value,
                  });
                  if (!result.ok) {
                    pageError.value = result.message;
                    return;
                  }
                  const previousLength = comments.value.length;
                  const scrollTop = commentsRegion.value?.scrollTop ?? 0;
                  const pageTop = window.scrollY;
                  comments.value = appendDebateComments(
                    comments.value,
                    result.comments,
                  );
                  cursor.value = result.cursor;
                  hasMore.value = result.hasMore;
                  pageAnnouncement.value = translate(
                    locale,
                    "Se agregaron {{count}} comentarios.",
                    {
                      count: formatNumber(
                        comments.value.length - previousLength,
                        locale,
                      ),
                    },
                  );
                  // El botón sigue montado incluso al terminar: el foco queda
                  // en él y la lectura continúa en la posición anterior.
                  requestAnimationFrame(() => {
                    if (commentsRegion.value)
                      commentsRegion.value.scrollTop = scrollTop;
                    window.scrollTo({ top: pageTop, behavior: "instant" });
                  });
                } catch {
                  pageError.value =
                    "No pudimos cargar más comentarios. Volvé a intentarlo.";
                } finally {
                  loading.value = false;
                }
              }}
            >
              {translate(
                locale,
                loading.value
                  ? "Cargando comentarios…"
                  : hasMore.value
                    ? "Cargar más comentarios"
                    : "Todos los comentarios cargados",
              )}
            </Button>
            <p role="status" aria-live="polite" class="text-xs text-ink-muted">
              {pageAnnouncement.value}
            </p>
            {pageError.value && (
              <p role="alert" class="text-xs text-danger">
                {translate(locale, pageError.value)}
              </p>
            )}
          </div>
        )}
      </section>
    );
  },
);
