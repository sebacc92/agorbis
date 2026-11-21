import {
  component$,
  useComputed$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Form, useLocation } from "@qwik.dev/router";
import {
  Alert,
  Badge,
  Card,
  SubmitButton,
  buttonClass,
  triggerHapticFeedback,
} from "~/components/ui";
import { useRemoveOwnContent } from "~/lib/content-actions";
import type { ContentType } from "~/lib/database.types.helpers";
import { CONTENT_TYPES } from "~/lib/quota";
import { useLocale, translate } from "~/lib/i18n";

/** El cupo vuelve sólo si la baja ocurre dentro de las 24 horas (D-cuotas). */
const REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Dar de baja una publicación propia.
 *
 * La base soporta esto desde la migración de cuotas —la policy deja al autor
 * actualizar su fila, el trigger `stamp_removal` sella quién y cuándo, y
 * `quota_remaining` devuelve el cupo si pasó menos de un día—, y la propia
 * interfaz lo prometía en dos lugares: el pie de la grilla de cupo y el panel
 * de confirmación que se lee justo antes de publicar. Lo que faltaba era el
 * botón: no había ninguna forma de bajar algo propio, ni de corregir un título
 * mal escrito que ya estaba publicado.
 *
 * Es irreversible para el autor (restaurar queda del lado de moderación), así
 * que va en dos pasos y dice de antemano si el cupo vuelve o no. Ese dato es lo
 * que decide de verdad: bajar un reclamo recién publicado no cuesta nada, y
 * bajar el del mes pasado se lleva el cupo puesto.
 */
