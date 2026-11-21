import { component$, useSignal } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  zod$,
  type DocumentHead,
  type RequestHandler,
  type RequestEventAction,
} from "@qwik.dev/router";
import {
  Alert,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  SubmitButton,
  Textarea,
  Icon,
} from "~/components/ui";
import {
  createDeletionRequestSchema,
  DELETION_REQUEST_STATUSES,
  DELETION_RESOLUTIONS,
  DELETION_UPDATE_FAILED,
  deletionRequestNextStates,
  deletionRequestRpc,
  issueReceiptAccessCode,
  privateDeletionRequestSchema,
  reissueDeletionReceiptSchema,
  requireDeletionRequestAdmin,
  updateDeletionRequestSchema,
  type PrivateDeletionRequest,
} from "~/lib/deletion-requests";
import { formatDate } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";
import { supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
  ev.headers.set("Referrer-Policy", "no-referrer");
  ev.headers.set("X-Robots-Tag", "noindex, nofollow");
};

export const useDeletionRequests = routeLoader$(async (ev) => {
  await requireDeletionRequestAdmin(ev);
  const filter = ["open", "all", "resolved", "rejected"].includes(
    ev.url.searchParams.get("estado") ?? "",
  )
    ? ev.url.searchParams.get("estado")!
    : "open";
  const requestedPage = Number(ev.url.searchParams.get("pagina") ?? "1");
  const page =
    Number.isInteger(requestedPage) &&
    requestedPage >= 1 &&
    requestedPage <= 500
      ? requestedPage
      : 1;
  const { data, error } = await deletionRequestRpc(
    supabase(ev),
    "list_data_deletion_requests",
    { p_filter: filter, p_page: page },
  );
  const parsed = privateDeletionRequestSchema.array().safeParse(data);
  if (error || !parsed.success) throw ev.error(503, DELETION_UPDATE_FAILED);
  return { requests: parsed.data, filter, page };
});

function issuedReceipt(data: unknown, code: string, ev: RequestEventAction) {
  if (
    !data ||
    typeof data !== "object" ||
    !("reference" in data) ||
    !("access_expires_at" in data) ||
    typeof data.reference !== "string" ||
    typeof data.access_expires_at !== "string"
  ) {
    return ev.fail(400, { message: DELETION_UPDATE_FAILED });
  }
  return {
    issued: {
      reference: data.reference,
      access_expires_at: data.access_expires_at,
      access_code: code,
      issued_at: Date.now(),
      receipt_url: new URL(
        "/eliminar-datos/seguimiento/",
        ev.url.origin,
      ).toString(),
    },
  };
}

export const useCreateDeletionRequest = routeAction$(
  async (data, ev) => {
    await requireDeletionRequestAdmin(ev);
    const access = await issueReceiptAccessCode();
    const result = await deletionRequestRpc(
      supabase(ev),
      "create_data_deletion_request",
      {
        p_contact_email: data.contact_email,
        p_scope: data.scope,
        p_inbox_reference: data.inbox_reference,
        p_access_hash: access.hash,
      },
    );
    if (result.error) return ev.fail(400, { message: DELETION_UPDATE_FAILED });
    return issuedReceipt(result.data, access.code, ev);
  },
  {
    validation: [zod$(createDeletionRequestSchema)],
    invalidate: [useDeletionRequests],
  },
);

export const useUpdateDeletionRequest = routeAction$(
  async (data, ev) => {
    await requireDeletionRequestAdmin(ev);
    const result = await deletionRequestRpc(
      supabase(ev),
      "update_data_deletion_request",
      {
        p_reference: data.reference,
        p_revision: data.revision,
        p_status: data.status,
        p_verification_method: data.verification_method || undefined,
        p_verification_note: data.verification_note || undefined,
        p_resolution_code: data.resolution_code || undefined,
        p_response_sent: data.response_sent === "si",
      },
    );
    if (result.error || result.data !== true)
      return ev.fail(400, { message: DELETION_UPDATE_FAILED });
    return { saved: true };
  },
  {
    validation: [zod$(updateDeletionRequestSchema)],
    invalidate: [useDeletionRequests],
  },
);

