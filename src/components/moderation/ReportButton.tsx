import { component$, useComputed$, useSignal, useTask$ } from "@qwik.dev/core";
import { Form, globalAction$, useLocation, zod$, z } from "@qwik.dev/router";
import { CharCounter } from "~/components/forms/FormShell";
import {
  Icon,
  Alert,
  Field,
  SubmitButton,
  Textarea,
  triggerHapticFeedback,
} from "~/components/ui";
import { participationBlockMessage } from "~/lib/db-error";
import { getViewer } from "~/lib/session";
import { createServerSupabase } from "~/lib/supabase";
import { useLocale, translate } from "~/lib/i18n";
import {
  reportIntent,
  reportSignInHref,
  type ReportTargetType,
} from "~/lib/report-intent";

export const useReport = globalAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        reportSignInHref(ev.url, data.target_type, data.target_id),
      );
    }

    const db = createServerSupabase(ev);
    const { error } = await db.from("reports").insert({
      reporter_id: viewer.userId,
      target_type: data.target_type,
      target_id: data.target_id,
      reason: data.reason,
    });

    if (error) {
      // `reports` pasa por `aa_participation_gate` (0039): si el rechazo es del
      // gate, reintentar no sirve y hay que decir por qué.
      const blocked = participationBlockMessage(error);
      if (blocked) return ev.fail(403, { message: blocked });
      return ev.fail(400, {
        message:
          error.code === "23505"
            ? "Ya reportaste esto. Moderación lo va a revisar."
            : "No pudimos enviar el reporte. Probá de nuevo.",
      });
    }

    return { reported: true as const };
  },
  zod$({
    target_type: z.enum([
      "debate_comment",
      "claim",
      "project",
      "poll",
      "debate",
      "agreement",
    ]),
    target_id: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(3, "Contá brevemente qué está mal.")
      .max(500, "Máximo 500 caracteres."),
  }),
);

/**
 * Reportar contenido. Arranca colapsado: es una acción poco frecuente que no
 * debería competir visualmente con las acciones principales de la página.
 */
