import { component$, useComputed$, useStore, useTask$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import { clearConfirmedFields } from "~/components/forms/clear-confirmed-fields";
import { postedText } from "~/components/forms/posted-fields";
import {
  submitSuspensionAppeal,
  suspensionAppealSchema,
  withdrawSuspensionAppeal,
  withdrawAppealSchema,
} from "~/lib/appeal-actions";
import { CharCounter } from "~/components/forms/FormShell";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  SubmitButton,
  Textarea,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { APP_NAME } from "~/lib/constants";
import { formatInstant } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { many } from "~/lib/query";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

export const useSuspensions = routeLoader$(async (ev) => {
  const viewer = await requireUser(ev);
  const db = supabase(ev);
  const [suspensions, appeals] = await Promise.all([
    many(
      ev,
      "perfil/suspensiones",
      db
        .from("user_suspensions")
        .select(
          "id, starts_at, ends_at, reason, lifted_at, lift_reason, created_at",
        )
        .eq("user_id", viewer.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ),
    many(
      ev,
      "perfil/apelaciones",
      db
        .from("moderation_appeals")
        .select(
          "id, suspension_id, body, status, resolution_note, created_at, updated_at",
        )
        .eq("appellant_id", viewer.userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
  ]);

  const now = Date.now();
  return {
    suspensions: suspensions.map((suspension) => ({
      ...suspension,
      active:
        !suspension.lifted_at &&
        new Date(suspension.starts_at).getTime() <= now &&
        (!suspension.ends_at || new Date(suspension.ends_at).getTime() > now),
      appeals: appeals.filter(
        (appeal) => appeal.suspension_id === suspension.id,
      ),
    })),
  };
});

export const useSubmitAppeal = routeAction$(
  (data, ev) => submitSuspensionAppeal(data, ev),
  { validation: [zod$(suspensionAppealSchema)], invalidate: [useSuspensions] },
);

export const useWithdrawAppeal = routeAction$(
  (data, ev) => withdrawSuspensionAppeal(data, ev),
  { validation: [zod$(withdrawAppealSchema)], invalidate: [useSuspensions] },
);

const APPEAL_STATUS: Record<
  string,
  { label: string; tone: "warn" | "brand" | "success" | "danger" | "neutral" }
> = {
  pending: { label: "Pendiente", tone: "warn" },
  reviewing: { label: "En revisión", tone: "brand" },
  accepted: { label: "Aceptada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  withdrawn: { label: "Retirada", tone: "neutral" },
};

export default component$(() => {
  const data = useSuspensions();
  const submit = useSubmitAppeal();
  const withdraw = useWithdrawAppeal();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const submittedSuspension = postedText(submit.formData, "suspension_id");
  const drafts = useStore<Record<string, { body: string }>>(
    submittedSuspension
      ? { [submittedSuspension]: { body: postedText(submit.formData, "body") } }
      : {},
  );
  const submitResult = useComputed$(() =>
    !submit.isRunning ? submit.value : undefined,
  );
  const withdrawResult = useComputed$(() =>
    !withdraw.isRunning ? withdraw.value : undefined,
  );
  useTask$(({ track }) => {
    const result = track(() => submitResult.value);
    if (result?.submitted && drafts[result.suspensionId] && submit.formData)
      clearConfirmedFields(drafts[result.suspensionId], submit.formData, [
        "body",
      ]);
  });

  return (
    <div class="container-reading py-8 sm:py-12">
      <Link
        href="/perfil"
        class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
      >
        ← {translate(locale, "Volver a mi perfil")}
      </Link>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">
        {translate(locale, "Suspensiones y apelaciones")}
      </h1>
      <p class="mt-2 text-ink-muted">
        {translate(
          locale,
          "Acá podés consultar el motivo y pedir una revisión. Apelar no elimina el registro ni garantiza que la medida se cambie.",
        )}
      </p>
      <p class="mt-2 text-sm">
        <Link
          href="/moderacion-y-apelaciones"
          class="font-medium text-brand hover:underline"
        >
          {translate(locale, "Cómo funciona el proceso")}
        </Link>
      </p>

      {data.value.suspensions.length === 0 ? (
        <div class="mt-7">
          <EmptyState
            emoji="✅"
            title={translate(locale, "Tu cuenta no tiene suspensiones")}
            description={translate(
              locale,
              "Si alguna vez se aplica una medida, vas a encontrar acá el motivo, la duración y su revisión.",
            )}
          />
        </div>
      ) : (
        <ul class="mt-7 space-y-4">
          {data.value.suspensions.map((suspension) => {
            const openAppeal = suspension.appeals.find((appeal) =>
              ["pending", "reviewing"].includes(appeal.status),
            );
            return (
              <li key={suspension.id} id={`suspension-${suspension.id}`}>
                <Card class="p-6 sm:p-8">
                  <div class="flex flex-wrap items-center gap-2">
                    <h2 class="font-semibold">
                      {translate(locale, "Suspensión del {{date}}", {
                        date: formatInstant(
                          suspension.starts_at,
                          locale,
                          timeZone,
                        ),
                      })}
                    </h2>
                    <Badge tone={suspension.active ? "danger" : "neutral"}>
                      {translate(
                        locale,
                        suspension.active ? "Activa" : "Finalizada",
                      )}
                    </Badge>
                    {suspension.ends_at && suspension.active && (
                      <span class="ml-auto text-xs text-ink-faint">
                        {translate(locale, "Finaliza")}{" "}
                        <RelativeTime value={suspension.ends_at} />
                      </span>
                    )}
                  </div>
                  <div class="mt-3 rounded-2xl bg-muted p-4">
                    <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {translate(locale, "Motivo")}
                    </p>
                    <p
                      dir="auto"
                      class="mt-1 whitespace-pre-line text-sm text-ink"
                    >
                      {suspension.reason}
                    </p>
                  </div>

                  {suspension.lift_reason && (
                    <Alert tone="success" class="mt-3">
                      {translate(locale, "Medida levantada:")}{" "}
                      {suspension.lift_reason}
                    </Alert>
                  )}

                  {submitResult.value?.submitted &&
                    submitResult.value.suspensionId === suspension.id &&
                    openAppeal?.id === submitResult.value.appealId && (
                      <Alert tone="success" class="mt-4">
                        {translate(
                          locale,
                          "Recibimos tu apelación. Moderación la revisará.",
                        )}
                      </Alert>
                    )}
                  {withdrawResult.value?.withdrawn &&
                    !openAppeal &&
                    suspension.appeals.some(
                      (appeal) =>
                        appeal.id === withdrawResult.value?.appealId &&
                        appeal.status === "withdrawn",
                    ) && (
                      <Alert tone="success" class="mt-4">
                        {translate(locale, "La apelación fue retirada.")}
                      </Alert>
                    )}

                  {suspension.appeals.length > 0 && (
                    <ul
                      class="mt-4 space-y-3"
                      aria-label={translate(locale, "Apelaciones anteriores")}
                    >
                      {suspension.appeals.map((appeal) => {
                        const status =
                          APPEAL_STATUS[appeal.status] ??
                          APPEAL_STATUS.pending!;
                        return (
                          <li
                            key={appeal.id}
                            id={`appeal-${appeal.id}`}
                            class="rounded-2xl border border-subtle p-4"
                          >
                            <div class="flex flex-wrap items-center gap-2">
                              <Badge tone={status.tone}>
                                {translate(locale, status.label)}
                              </Badge>
                              <RelativeTime
                                value={appeal.created_at}
                                class="text-xs text-ink-faint"
                              />
                            </div>
                            <p
                              dir="auto"
                              class="mt-2 whitespace-pre-line text-sm text-ink-muted"
                            >
                              {appeal.body}
                            </p>
                            {appeal.resolution_note && (
                              <p class="mt-3 border-t border-subtle pt-3 text-sm text-ink">
                                <strong>
                                  {translate(locale, "Resolución:")}
                                </strong>{" "}
                                {appeal.resolution_note}
                              </p>
                            )}
                            {withdrawResult.value?.message &&
                              withdraw.formData?.get("appeal_id") ===
                                appeal.id && (
                                <Alert class="mt-3">
                                  {translate(
                                    locale,
                                    withdrawResult.value.message,
                                  )}
                                </Alert>
                              )}
                            {appeal.status === "pending" && (
                              <Form action={withdraw} class="mt-3">
                                <input
                                  type="hidden"
                                  name="appeal_id"
                                  value={appeal.id}
                                />
                                <SubmitButton
                                  variant="ghost"
                                  size="sm"
                                  pending={
                                    withdraw.isRunning &&
                                    withdraw.formData?.get("appeal_id") ===
                                      appeal.id
                                  }
                                  disabled={withdraw.isRunning}
                                >
                                  {translate(locale, "Retirar apelación")}
                                </SubmitButton>
                              </Form>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {suspension.active &&
                    (!openAppeal || !!drafts[suspension.id]?.body) && (
                      <Form
                        action={submit}
                        class="mt-5 space-y-3 border-t border-subtle pt-4"
                      >
                        <input
                          type="hidden"
                          name="suspension_id"
                          value={suspension.id}
                        />
                        {openAppeal && (
                          <Alert tone="brand">
                            {translate(
                              locale,
                              "Tenés una apelación abierta. El texto que editaste durante el envío sigue como borrador.",
                            )}
                          </Alert>
                        )}
                        {submitResult.value?.message &&
                          submit.formData?.get("suspension_id") ===
                            suspension.id && (
                            <Alert>
                              {translate(locale, submitResult.value.message)}
                            </Alert>
                          )}
                        <Field
                          name={`body-${suspension.id}`}
                          label="Solicitar revisión"
                          hint="Explicá qué información debería considerar moderación. No incluyas contraseñas ni documentos sensibles."
                          error={
                            submit.formData?.get("suspension_id") ===
                            suspension.id
                              ? submitResult.value?.fieldErrors?.body
                              : undefined
                          }
                        >
                          <Textarea
                            name="body"
                            id={`body-${suspension.id}`}
                            required
                            minLength={20}
                            maxLength={4000}
                            rows={6}
                            value={drafts[suspension.id]?.body ?? ""}
                            onInput$={(_, element) =>
                              (drafts[suspension.id] = { body: element.value })
                            }
                            aria-invalid={
                              submit.formData?.get("suspension_id") ===
                                suspension.id &&
                              submitResult.value?.fieldErrors?.body
                                ? "true"
                                : undefined
                            }
                            aria-describedby={[
                              `apelacion-count-${suspension.id}`,
                              submit.formData?.get("suspension_id") ===
                                suspension.id &&
                              submitResult.value?.fieldErrors?.body
                                ? `body-${suspension.id}-error`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          />
                        </Field>
                        <div class="flex items-center justify-between gap-3">
                          <CharCounter
                            value={drafts[suspension.id]?.body ?? ""}
                            max={4000}
                            id={`apelacion-count-${suspension.id}`}
                          />
                          <SubmitButton
                            pending={
                              submit.isRunning &&
                              submit.formData?.get("suspension_id") ===
                                suspension.id
                            }
                            disabled={!!openAppeal || submit.isRunning}
                          >
                            {translate(locale, "Enviar apelación")}
                          </SubmitButton>
                        </div>
                      </Form>
                    )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Suspensiones y apelaciones")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