export const useReissueDeletionReceipt = routeAction$(
  async (data, ev) => {
    await requireDeletionRequestAdmin(ev);
    const access = await issueReceiptAccessCode();
    const result = await deletionRequestRpc(
      supabase(ev),
      "reissue_data_deletion_receipt",
      {
        p_reference: data.reference,
        p_revision: data.revision,
        p_access_hash: access.hash,
      },
    );
    if (result.error) return ev.fail(400, { message: DELETION_UPDATE_FAILED });
    return issuedReceipt(result.data, access.code, ev);
  },
  {
    validation: [zod$(reissueDeletionReceiptSchema)],
    invalidate: [useDeletionRequests],
  },
);

const RequestCard = component$<{ request: PrivateDeletionRequest }>(
  ({ request }) => {
    const locale = useLocale();
    const update = useUpdateDeletionRequest();
    const reissue = useReissueDeletionReceipt();
    const nextStates = deletionRequestNextStates(request.status);
    const nextStatus = useSignal<string>(nextStates[0] ?? "");
    const resolution = useSignal<keyof typeof DELETION_RESOLUTIONS | "">("");
    const closing =
      nextStatus.value === "resolved" || nextStatus.value === "rejected";
    return (
      <Card class="p-5 sm:p-6">
        <h2 class="text-xl font-semibold">
          {translate(locale, DELETION_REQUEST_STATUSES[request.status])}
        </h2>
        <p class="mt-2 break-all font-mono text-sm">{request.reference}</p>
        <p class="mt-2 text-sm text-ink-muted">
          {formatDate(request.received_at, locale)} ·{" "}
          {translate(
            locale,
            request.scope === "account" ? "Cuenta completa" : "Datos concretos",
          )}
        </p>
        {request.contact_email && (
          <p class="mt-2 break-all">{request.contact_email}</p>
        )}
        {request.inbox_reference && (
          <p class="mt-1 break-words text-sm">{request.inbox_reference}</p>
        )}
        {request.verified_at && (
          <p class="mt-3 text-sm">
            {translate(locale, "Identidad verificada")}:{" "}
            {formatDate(request.verified_at, locale)}
          </p>
        )}
        {request.verification_note && (
          <p class="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
            {request.verification_note}
          </p>
        )}
        {request.resolution_code && (
          <p class="mt-3 text-sm">
            {translate(locale, DELETION_RESOLUTIONS[request.resolution_code])}
          </p>
        )}
        {nextStates.length > 0 && (
          <Form
            action={update}
            class="mt-5 space-y-4 border-t border-subtle pt-5"
          >
            <input type="hidden" name="reference" value={request.reference} />
            <input type="hidden" name="revision" value={request.revision} />
            <Field
              name={`${request.reference}-status`}
              label={translate(locale, "Próximo estado")}
            >
              <Select
                name="status"
                id={`${request.reference}-status`}
                value={nextStatus.value}
                onChange$={(_event, element) => {
                  nextStatus.value = element.value;
                  resolution.value = "";
                }}
              >
                {nextStates.map((status) => (
                  <option key={status} value={status}>
                    {translate(locale, DELETION_REQUEST_STATUSES[status])}
                  </option>
                ))}
              </Select>
            </Field>
            {nextStatus.value === "in_review" && (
              <>
                <Field
                  name={`${request.reference}-verification-method`}
                  label={translate(locale, "Método de verificación")}
                >
                  <Select
                    name="verification_method"
                    id={`${request.reference}-verification-method`}
                    required
                  >
                    <option value="">
                      {translate(locale, "Seleccioná una opción")}
                    </option>
                    <option value="account_email">
                      {translate(
                        locale,
                        "Control del correo de la cuenta comprobado",
                      )}
                    </option>
                    <option value="alternative">
                      {translate(locale, "Verificación alternativa acordada")}
                    </option>
                  </Select>
                </Field>
                <Field
                  name={`${request.reference}-verification-note`}
                  label={translate(locale, "Constancia mínima de verificación")}
                >
                  <Textarea
                    name="verification_note"
                    id={`${request.reference}-verification-note`}
                    required
                    minLength={10}
                    maxLength={500}
                    rows={3}
                  />
                </Field>
                <p class="text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Registrá sólo el método y la comprobación realizada. No pegues documentos, códigos, tokens ni el cuerpo del correo. Recibir un mensaje no verifica por sí solo la identidad.",
                  )}
                </p>
              </>
            )}
            {closing && (
              <>
                <Field
                  name={`${request.reference}-resolution`}
                  label={translate(locale, "Motivo de cierre")}
                >
                  <Select
                    name="resolution_code"
                    id={`${request.reference}-resolution`}
                    required
                    value={resolution.value}
                    onChange$={(_event, element) => {
                      resolution.value =
                        element.value as keyof typeof DELETION_RESOLUTIONS;
                    }}
                  >
                    <option value="">
                      {translate(locale, "Seleccioná una opción")}
                    </option>
                    {Object.entries(DELETION_RESOLUTIONS)
                      .filter(([key]) =>
                        nextStatus.value === "resolved"
                          ? ["handled", "partially_handled"].includes(key)
                          : !["handled", "partially_handled"].includes(key),
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {translate(locale, label)}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field
                  name={`${request.reference}-reply`}
                  label={translate(
                    locale,
                    "Respuesta base para el hilo existente",
                  )}
                >
                  <Textarea
                    name={`${request.reference}-reply`}
                    readOnly
                    rows={6}
                    value={[
                      `${translate(locale, "Referencia de solicitud")}: ${request.reference}`,
                      `${translate(locale, "Estado")}: ${translate(locale, DELETION_REQUEST_STATUSES[nextStatus.value as "resolved" | "rejected"])}`,
                      resolution.value
                        ? `${translate(locale, "Motivo de cierre")}: ${translate(locale, DELETION_RESOLUTIONS[resolution.value])}`
                        : "",
                      translate(
                        locale,
                        "La gestión manual se cierra con el alcance comunicado en este hilo. Este cierre no acredita una eliminación completa de publicaciones, datos derivados ni copias de proveedores. Podés responder a este correo si necesitás aclaraciones.",
                      ),
                    ]
                      .filter(Boolean)
                      .join("\n\n")}
                  />
                </Field>
                <p class="text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Completá el alcance y las limitaciones reales en el correo, envialo desde el hilo existente y después registrá el cierre. Este formulario no envía mensajes ni borra cuentas.",
                  )}
                </p>
                <label class="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="response_sent"
                    value="si"
                    required
                    class="mt-1 size-4"
                  />
                  <span>
                    {translate(
                      locale,
                      "Envié la respuesta de cierre al destinatario verificado o la respuesta sin datos de cuenta cuando no se pudo verificar.",
                    )}
                  </span>
                </label>
                <p class="text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Al cerrar se retiran de este registro el contacto, la referencia del hilo y la nota de verificación. Se conservan la referencia de solicitud, el método, los estados y las fechas.",
                  )}
                </p>
              </>
            )}
            <SubmitButton pending={update.isRunning}>
              {translate(locale, "Guardar estado")}
            </SubmitButton>
          </Form>
        )}
        <Form action={reissue} class="mt-4 border-t border-subtle pt-4">
          <input type="hidden" name="reference" value={request.reference} />
          <input type="hidden" name="revision" value={request.revision} />
          <SubmitButton variant="secondary" pending={reissue.isRunning}>
            {translate(locale, "Reemitir código de consulta")}
          </SubmitButton>
          <p class="mt-2 text-xs text-ink-muted">
            {translate(
              locale,
              "Invalida el código anterior. Entregá el nuevo sólo a la persona solicitante en el hilo verificado.",
            )}
          </p>
        </Form>
      </Card>
    );
  },
);