export const ReportButton = component$<{
  targetType: ReportTargetType;
  targetId: string;
  isAuthenticated: boolean;
}>(({ targetType, targetId, isAuthenticated }) => {
  const loc = useLocation();
  const intentMatches =
    loc.url.searchParams.get("reportar") === reportIntent(targetType, targetId);
  const report = useReport();
  const locale = useLocale();
  const isMine = useComputed$(
    () =>
      report.formData?.get("target_id") === targetId &&
      report.formData?.get("target_type") === targetType,
  );
  const result = useComputed$(() =>
    isMine.value && !report.isRunning ? report.value : undefined,
  );
  const pending = useComputed$(() => report.isRunning && isMine.value);
  const open = useSignal(intentMatches || !!result.value);
  const draft = useSignal(
    isMine.value && !result.value?.reported
      ? (report.formData?.get("reason")?.toString() ?? "")
      : "",
  );
  const draftTarget = useSignal(reportIntent(targetType, targetId));

  useTask$(({ track }) => {
    const intent = track(() => loc.url.searchParams.get("reportar"));
    const target = track(() => reportIntent(targetType, targetId));
    const response = track(() => result.value);
    const running = track(() => pending.value);
    if (target !== draftTarget.value) {
      draftTarget.value = target;
      draft.value = "";
      open.value = false;
    }
    if (response || running) open.value = true;
    if (intent === reportIntent(targetType, targetId)) open.value = true;
  });

  /**
   * `useReport` es una `globalAction$`: una sola instancia compartida por todos
   * los botones de la página. En un debate con cuarenta comentarios, reportar
   * uno dejaba a los otros treinta y nueve diciendo "Reporte enviado" —y un
   * error de validación se dibujaba en todos a la vez—. El `formData` del
   * último envío dice cuál fue realmente, así que cada botón sólo se da por
   * aludido si el reporte era suyo.
   */
  if (!isAuthenticated)
    return (
      <a
        href={reportSignInHref(loc.url, targetType, targetId)}
        preventdefault:click
        onClick$={() => {
          window.location.href = reportSignInHref(
            new URL(window.location.href),
            targetType,
            targetId,
          );
        }}
        class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs text-ink-muted hover:bg-muted hover:text-ink-strong hover:underline"
      >
        <Icon name="flag" class="text-sm" />
        {translate(locale, "Ingresá para reportar este contenido")}
      </a>
    );

  if (result.value?.reported) {
    return (
      // `status`: el botón que tenía el foco desaparece al enviarse el reporte.
      // Sin región viva, la confirmación no existía para quien no la ve.
      <p role="status" class="text-xs text-ink-faint">
        <Icon name="check" class="mr-1 text-sm" />
        {translate(locale, "Reporte enviado. Gracias por cuidar el espacio.")}
      </p>
    );
  }

  return (
    <details
      id={`reporte-${targetId}`}
      open={open.value}
      onToggle$={(_, details) => {
        open.value = details.open;
      }}
    >
      <summary
        class="group inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs text-ink-faint underline-offset-2 transition-all hover:bg-muted hover:text-ink-muted hover:underline active:scale-95 touch-manipulation"
        aria-controls={`reporte-form-${targetId}`}
        onClick$={() => {
          triggerHapticFeedback("selection");
          // Abrir el panel y dejar el foco atrás obliga a tabular a ciegas
          // hasta el campo que se acaba de pedir.
          if (!open.value) {
            requestAnimationFrame(() =>
              document.getElementById(`reason-${targetId}`)?.focus(),
            );
          }
        }}
      >
        <span
          aria-hidden="true"
          class="inline-flex transition-transform duration-200 group-hover:-rotate-12"
        >
          <Icon name="flag" class="text-sm" />
        </span>
        <span>
          {translate(
            locale,
            open.value ? "Cancelar reporte" : "Reportar contenido",
          )}
        </span>
      </summary>

      <div
        id={`reporte-form-${targetId}`}
        class="mt-3 max-w-md animate-fade-in"
      >
        {intentMatches && (
          <p class="mb-3 text-xs text-ink-muted">
            {translate(
              locale,
              "Volviste para reportar este contenido. Contá el problema y enviá el reporte cuando quieras.",
            )}
          </p>
        )}
        <Form action={report} class="space-y-3">
          <input type="hidden" name="target_type" value={targetType} />
          <input type="hidden" name="target_id" value={targetId} />

          {result.value?.message && (
            <Alert>{translate(locale, result.value.message)}</Alert>
          )}

          <Field
            label="¿Qué problema tiene?"
            name={`reason-${targetId}`}
            error={result.value?.fieldErrors?.reason}
          >
            <Textarea
              name="reason"
              id={`reason-${targetId}`}
              required
              rows={3}
              maxLength={500}
              aria-describedby={[
                result.value?.fieldErrors?.reason
                  ? `reason-${targetId}-error`
                  : null,
                `reason-${targetId}-count`,
              ]
                .filter(Boolean)
                .join(" ")}
              value={draft.value}
              aria-invalid={
                result.value?.fieldErrors?.reason ? "true" : undefined
              }
              onInput$={(_, el) => (draft.value = el.value)}
              placeholder={translate(
                locale,
                "Es spam, tiene datos personales, incita a la violencia…",
              )}
              class="min-h-20 text-sm"
            />
          </Field>

          {/* El tope de 500 lo aplicaba el navegador en silencio: se seguía
              escribiendo y las letras dejaban de entrar. Mismo contador que el
              resto de los formularios largos. */}
          <p class="flex justify-end">
            <CharCounter
              value={draft.value}
              max={500}
              id={`reason-${targetId}-count`}
            />
          </p>

          <SubmitButton variant="secondary" size="sm" pending={pending.value}>
            {translate(locale, "Enviar reporte")}
          </SubmitButton>
        </Form>
      </div>
    </details>
  );
});