export const RemoveContentButton = component$<{
  type: ContentType;
  id: string;
  /** Sólo el autor: moderación tiene su propia cola. */
  isAuthor: boolean;
  createdAt: string;
  /** A dónde volver cuando la publicación deje de existir. */
  backHref: string;
  /**
   * Dentro del panel único de autor (D124): sin su propio título ni tarjeta.
   * Suelto, se dibuja como siempre.
   */
  embedded?: boolean;
}>(({ type, id, isAuthor, createdAt, backHref, embedded = false }) => {
  const locale = useLocale();
  const remove = useRemoveOwnContent();
  const location = useLocation();
  const isMine = useComputed$(
    () =>
      remove.formData?.get("id") === id &&
      remove.formData?.get("type") === type,
  );
  const error = useComputed$(() =>
    isMine.value && !remove.isRunning ? remove.value?.message : undefined,
  );
  const pending = useComputed$(() => remove.isRunning && isMine.value);
  const confirming = useSignal(!!error.value);
  const panel = useSignal<HTMLDetailsElement>();
  const panelTarget = useSignal(`${type}:${id}`);
  const cancelHref = useComputed$(() => {
    const destination = new URL(location.url);
    destination.searchParams.delete("qaction");
    // Un fragmento solo no recarga el HTML. Alternar el marcador permite
    // cancelar también una segunda vez sin ejecutar la acción de baja.
    const target = `${type}:${id}`;
    if (destination.searchParams.get("cancelar_baja") === target) {
      destination.searchParams.delete("cancelar_baja");
    } else {
      destination.searchParams.set("cancelar_baja", target);
    }
    destination.hash = `baja-${id}`;
    return destination.pathname + destination.search + destination.hash;
  });
  useTask$(({ track }) => {
    const target = track(() => `${type}:${id}`);
    const message = track(() => error.value);
    if (target !== panelTarget.value) {
      panelTarget.value = target;
      confirming.value = false;
    }
    if (message) confirming.value = true;
  });

  if (!isAuthor) return null;

  const meta = CONTENT_TYPES[type];
  /**
   * El reloj se relee en el cliente.
   *
   * Se calculaba una sola vez, durante el SSR, y este panel dice si el cupo
   * vuelve o no —el dato que decide si conviene bajar la publicación ahora o
   * no bajarla—. Con la pestaña abierta un rato, la ventana de 24 h podía
   * vencer mientras el texto seguía prometiendo la devolución. Se refresca al
   * hidratar y otra vez al abrir la confirmación, que es cuando se lee.
   */
  const now = useSignal(Date.now());
  // eslint-disable-next-line qwik/no-use-visible-task -- el reloj que vale es el del cliente
  useVisibleTask$(() => {
    now.value = Date.now();
  });
  const refunds = useComputed$(
    () => now.value - new Date(createdAt).getTime() < REFUND_WINDOW_MS,
  );

  const body = (
    <>
      {error.value && (
        <Alert class="mb-3">{translate(locale, error.value)}</Alert>
      )}
      <p class="mb-3 text-sm text-ink-muted">
        {refunds.value
          ? translate(
              locale,
              "Si te equivocaste, podés darlo de baja y recuperar el cupo: quedan menos de 24 horas para eso.",
            )
          : translate(
              locale,
              "Podés darlo de baja. Pasadas las 24 horas de publicado, el cupo del mes no vuelve.",
            )}
      </p>
      <details
        ref={panel}
        open={confirming.value}
        onToggle$={(_, details) => {
          confirming.value = details.open;
          if (details.open) now.value = Date.now();
        }}
      >
        <summary
          aria-controls={`baja-confirmacion-${id}`}
          class={buttonClass("secondary", "sm", "w-fit cursor-pointer")}
          onClick$={() => triggerHapticFeedback("warning")}
        >
          {translate(locale, "Dar de baja")}
        </summary>
        <div
          id={`baja-confirmacion-${id}`}
          class="mt-3 animate-fade-in space-y-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-bold text-ink-strong">
              {translate(locale, "¿Dar de baja {{article}} {{type}}?", {
                article: translate(locale, meta.article),
                type: translate(locale, meta.singular),
              })}
            </p>
            <Badge tone={refunds.value ? "success" : "warn"}>
              {refunds.value
                ? translate(locale, "✓ Cupo reintegrable")
                : translate(locale, "Cupo mensual retenido")}
            </Badge>
          </div>
          <p class="text-sm text-ink-muted leading-relaxed">
            {translate(
              locale,
              "Deja de verse para todo el mundo. No podés restaurarlo vos: si te arrepentís, tiene que hacerlo moderación.",
            )}{" "}
            {refunds.value
              ? translate(
                  locale,
                  "Como lo publicaste hace menos de 24 horas, el cupo vuelve.",
                )
              : translate(
                  locale,
                  "Pasaron más de 24 horas desde que lo publicaste, así que el cupo de este mes no vuelve.",
                )}
          </p>
          <Form action={remove} class="mt-4 flex flex-wrap gap-2">
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={backHref} />
            <SubmitButton
              variant="danger"
              size="sm"
              pending={pending.value}
              class="active:scale-95 touch-manipulation"
            >
              {translate(locale, "Sí, dar de baja")}
            </SubmitButton>
            <a
              href={cancelHref.value}
              preventdefault:click
              class={buttonClass(
                "ghost",
                "sm",
                "active:scale-95 touch-manipulation",
              )}
              onClick$={() => {
                triggerHapticFeedback("selection");
                confirming.value = false;
                if (panel.value) panel.value.open = false;
              }}
            >
              {translate(locale, "Cancelar")}
            </a>
          </Form>
        </div>
      </details>
    </>
  );

  if (embedded) {
    return (
      <div
        id={`baja-${id}`}
        class="py-3 first:pt-0 last:pb-0"
        data-author-action="remove"
      >
        {body}
      </div>
    );
  }

  return (
    <section class="mt-8" aria-labelledby={`baja-${id}`}>
      <h2
        id={`baja-${id}`}
        class="text-xs font-semibold uppercase tracking-wide text-ink-faint"
      >
        {translate(locale, "Zona del autor")}
      </h2>

      <Card class="mt-2 border-danger-500/25 p-4">{body}</Card>
    </section>
  );
});
