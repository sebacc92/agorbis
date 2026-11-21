import { publicProfileHref } from "~/lib/public-profile";
import { component$, useSignal } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { ReportButton } from "~/components/moderation/ReportButton";
import { Avatar, cx } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { showToast } from "~/components/ui/Toast";
import { voteComment } from "~/lib/debate-actions";
import {
  debateCommentHref,
  debateCommentLoginHref,
} from "~/lib/debate-comment-link";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface DebateCommentData {
  id: string;
  body: string;
  score: number;
  created_at: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  /** -1, 0 o 1 según lo que ya votó el visitante. */
  myVote: -1 | 0 | 1;
}

export const CommentCard = component$<{
  comment: DebateCommentData;
  debateId: string;
  canVote: boolean;
  isAuthenticated: boolean;
}>(({ comment, debateId, canVote, isAuthenticated }) => {
  const locale = useLocale();
  const location = useLocation();
  // Estado local por tarjeta: votar en un comentario no debe congelar el resto.
  const score = useSignal(comment.score);
  const myVote = useSignal<-1 | 0 | 1>(comment.myVote);
  const error = useSignal("");
  const busy = useSignal(false);
  const permalink = debateCommentHref(debateId, comment.id);
  /**
   * El puntaje cambia solo, sin recargar y sin mover el foco: quien no ve la
   * pantalla tocaba el botón y no pasaba nada perceptible. El `aria-label` del
   * número tampoco sirve —cambiar un nombre accesible no dispara ningún
   * anuncio—, así que el resultado se publica acá. Arranca vacío para no leer
   * los puntajes de toda la columna al cargar la página.
   */
  const announcement = useSignal("");

  // Las "reacciones cívicas" que había acá vivían sólo en localStorage y
  // avisaban "Aporte registrado" sin que nadie más las viera: se retiraron.
  // El voto a favor/en contra de abajo sí llega a la base.

  const name =
    comment.author?.display_name ??
    comment.author?.username ??
    translate(locale, "Cuenta eliminada");

  return (
    <article
      id={`comment-${comment.id}`}
      tabIndex={-1}
      class="relative scroll-mt-24 rounded-2xl border border-subtle border-l-4 border-l-brand-500/30 bg-surface p-3.5 shadow-soft transition-all duration-150 hover:border-l-brand-500 hover:shadow-lift target:ring-2 target:ring-brand-500"
    >
      <header class="flex items-center gap-2">
        <Avatar src={comment.author?.avatar_url} name={name} size="sm" />
        <div class="min-w-0 flex-1">
          {/* Sin cuenta detrás no hay a dónde ir: un comentario de alguien
              dado de baja muestra el nombre y nada más. */}
          {comment.author ? (
            <Link
              href={publicProfileHref(comment.author)}
              dir="auto"
              class="block truncate text-xs font-medium text-ink-strong hover:text-brand hover:underline"
            >
              {name}
            </Link>
          ) : (
            <p dir="auto" class="truncate text-xs font-medium text-ink-strong">
              {name}
            </p>
          )}
          {comment.author && (
            <p class="truncate text-2xs text-ink-faint">
              @{comment.author.username}
            </p>
          )}
        </div>
        <RelativeTime
          value={comment.created_at}
          class="shrink-0 text-2xs text-ink-faint"
        />
      </header>

      <p
        dir="auto"
        class="ugc-text mt-2.5 whitespace-pre-line text-[0.90625rem] leading-[1.65] tracking-[-0.01em] text-ink break-words selection:bg-brand-500/20"
      >
        {comment.body}
      </p>

      <footer class="mt-3 flex items-center gap-1">
        {(
          [
            [1, "Votar a favor", "M12 5l7 8H5l7-8z"],
            [-1, "Votar en contra", "M12 19l-7-8h14l-7 8z"],
          ] as const
        ).map(([value, label, path]) =>
          !isAuthenticated ? (
            <a
              key={value}
              href={debateCommentLoginHref(location.url, debateId, comment.id)}
              aria-label={`${translate(locale, label)} — ${translate(locale, "Iniciá sesión para votar")}`}
              title={translate(locale, "Iniciá sesión para votar")}
              class="touch-target grid size-8 place-items-center rounded-xl text-ink-faint transition-all duration-150 hover:bg-muted hover:text-ink-strong active:scale-90 touch-manipulation"
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={path} />
              </svg>
            </a>
          ) : (
            <button
              key={value}
              type="button"
              disabled={(isAuthenticated && !canVote) || busy.value}
              aria-label={
                canVote
                  ? translate(locale, label)
                  : `${translate(locale, label)} — ${translate(
                      locale,
                      "Sólo pueden votar quienes viven en esta comunidad",
                    )}`
              }
              aria-pressed={myVote.value === value}
              title={
                canVote
                  ? translate(locale, label)
                  : translate(
                      locale,
                      "Sólo pueden votar quienes viven en esta comunidad",
                    )
              }
              class={cx(
                // 32 px de dibujo, 44 px de área tocable con el dedo: es el
                // control que más se usa del debate y el más chico de la app.
                "touch-target grid size-8 place-items-center rounded-xl transition-all duration-150 active:scale-90 touch-manipulation",
                myVote.value === value
                  ? value === 1
                    ? "bg-success-500/20 text-success ring-1 ring-success-500/35 scale-105 shadow-xs"
                    : "bg-danger-500/15 text-danger ring-1 ring-danger-500/35 scale-105 shadow-xs"
                  : "text-ink-faint hover:bg-muted hover:text-ink-strong",
                isAuthenticated &&
                  !canVote &&
                  "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
              onClick$={async () => {
                if (!canVote || busy.value) return;
                busy.value = true;
                error.value = "";

                // Al tocar el mismo botón se retira el voto.
                const next = myVote.value === value ? 0 : value;
                const previous = myVote.value;
                myVote.value = next; // optimista

                try {
                  const result = await voteComment(comment.id, next);
                  if (result.ok) {
                    score.value = result.score;
                    myVote.value = result.value as -1 | 0 | 1;
                    announcement.value = translate(
                      locale,
                      result.value === 0
                        ? "Voto retirado. Puntaje {{score}}"
                        : result.value === 1
                          ? "Votaste a favor. Puntaje {{score}}"
                          : "Votaste en contra. Puntaje {{score}}",
                      { score: formatNumber(result.score, locale) },
                    );
                  } else {
                    myVote.value = previous;
                    error.value = result.message;
                    announcement.value = "";
                  }
                } catch {
                  // El corte puede ocurrir después de escribir en la base: no
                  // afirmamos que se perdió ni dejamos bloqueado el reintento.
                  myVote.value = previous; // rollback
                  error.value =
                    "No pudimos confirmar tu voto. Volvé a intentarlo o recargá para ver el estado actual.";
                  announcement.value = "";
                } finally {
                  busy.value = false;
                }
              }}
            >
              <svg
                viewBox="0 0 24 24"
                class="size-4"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d={path} />
              </svg>
            </button>
          ),
        )}

        <span
          class={cx(
            "ml-0.5 text-xs font-semibold tabular-nums",
            score.value > 0
              ? "text-success"
              : score.value < 0
                ? "text-danger"
                : "text-ink-faint",
          )}
          title={translate(locale, "Votos a favor menos votos en contra")}
          aria-label={translate(locale, "Puntaje {{score}}", {
            score: formatNumber(score.value, locale),
          })}
        >
          {score.value > 0
            ? `+${formatNumber(score.value, locale)}`
            : formatNumber(score.value, locale)}
        </span>

        {error.value && (
          <span role="alert" class="ml-2 text-2xs text-danger">
            {translate(locale, error.value)}
          </span>
        )}

        <span role="status" aria-live="polite" class="sr-only">
          {announcement.value}
        </span>

        <div class="ml-auto">
          <ReportButton
            targetType="debate_comment"
            targetId={comment.id}
            isAuthenticated={isAuthenticated}
          />
        </div>
      </footer>

      <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <a
          href={permalink}
          class="inline-flex min-h-11 items-center rounded-lg px-2 text-brand hover:bg-muted hover:underline"
        >
          {translate(locale, "Enlace al comentario")}
        </a>
        <button
          type="button"
          class="inline-flex min-h-11 items-center rounded-lg px-2 hover:bg-muted hover:text-ink-strong"
          onClick$={async () => {
            try {
              await navigator.clipboard.writeText(
                new URL(permalink, window.location.origin).href,
              );
              showToast(
                translate(locale, "Enlace al comentario copiado."),
                "success",
              );
            } catch {
              showToast(
                translate(
                  locale,
                  "No pudimos copiar el enlace. Podés abrir el enlace al comentario y copiar su dirección.",
                ),
                "danger",
              );
            }
          }}
        >
          {translate(locale, "Copiar enlace al comentario")}
        </button>
      </div>
    </article>
  );
});
