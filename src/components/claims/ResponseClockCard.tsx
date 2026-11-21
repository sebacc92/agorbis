import {
  component$,
  useSignal,
  useVisibleTask$,
  type ClassList,
} from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Icon, Card, ProgressBar, cx } from "~/components/ui";
import {
  escalationThreshold,
  responseClock,
  type ClaimClockFields,
} from "~/lib/claim-escalation";
import { routes } from "~/lib/community";
import type { CommunityRef } from "~/lib/community";
import { formatInstant, formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { observeClaimResponseClock } from "~/lib/claim-clock-observer";

/**
 * El reloj de respuesta de un reclamo (D58), visible desde el día uno.
 *
 * La cuenta regresiva no es decoración: es el compromiso que la plataforma
 * hace explícito. Mientras corre, dice cuánto falta y cuánto apoyo necesita
 * para poder escalar; cuando vence sin respuesta, el silencio pasa a ser el
 * dato principal de la tarjeta.
 */
interface ResponseClockProps {
  claim: ClaimClockFields & { support_count: number };
  community: CommunityRef;
  /** Miembros de la comunidad: define el umbral de apoyo. */
  memberCount: number;
  /** Comunidad padre donde ya se muestra, si escaló. */
  escalatedTo: CommunityRef | null;
  class?: ClassList;
}

export const ResponseClockCard = component$<ResponseClockProps>((props) => {
  if (responseClock(props.claim).state === "none") return null;
  return <LiveResponseClockCard {...props} />;
});

const LiveResponseClockCard = component$<ResponseClockProps>((props) => {
  const now = useSignal(Date.now());
  // eslint-disable-next-line qwik/no-use-visible-task -- reloj y eventos del navegador, sin polling ni escrituras
  useVisibleTask$(
    ({ track, cleanup }) => {
      const current = track(() => props.claim);
      cleanup(observeClaimResponseClock(current, (time) => (now.value = time)));
    },
    { strategy: "document-ready" },
  );
  const { claim, community, memberCount, escalatedTo, class: cls } = props;
  const locale = useLocale();
  const timeZone = useTimeZone();
  const clock = responseClock(claim, new Date(now.value));
  if (clock.state === "none") return null;

  const threshold = escalationThreshold(memberCount);
  const missing = Math.max(0, threshold - claim.support_count);
  const dueDate = claim.response_due_at
    ? formatInstant(claim.response_due_at, locale, timeZone)
    : null;

  // Cada estado se dibuja con su propio tono: el vencido tiene que verse
  // distinto del que todavía está en plazo, sin necesidad de leer.
  const tone = {
    waiting: "border-subtle",
    overdue: "border-warn-400/50 bg-warn-400/5",
    escalated: "border-brand-500/40 bg-brand-50 dark:bg-brand-950/40",
    answered: "border-success-500/40 bg-success-500/5",
  }[clock.state];

  return (
    // Plana y sin subir al pasar el mouse: no es clicable, y la elevación
    // queda para lo que sí lo es (D123).
    <Card class={cx("animate-fade-in p-5", tone, cls as string)}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="flex items-center gap-1.5 text-xs uppercase tracking-wide text-ink-faint">
            <Icon name="clock" class="text-sm" />
            <span>{translate(locale, "Reloj de respuesta")}</span>
          </p>

          <div role="status" aria-live="polite" aria-atomic="true">
            {clock.state === "answered" && (
              <p class="mt-1 font-semibold text-success">
                {translate(locale, "Una institución acusó recibo")}
              </p>
            )}

            {clock.state === "waiting" && (
              <p class="mt-1 font-semibold text-ink-strong tabular-nums">
                {clock.days === 1
                  ? translate(locale, "Queda 1 día para que respondan")
                  : translate(
                      locale,
                      "Quedan {{count}} días para que respondan",
                      {
                        count: clock.days,
                      },
                    )}
              </p>
            )}

            {clock.state === "overdue" && (
              <p class="mt-1 font-semibold text-warn tabular-nums">
                {clock.days === 0
                  ? translate(locale, "El plazo para responder terminó.")
                  : clock.days === 1
                    ? translate(locale, "1 día sin respuesta")
                    : translate(locale, "{{count}} días sin respuesta", {
                        count: clock.days,
                      })}
              </p>
            )}

            {clock.state === "escalated" && (
              <p class="mt-1 font-semibold text-brand">
                {translate(locale, "Escalado por falta de respuesta")}
              </p>
            )}
          </div>
        </div>

        {dueDate && clock.state !== "answered" && (
          /* `min-w-0`, no `shrink-0`: a 320 px la fecha completa no entra en
             una línea y el párrafo desbordaba la página entera. El tiempo
             verbal sigue al estado: mientras corre el plazo la fecha todavía
             no llegó, y "Vencía" contradecía al "Quedan N días" de al lado.
             El dato y el cálculo son los mismos. */
          <p class="min-w-0 text-xs text-ink-muted tabular-nums">
            {clock.state === "waiting"
              ? translate(locale, "Vence el {{date}}", { date: dueDate })
              : translate(locale, "Vencía el {{date}}", { date: dueDate })}
          </p>
        )}
      </div>

      {/* Explicación del estado. Se evita el tono acusatorio: el dato es que
          nadie contestó, no que alguien sea culpable. */}
      <p class="mt-2 text-sm text-ink-muted">
        {clock.state === "answered" &&
          translate(
            locale,
            "El reloj se detuvo. Seguí la línea de tiempo para ver cómo avanza.",
          )}
        {clock.state === "waiting" &&
          translate(
            locale,
            "Las instituciones de {{name}} tienen este plazo para acusar recibo. Si nadie lo hace, el reclamo puede subir de nivel.",
            { name: community.name },
          )}
        {clock.state === "overdue" &&
          translate(
            locale,
            "Nadie acusó recibo dentro del plazo de {{name}}.",
            { name: community.name },
          )}
        {clock.state === "escalated" &&
          escalatedTo &&
          translate(
            locale,
            "Además de {{from}}, ahora se muestra en {{to}}. Sigue perteneciendo a donde ocurre el problema.",
            { from: community.name, to: escalatedTo.name },
          )}
      </p>

      {/* El estado "con respuesta" contaba que el reloj se detuvo y mandaba a
          "seguí la línea de tiempo" sin decir dónde está: en un teléfono queda
          a dos pantallas de scroll por debajo de esta tarjeta. */}
      {clock.state === "answered" && (
        <a
          href="#seguimiento-reclamo"
          class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline hover:translate-x-0.5 active:scale-95 touch-manipulation transition-all duration-150"
        >
          <span>{translate(locale, "Ver el seguimiento")}</span>{" "}
          <Icon name="chevron-down" class="text-sm" />
        </a>
      )}

      {clock.state === "escalated" && escalatedTo && (
        <Link
          href={`${routes.community(escalatedTo.slug)}/reclamos`}
          class="mt-3 inline-flex text-sm font-medium text-brand hover:underline hover:translate-x-0.5 active:scale-95 touch-manipulation transition-all duration-150"
        >
          {translate(locale, "Ver los reclamos elevados de {{name}}", {
            name: escalatedTo.name,
          })}
          <Icon name="arrow-right" class="ml-1 text-sm" />
        </Link>
      )}

      {/* Con la ventana vencida, lo único que falta para escalar es apoyo:
          mostrar cuánto convierte una espera opaca en algo accionable. */}
      {clock.state === "overdue" && missing > 0 && (
        <div class="mt-3">
          <ProgressBar
            value={claim.support_count}
            max={threshold}
            label="Apoyo necesario para escalar"
            tone="brand"
            valueText={translate(locale, "{{current}} de {{total}} apoyos", {
              current: formatNumber(claim.support_count, locale),
              total: formatNumber(threshold, locale),
            })}
          />
          <p class="mt-1.5 text-xs text-ink-muted tabular-nums">
            {missing === 1
              ? translate(
                  locale,
                  "Falta 1 apoyo para que suba a la comunidad superior.",
                )
              : translate(
                  locale,
                  "Faltan {{count}} apoyos para que suba a la comunidad superior.",
                  { count: missing },
                )}
          </p>
        </div>
      )}

      {/* La barra existía sólo en el estado vencido, o sea cuando ya no se
          puede hacer nada más que esperar el cron. El apoyo se junta **antes**:
          verla desde el día uno es lo que convierte "esperemos" en "faltan
          cuatro vecinos". */}
      {clock.state === "waiting" && missing > 0 && (
        <div class="mt-3">
          <ProgressBar
            value={claim.support_count}
            max={threshold}
            label="Apoyo necesario para escalar"
            tone="brand"
            valueText={translate(locale, "{{current}} de {{total}} apoyos", {
              current: formatNumber(claim.support_count, locale),
              total: formatNumber(threshold, locale),
            })}
          />
          <p class="mt-1.5 text-xs text-ink-muted tabular-nums">
            {missing === 1
              ? translate(
                  locale,
                  "Si vence el plazo sin respuesta, falta 1 apoyo para que suba de nivel.",
                )
              : translate(
                  locale,
                  "Si vence el plazo sin respuesta, faltan {{count}} apoyos para que suba de nivel.",
                  { count: missing },
                )}
          </p>
        </div>
      )}

      {clock.state === "waiting" && missing === 0 && (
        <p class="mt-3 text-xs text-ink-muted">
          {translate(
            locale,
            "Ya tiene el apoyo necesario. Si vence sin respuesta, se revisa si corresponde subirlo de nivel.",
          )}
        </p>
      )}

      {clock.state === "overdue" && missing === 0 && (
        <p class="mt-3 text-xs text-ink-muted">
          {translate(
            locale,
            "Ya tiene el apoyo necesario. El escalado se confirma después de la revisión del reclamo.",
          )}
        </p>
      )}
    </Card>
  );
});
