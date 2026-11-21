import {
  $,
  component$,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
} from "@qwik.dev/core";
import {
  Form,
  useLocation,
  routeAction$,
  routeLoader$,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Alert,
  Badge,
  Card,
  Field,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { formatDate } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import {
  ensureHttpPrefix,
  formatCuit,
  formatPhoneNumber,
  validateCuitChecksum,
} from "~/lib/input-masks";
import { requireUser, supabase } from "~/lib/session";
import {
  organizationRequestSchema,
  requestOrganization,
} from "~/lib/civic-request-actions";
import { clearRequestDraft, requestDraft } from "~/lib/request-draft";
import { many } from "~/lib/query";
import { useLocaleLoader } from "../../layout";

/**
 * Los estados vienen crudos de la base (`pending`, `approved`, …) y se pasaban
 * directo a `translate()`. Como los msgid del producto están en español, la
 * búsqueda no encontraba nada y el badge mostraba la palabra inglesa tal cual,
 * también a quien lee en español.
 */
const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  reviewing: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  duplicate: "Duplicada",
};

export const useMyOrganizationRequests = routeLoader$(
  async (ev) => {
    const viewer = await requireUser(ev);
    return many(
      ev,
      "solicitar-institucion/mias",
      supabase(ev)
        .from("organization_requests")
        .select("*")
        .eq("user_id", viewer.userId)
        .order("created_at", { ascending: false }),
    );
  },
  { search: ["enviada"] },
);

export const useRequestOrganization = routeAction$(
  async (data, ev) => {
    const result = await requestOrganization(data, ev);
    if ("sent" in result && result.sent && ev.internalRequest !== "action") {
      throw ev.redirect(
        303,
        `/instituciones/solicitar/?enviada=${result.requestId}`,
      );
    }
    return result;
  },
  {
    validation: [zod$(organizationRequestSchema)],
    invalidate: [useMyOrganizationRequests],
  },
);

const EMPTY_DRAFT = {
  name: "",
  type: "government",
  website: "",
  evidence_url: "",
  message: "",
  cuit_helper: "",
  phone_helper: "",
};

