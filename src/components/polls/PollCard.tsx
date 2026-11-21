import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Badge, Card, Icon, cx } from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { routes } from "~/lib/community";
import { POLL_CATEGORY_BY_KEY, POLL_TYPE_LABEL } from "~/lib/constants";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import type { PollCategory, PollType } from "~/lib/database.types.helpers";
import { countdown, isClosed, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface PollCardData {
  id: string;
  question: string;
  description: string | null;
  type: PollType;
  category: PollCategory;
  status: string;
  closes_at: string | null;
  created_at: string;
  option_count: number;
  total_votes: number;
  has_voted: boolean;
  can_see: boolean;
  community?: { name: string; emoji: string | null; slug: string } | null;
}

/** Menos de un día para el cierre: deja de ser un dato y pasa a ser un aviso. */
const CLOSING_SOON_MS = 86_400_000;

const tones = CONTENT_KIND_TONES.poll;

export const PollCard = component$<{
  poll: PollCardData;
  showCommunity?: boolean;
}>(({ poll, showCommunity = false }) => {
  const locale = useLocale();
  const closed = isClosed(poll.closes_at, poll.status);
  const remaining = countdown(poll.closes_at, locale);
  /**
   * "Cierra en 3 días" y "Cierra en 2 horas" se veían exactamente igual: mismo
   * color, mismo tamaño, misma posición. La única ventana en la que todavía se
   * puede hacer algo —el último día— no se distinguía de la que sobra.
   */
  const closingSoon =
    !closed &&
    !!poll.closes_at &&
    new Date(poll.closes_at).getTime() - Date.now() < CLOSING_SOON_MS;

  return (
    /* Tarjeta plana con la franja del tipo (D123): el azul de "encuesta" se
       reconoce antes de leer, y la elevación aparece sólo al pasar por encima. */
    <Card
      interactive
      accent={tones.accent}
      class={cx(
        "group h-full overflow-hidden active:scale-[0.98] touch-manipulation",
        closingSoon &&
          "border-accent-500/40 ring-1 ring-accent-500/25 dark:border-accent-500/35",
      )}
    >
      <Link
        href={routes.poll(poll.id)}
        class="flex h-full flex-col rounded-2xl p-5 touch-target"
      >
        {/* Una sola línea de meta: tipo de pregunta, categoría y, fuera de su
            comunidad, de dónde viene. El estado baja al pie para no repetirse. */}
        <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <Badge tone={poll.type === "binary" ? "brand" : "neutral"}>
            {translate(locale, POLL_TYPE_LABEL[poll.type])}
          </Badge>
          <span class="inline-flex items-center gap-1">
            {/* La categoría es de la app, no de la persona: ícono propio (D125). */}
            <Icon
              name={POLL_CATEGORY_BY_KEY[poll.category].icon}
              class="text-[1.1em] text-ink-faint"
            />
            {translate(locale, POLL_CATEGORY_BY_KEY[poll.category].label)}
          </span>
          {showCommunity && poll.community && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {poll.community.emoji} {poll.community.name}
              </span>
            </>
          )}
          <span class="ml-auto text-ink-faint">
            <RelativeTime value={poll.created_at} />
          </span>
        </div>

        <h3
          dir="auto"
          class="font-display text-display-xs text-ink-strong transition-colors group-hover:text-brand"
        >
          {poll.question}
        </h3>

        {poll.description && (
          <p
            dir="auto"
            class="ugc-text mt-2 line-clamp-2 text-base text-ink-muted"
          >
            {poll.description}
          </p>
        )}

        {/* Un solo pie: estado a la izquierda, llamada a la derecha. La
            pastilla "Encuesta abierta · Ver encuesta →" repetía la insignia
            de arriba y el enlace de abajo (décima ronda, mejora 6). */}
        <div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-4 text-sm">
          <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
            {closed ? (
              <span class="inline-flex items-center gap-1 font-medium">
                <Icon name="lock" />
                {translate(locale, "Cerrada")}
              </span>
            ) : remaining ? (
              <span
                class={cx(
                  "inline-flex items-center gap-1 font-medium",
                  closingSoon
                    ? "animate-pulse font-semibold text-accent"
                    : tones.text,
                )}
              >
                <Icon name={closingSoon ? "alert" : "clock"} />
                {remaining}
              </span>
            ) : (
              <span
                class={cx(
                  "inline-flex items-center gap-1 font-medium",
                  tones.text,
                )}
              >
                <Icon name="ballot" />
                {translate(locale, "Abierta")}
              </span>
            )}
            {poll.has_voted && (
              <span class="inline-flex items-center gap-1 font-medium text-success animate-scale-pop">
                <Icon name="check" />
                {translate(locale, "Ya votaste")}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {pluralize(poll.option_count, "opción", "opciones", locale)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {poll.can_see
                ? pluralize(poll.total_votes, "voto", "votos", locale)
                : translate(
                    locale,
                    closed
                      ? "Sin resultados por baja participación"
                      : "Resultados al cierre",
                  )}
            </span>
          </span>
          <span
            class={cx(
              "inline-flex items-center gap-1 font-medium",
              !poll.has_voted && closingSoon
                ? "font-semibold text-accent"
                : "text-brand",
            )}
          >
            {poll.can_see
              ? translate(locale, "Ver resultados")
              : closed || poll.has_voted
                ? translate(locale, "Ver encuesta")
                : closingSoon
                  ? translate(locale, "¡Últimas horas para votar!")
                  : translate(locale, "Ver encuesta")}
            <Icon
              name="arrow-right"
              class="transition-transform group-hover:translate-x-1"
            />
          </span>
        </div>
      </Link>
    </Card>
  );
});
