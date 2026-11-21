import { component$, useComputed$, useSignal, useTask$ } from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import { Alert, Card, SubmitButton, buttonClass } from "~/components/ui";
import type { useClosePoll } from "~/lib/content-actions";
import { formatInstant } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";

/**
 * Cerrar la votación antes de tiempo.
 *
 * Va en dos pasos y no como un botón suelto porque no hay vuelta atrás: en una
 * cerrar puede publicar el recuento si se alcanzó el umbral, y reabrirla
 * dejaría votar a quien ya lo vio. Por eso la acción no ofrece reabrir.
 *
 * Sólo aparece mientras la encuesta sigue abierta: sobre una ya cerrada el
 * control no haría nada y sólo agregaría ruido a la página.
 */
export const ClosePollButton = component$<{
  close: ReturnType<typeof useClosePoll>;
  pollId: string;
  /** Autor o moderación; es el mismo criterio que la policy de la base. */
  canManage: boolean;
  /** Ya cerrada, por fecha o a mano. */
  isClosed: boolean;
  /** Cuándo se cierra sola, si tiene plazo. */
  closesAt?: string | null;
  /**
   * Dentro del panel único de autor (D124): sin su propio título ni tarjeta,
   * que ya los pone la página. Suelto, se dibuja como siempre.
   */
  embedded?: boolean;
}>(({ close, pollId, canManage, isClosed, closesAt, embedded = false }) => {
  const locale = useLocale();
  const timeZone = useTimeZone();
  const isMine = useComputed$(() => close.formData?.get("id") === pollId);
  const expanded = useSignal(isMine.value && !!close.value?.failed);
  const panel = useSignal<HTMLDetailsElement>();
  // El estado de la acción sólo abre un rechazo. Una revalidación o el reloj
  // no deben pisar la apertura que hizo la persona con el summary nativo.
  useTask$(({ track }) => {
    const result = track(() => close.value);
    if (
      result?.failed &&
      close.formData?.get("id") === pollId &&
      !close.isRunning
    ) {
      expanded.value = true;
    }
  });
  const confirmed = useComputed$(
    () => isMine.value && close.value?.closed === true,
  );
  if (!canManage || (isClosed && !confirmed.value)) return null;

  const body = (
    <>
      {confirmed.value ? (
        <p role="status" class="text-sm text-success">
          {translate(locale, "La encuesta se cerró.")}
        </p>
      ) : (
        <>
          {isMine.value && close.value?.message && (
            <Alert class="mb-3">{translate(locale, close.value.message)}</Alert>
          )}

          <p class="text-sm font-medium text-ink-strong">
            {translate(locale, "Cerrar la votación")}
          </p>
          <p class="mt-1 text-xs text-ink-muted">
            {translate(
              locale,
              "Deja de aceptar votos. Publica los resultados sólo si participaron al menos 5 personas; con menos, siguen protegidos. No se puede reabrir.",
            )}
          </p>

          {/* Un cierre que no se puede deshacer se pedía sin recordar que en
            tres días iba a pasar solo. Quien mira este panel casi siempre está
            decidiendo entre "cerrar ahora" y "esperar", y el dato que falta
            para esa decisión es exactamente la fecha. */}
          {closesAt && (
            <p class="mt-1 text-xs text-ink-faint">
              {translate(
                locale,
                "Si no hacés nada, se cierra sola el {{date}}.",
                {
                  date: formatInstant(closesAt, locale, timeZone),
                },
              )}
            </p>
          )}

          <details
            ref={panel}
            open={expanded.value}
            onToggle$={(_, element) => {
              expanded.value = element.open;
            }}
            class="mt-3"
          >
            <summary class="cursor-pointer text-sm font-semibold text-brand">
              {translate(locale, "Cerrar la votación")}
            </summary>
            <Form action={close} class="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={pollId} />
              <SubmitButton
                variant="danger"
                size="sm"
                pending={close.isRunning && isMine.value}
              >
                {translate(locale, "Sí, cerrar la votación")}
              </SubmitButton>
              <a
                href={`/encuestas/${pollId}`}
                preventdefault:click
                class={buttonClass("ghost", "sm")}
                onClick$={() => {
                  // Cerrar también el elemento: si el toggle nativo abrió el
                  // panel antes de que la señal lo supiera, volver la señal a
                  // false no cambia nada y el panel quedaba abierto (D124).
                  expanded.value = false;
                  if (panel.value) panel.value.open = false;
                }}
              >
                {translate(locale, "Cancelar")}
              </a>
            </Form>
          </details>
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div class="py-3 first:pt-0 last:pb-0" data-author-action="close">
        {body}
      </div>
    );
  }

  return (
    <section class="mt-8" aria-labelledby={`cierre-${pollId}`}>
      <h2
        id={`cierre-${pollId}`}
        class="text-xs font-semibold uppercase tracking-wide text-ink-faint"
      >
        {translate(locale, "Zona del autor")}
      </h2>

      <Card class="mt-2 p-4">{body}</Card>
    </section>
  );
});
