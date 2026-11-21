import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Card, Chip, Icon } from "~/components/ui";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { translate, useLocale } from "~/lib/i18n";
import { routes } from "~/lib/community";
import { isClosed } from "~/lib/format";

export const QuickVoteWidget = component$<{
  poll: {
    id: string;
    question: string;
    options: (string | { label: string })[];
    status: string;
    closes_at: string | null;
  };
}>(({ poll }) => {
  const locale = useLocale();
  const expired = useSignal(false);
  // Una sola alarma de cierre; no consulta la base ni hace polling.
  // eslint-disable-next-line qwik/no-use-visible-task -- actualiza la invitación al vencer el plazo con la página abierta
  useVisibleTask$(({ track, cleanup }) => {
    const closesAt = track(() => poll.closes_at);
    expired.value = false;
    if (!closesAt || !Number.isFinite(Date.parse(closesAt))) return;
    let timeout: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const remaining = Date.parse(closesAt) - Date.now();
      if (remaining <= 0) {
        expired.value = true;
        return;
      }
      timeout = setTimeout(schedule, Math.min(remaining, 2_147_483_647));
    };
    schedule();
    cleanup(() => clearTimeout(timeout));
  });

  if (!poll.closes_at || expired.value || isClosed(poll.closes_at, poll.status))
    return null;

  const options: string[] = Array.isArray(poll.options)
    ? poll.options.map((o) => (typeof o === "string" ? o : o.label))
    : [];

  return (
    <Card
      accent={CONTENT_KIND_TONES.poll.accent}
      class="relative overflow-hidden p-5 sm:p-6"
    >
      <div class="flex items-center justify-between gap-2">
        {/* El tipo con su color e ícono, como en cualquier tarjeta (D123). */}
        <Chip
          variant="badge"
          icon="ballot"
          toneClass={CONTENT_KIND_TONES.poll.badge}
        >
          {translate(locale, "Encuesta abierta")}
        </Chip>
        <span class="text-xs text-ink-faint">
          {translate(locale, "Resultados al cierre")}
        </span>
      </div>

      <h3 class="mt-3 font-display text-display-xs text-ink-strong">
        {poll.question}
      </h3>

      {/* Las opciones tienen la anatomía de la tarjeta de votar del detalle
          (D125): fila de 48 px, número en círculo, texto completo y un
          chevron propio en vez de la flecha tipográfica. Siguen siendo
          enlaces al detalle: acá no se vota (D68). `grid-cols-1`: la
          columna implícita crecía con la frase más larga y a 390 px cortaba
          58 px de cada opción. */}
      <ol class="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.slice(0, 4).map((option, idx) => (
          <li key={`opt-${idx}`}>
            <Link
              href={routes.poll(poll.id)}
              class="group flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-subtle bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-kind-poll hover:bg-kind-poll-bg focus-visible:border-kind-poll sm:text-base touch-manipulation"
            >
              <span
                class="grid size-7 shrink-0 place-items-center rounded-full bg-kind-poll-bg font-display text-xs font-bold tabular-nums text-kind-poll-text"
                aria-hidden="true"
              >
                {idx + 1}
              </span>
              <span dir="auto" class="ugc-text min-w-0 flex-1 font-medium">
                {option}
              </span>
              <Icon
                name="chevron-right"
                class="shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ol>

      {/* Sin promesas de anonimato ni de verificabilidad: D68 y la política de
          privacidad describen límites concretos que una frase corta no cubre. */}
      <div class="mt-4 flex items-center justify-end border-t border-subtle pt-3 text-xs text-ink-muted">
        <Link
          href={routes.poll(poll.id)}
          class="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-brand transition-colors hover:bg-muted hover:underline touch-manipulation"
        >
          {translate(locale, "Votar en esta encuesta")}
          <Icon name="arrow-right" class="text-sm" />
        </Link>
      </div>
    </Card>
  );
});