export default component$(() => {
  const queue = useDeletionRequests();
  const create = useCreateDeletionRequest();
  const update = useUpdateDeletionRequest();
  const reissue = useReissueDeletionReceipt();
  const locale = useLocale();
  const createdReceipt = create.value?.issued;
  const reissuedReceipt = reissue.value?.issued;
  const issued =
    (reissuedReceipt?.issued_at ?? 0) > (createdReceipt?.issued_at ?? 0)
      ? reissuedReceipt
      : createdReceipt;
  const error =
    create.value?.message ?? update.value?.message ?? reissue.value?.message;
  return (
    <article class="container-reading py-8">
      <Link
        href="/moderacion/"
        class="inline-flex min-h-11 items-center text-brand underline"
      >
        {translate(locale, "Moderación")}
      </Link>
      <h1 class="mt-3 text-3xl font-semibold">
        {translate(locale, "Solicitudes de eliminación por correo")}
      </h1>
      <p class="mt-3 leading-7 text-ink-muted">
        {translate(
          locale,
          "Registro privado para administradores. Documentá el trámite recibido por correo; la eliminación de cuentas sigue su procedimiento existente.",
        )}
      </p>
      {error && <Alert class="mt-5">{translate(locale, error)}</Alert>}
      {update.value?.saved && (
        <Alert tone="success" class="mt-5">
          {translate(locale, "Estado guardado")}
        </Alert>
      )}
      {issued && (
        <Card class="mt-6 p-6">
          <h2 class="text-xl font-semibold">
            {translate(locale, "Recibo para copiar al hilo de correo")}
          </h2>
          <p class="mt-2 text-sm text-ink-muted">
            {translate(
              locale,
              "El código se muestra sólo al emitirlo. No queda disponible en la lista ni se envía automáticamente.",
            )}
          </p>
          <Textarea
            name="issued-receipt"
            class="mt-4"
            readOnly
            rows={9}
            aria-label={translate(
              locale,
              "Recibo para copiar al hilo de correo",
            )}
            value={[
              `${translate(locale, "Referencia de solicitud")}: ${issued.reference}`,
              `${translate(locale, "Código privado de consulta")}: ${issued.access_code}`,
              `${translate(locale, "Consultar recibo")}: ${issued.receipt_url}`,
              `${translate(locale, "Vencimiento del código")}: ${formatDate(issued.access_expires_at, locale)}`,
              translate(
                locale,
                "El vencimiento del código no es un plazo de resolución. Podés pedir otro código respondiendo a este correo. No lo compartas ni lo agregues a un enlace.",
              ),
            ].join("\n\n")}
          />
        </Card>
      )}
      <Card class="mt-6 p-6">
        <h2 class="text-xl font-semibold">
          {translate(locale, "Registrar solicitud recibida")}
        </h2>
        <Form action={create} class="mt-4 space-y-4">
          <Field
            name="contact_email"
            label={translate(locale, "Correo de contacto del hilo")}
          >
            <Input
              name="contact_email"
              type="email"
              required
              maxLength={254}
              autoComplete="off"
            />
          </Field>
          <Field
            name="inbox_reference"
            label={translate(locale, "Referencia interna del hilo")}
          >
            <Input
              name="inbox_reference"
              required
              maxLength={200}
              autoComplete="off"
            />
          </Field>
          <p class="text-sm text-ink-muted">
            {translate(
              locale,
              "Usá una referencia que permita encontrar el mensaje en el buzón. No copies su contenido ni adjuntos.",
            )}
          </p>
          <Field name="scope" label={translate(locale, "Alcance solicitado")}>
            <Select name="scope">
              <option value="account">
                {translate(locale, "Cuenta completa")}
              </option>
              <option value="specific_data">
                {translate(locale, "Datos concretos")}
              </option>
            </Select>
          </Field>
          <SubmitButton pending={create.isRunning}>
            {translate(locale, "Registrar y emitir recibo")}
          </SubmitButton>
        </Form>
      </Card>
      <form method="get" class="my-6 flex flex-wrap items-end gap-3">
        <Field name="estado" label={translate(locale, "Mostrar solicitudes")}>
          <Select name="estado" value={queue.value.filter}>
            <option value="open">{translate(locale, "Pendientes")}</option>
            <option value="all">{translate(locale, "Todas")}</option>
            <option value="resolved">{translate(locale, "Resueltas")}</option>
            <option value="rejected">{translate(locale, "Rechazadas")}</option>
          </Select>
        </Field>
        <button
          type="submit"
          class="min-h-11 rounded-xl border border-control px-4 font-semibold"
        >
          {translate(locale, "Filtrar")}
        </button>
      </form>
      <div class="space-y-5">
        {queue.value.requests.map((request) => (
          <RequestCard
            key={`${request.reference}:${request.revision}`}
            request={request}
          />
        ))}
      </div>
      {queue.value.requests.length === 0 && (
        <EmptyState
          emoji="📨"
          title={translate(locale, "No hay solicitudes en esta vista")}
        />
      )}
      <nav
        class="mt-6 flex justify-between"
        aria-label={translate(locale, "Páginas de solicitudes")}
      >
        {queue.value.page > 1 ? (
          <Link
            class="inline-flex min-h-11 items-center text-brand underline"
            href={`?estado=${queue.value.filter}&pagina=${queue.value.page - 1}`}
          >
            {translate(locale, "← Anterior")}
          </Link>
        ) : (
          <span />
        )}
        {queue.value.requests.length === 20 && queue.value.page < 500 && (
          <Link
            class="inline-flex min-h-11 items-center text-brand underline"
            href={`?estado=${queue.value.filter}&pagina=${queue.value.page + 1}`}
          >
            {translate(locale, "Siguiente")}{" "}
            <Icon name="arrow-right" class="text-[1.1em]" />
          </Link>
        )}
      </nav>
    </article>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Solicitudes de eliminación por correo")} · Agorbis`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