export default component$(() => {
  const requests = useMyOrganizationRequests();
  const submit = useRequestOrganization();
  const locale = useLocale();
  const location = useLocation();

  const draft = useStore(requestDraft(EMPTY_DRAFT, submit.formData));
  const feedback = useComputed$<typeof submit.value>(() => {
    if (submit.isRunning) return undefined;
    if (submit.value) return submit.value;
    const receipt = requests.value.find(
      (row) => row.id === location.url.searchParams.get("enviada"),
    );
    return receipt
      ? { sent: true, requestId: receipt.id, requestName: receipt.name }
      : undefined;
  });
  const handled = useSignal<string>();
  useTask$(({ track }) => {
    const result = track(() => submit.value);
    if (
      result &&
      "sent" in result &&
      result.sent &&
      submit.formData &&
      result.requestId !== handled.value
    ) {
      handled.value = result.requestId;
      clearRequestDraft(draft, EMPTY_DRAFT, submit.formData);
    }
  });
  const onWebsiteBlur$ = $((_: Event, el: HTMLInputElement) => {
    draft.website = ensureHttpPrefix(el.value);
  });
  const onEvidenceBlur$ = $((_: Event, el: HTMLInputElement) => {
    draft.evidence_url = ensureHttpPrefix(el.value);
  });
  const onCuitInput$ = $((_: Event, el: HTMLInputElement) => {
    draft.cuit_helper = formatCuit(el.value);
  });
  const onPhoneInput$ = $((_: Event, el: HTMLInputElement) => {
    draft.phone_helper = formatPhoneNumber(el.value);
  });

  return (
    <div class="container-reading py-8">
      <header>
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "Representación verificada")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Solicitar perfil institucional")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Revisamos el vínculo con la organización antes de habilitar respuestas firmadas.",
          )}
        </p>
      </header>

      <Card class="mt-6 p-6">
        <Form action={submit} class="space-y-4">
          {feedback.value?.sent && (
            <Alert tone="success">
              {translate(
                locale,
                "Solicitud “{{name}}” enviada para revisión.",
                { name: feedback.value.requestName },
              )}
              <a
                href={`${location.url.pathname}${location.url.search}#request-${feedback.value.requestId}`}
                class="ml-2 inline-flex min-h-11 items-center font-semibold underline"
              >
                {translate(locale, "Ver solicitud")}
              </a>
            </Alert>
          )}
          {feedback.value?.message && (
            <Alert>{translate(locale, feedback.value.message)}</Alert>
          )}

          <Field
            name="name"
            label="Nombre oficial"
            required
            error={feedback.value?.fieldErrors?.name}
          >
            <Input
              name="name"
              required
              minLength={2}
              maxLength={160}
              autocomplete="organization"
              value={draft.name}
              onInput$={(_, el) => (draft.name = el.value)}
            />
          </Field>
          <Field
            name="type"
            label="Tipo"
            required
            error={feedback.value?.fieldErrors?.type}
          >
            <Select
              name="type"
              value={draft.type}
              onChange$={(_, el) => (draft.type = el.value)}
            >
              <option value="government" selected={draft.type === "government"}>
                {translate(locale, "Organismo público")}
              </option>
              <option value="ngo" selected={draft.type === "ngo"}>
                {translate(locale, "Organización social")}
              </option>
              <option
                value="institution"
                selected={draft.type === "institution"}
              >
                {translate(locale, "Institución")}
              </option>
              <option value="company" selected={draft.type === "company"}>
                {translate(locale, "Empresa")}
              </option>
              <option value="other" selected={draft.type === "other"}>
                {translate(locale, "Otra")}
              </option>
            </Select>
          </Field>
          <Field
            name="website"
            label="Sitio oficial"
            error={feedback.value?.fieldErrors?.website}
          >
            <Input
              name="website"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={draft.website}
              onInput$={(_, el) => (draft.website = el.value)}
              onChange$={onWebsiteBlur$}
            />
          </Field>
          <Field
            name="evidence_url"
            label="Prueba pública de tu representación"
            error={feedback.value?.fieldErrors?.evidence_url}
          >
            <Input
              name="evidence_url"
              type="url"
              inputMode="url"
              value={draft.evidence_url}
              onInput$={(_, el) => (draft.evidence_url = el.value)}
              placeholder={translate(
                locale,
                "Directorio, resolución o página institucional",
              )}
              onChange$={onEvidenceBlur$}
            />
          </Field>

          <div class="rounded-xl border border-dashed border-subtle bg-inset/40 p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {translate(locale, "Asistente de datos fiscales y contacto")}
              </span>
              {draft.cuit_helper ? (
                <Badge
                  tone={
                    validateCuitChecksum(draft.cuit_helper) ? "success" : "warn"
                  }
                >
                  {validateCuitChecksum(draft.cuit_helper)
                    ? translate(locale, "CUIT válido")
                    : translate(locale, "CUIT a revisar")}
                </Badge>
              ) : null}
            </div>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  for="institution-cuit"
                  class="mb-1 block text-xs text-ink-muted"
                >
                  {translate(locale, "CUIT / Identificador")}
                </label>
                <Input
                  id="institution-cuit"
                  name="cuit_helper"
                  maxLength={40}
                  placeholder="30-12345678-9"
                  value={draft.cuit_helper}
                  onInput$={onCuitInput$}
                />
              </div>
              <div>
                <label
                  for="institution-phone"
                  class="mb-1 block text-xs text-ink-muted"
                >
                  {translate(locale, "Teléfono de contacto")}
                </label>
                <Input
                  id="institution-phone"
                  name="phone_helper"
                  maxLength={40}
                  placeholder="+54 9 11 1234-5678"
                  value={draft.phone_helper}
                  onInput$={onPhoneInput$}
                />
              </div>
            </div>
            <p class="mt-3 text-xs text-ink-muted">
              {translate(
                locale,
                "Los datos fiscales y de contacto se enviarán junto con tu explicación.",
              )}
            </p>
          </div>

          <Field
            name="message"
            label="Explicá tu rol y cómo podemos verificarlo"
            hint="Escribí al menos 20 caracteres."
            required
            error={feedback.value?.fieldErrors?.message}
          >
            <Textarea
              name="message"
              required
              minLength={20}
              maxLength={2000}
              rows={5}
              value={draft.message}
              onInput$={(_, el) => (draft.message = el.value)}
            />
          </Field>
          <SubmitButton size="lg" pending={submit.isRunning}>
            {translate(locale, "Solicitar verificación")}
          </SubmitButton>
        </Form>
      </Card>

      {requests.value.length > 0 && (
        <section class="mt-8">
          <h2 class="font-semibold">{translate(locale, "Tus solicitudes")}</h2>
          <ul class="mt-3 space-y-2">
            {requests.value.map((request) => (
              <li key={request.id} id={`request-${request.id}`}>
                <Card class="flex items-center gap-3 p-4">
                  <div class="flex-1">
                    <p class="font-medium">{request.name}</p>
                    <p class="text-xs text-ink-faint">
                      {formatDate(request.created_at, locale)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      request.status === "approved"
                        ? "success"
                        : request.status === "rejected"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {translate(
                      locale,
                      REQUEST_STATUS_LABEL[request.status] ?? request.status,
                    )}
                  </Badge>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
});
export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Verificación institucional")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
