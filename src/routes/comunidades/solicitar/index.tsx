import {
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
import { CommunityPicker } from "~/components/community/CommunityPicker";
import type { SearchHit } from "~/components/layout/CommunitySearch";
import { logFailure } from "~/lib/log";
import { formatDate } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { many } from "~/lib/query";
import { requireUser, supabase } from "~/lib/session";
import {
  communityRequestSchema,
  requestCommunity,
} from "~/lib/civic-request-actions";
import { clearRequestDraft, requestDraft } from "~/lib/request-draft";
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

export const useCommunityRequests = routeLoader$(
  async (ev) => {
    const viewer = await requireUser(ev);
    // Es la lista de lo que uno mismo pidió: vacía por error se lee como
    // "nunca pediste nada" y lleva a mandar la solicitud de nuevo.
    return many(
      ev,
      "solicitar-comunidad/mias",
      supabase(ev)
        .from("community_requests")
        .select("*")
        .eq("user_id", viewer.userId)
        .order("created_at", { ascending: false }),
    );
  },
  { search: ["enviada"] },
);

/**
 * Comunidad superior sugerida desde Explorar o el onboarding: el último nivel
 * de una rama ofrece pedir la localidad que falta (`?superior=<slug>`). Se
 * vuelve a leer de la base; un slug inexistente no preselecciona nada y el
 * envío la verifica igual que una elegida a mano.
 */
export const useSuggestedParent = routeLoader$(
  async (ev): Promise<SearchHit | null> => {
    const slug = ev.url.searchParams.get("superior")?.trim();
    if (!slug) return null;
    const { data, error } = await supabase(ev)
      .from("communities")
      .select("slug, name, emoji, level, member_count")
      .eq("slug", slug)
      .maybeSingle();
    if (error) {
      // Sin la sugerencia, el formulario sigue completo: se elige a mano.
      logFailure({ scope: "solicitar-comunidad/superior" }, error);
      return null;
    }
    return data
      ? {
          slug: data.slug,
          name: data.name,
          emoji: data.emoji,
          level: data.level,
          memberCount: data.member_count,
        }
      : null;
  },
  { search: ["superior"] },
);

export const useRequestCommunity = routeAction$(
  async (data, ev) => {
    const result = await requestCommunity(data, ev);
    if ("sent" in result && result.sent && ev.internalRequest !== "action") {
      throw ev.redirect(
        303,
        `/comunidades/solicitar/?enviada=${result.requestId}`,
      );
    }
    return result;
  },
  {
    validation: [zod$(communityRequestSchema)],
    invalidate: [useCommunityRequests],
  },
);
const EMPTY_DRAFT = {
  requested_name: "",
  country: "",
  requested_level: "city",
  reason: "",
  evidence_url: "",
};

export default component$(() => {
  const requests = useCommunityRequests();
  const suggestedParent = useSuggestedParent();
  const submit = useRequestCommunity();
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
      ? {
          sent: true,
          requestId: receipt.id,
          requestName: receipt.requested_name,
        }
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
  return (
    <div class="container-reading py-8">
      <header>
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "Cobertura geográfica")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Solicitar una comunidad")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Si tu provincia, ciudad o barrio no aparece, envianos datos suficientes para incorporarlo sin duplicados.",
          )}
        </p>
      </header>
      <Card class="mt-6 p-5 sm:p-6">
        <Form action={submit} class="space-y-4">
          {feedback.value?.sent && (
            <Alert tone="success">
              {translate(
                locale,
                "Solicitud “{{name}}” enviada. Vas a recibir una notificación cuando cambie de estado.",
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
          <div class="grid gap-4 sm:grid-cols-2">
            <Field
              name="requested_name"
              label="Nombre oficial"
              required
              error={feedback.value?.fieldErrors?.requested_name}
            >
              <Input
                name="requested_name"
                required
                autocomplete="off"
                value={draft.requested_name}
                onInput$={(_, el) => (draft.requested_name = el.value)}
              />
            </Field>
            <Field
              name="country"
              label="País"
              required
              error={feedback.value?.fieldErrors?.country}
            >
              <Input
                name="country"
                required
                autocomplete="country-name"
                value={draft.country}
                onInput$={(_, el) => (draft.country = el.value)}
              />
            </Field>
          </div>
          <Field
            name="requested_level"
            label="Nivel"
            required
            error={feedback.value?.fieldErrors?.requested_level}
          >
            <Select
              name="requested_level"
              required
              value={draft.requested_level}
              onChange$={(_, el) => (draft.requested_level = el.value)}
            >
              <option value="city" selected={draft.requested_level === "city"}>
                {translate(locale, "Ciudad o municipio")}
              </option>
              <option
                value="province"
                selected={draft.requested_level === "province"}
              >
                {translate(locale, "Provincia o equivalente")}
              </option>
              <option
                value="neighborhood"
                selected={draft.requested_level === "neighborhood"}
              >
                {translate(locale, "Barrio")}
              </option>
            </Select>
          </Field>
          <CommunityPicker
            name="parent_slug"
            nativeFallback
            initial={suggestedParent.value}
            postedSlug={submit.formData?.get("parent_slug")?.toString()}
            label="Comunidad superior"
            hint="Para una provincia elegí su país; para una ciudad, su provincia; para un barrio, su ciudad."
            error={feedback.value?.fieldErrors?.parent_slug}
            required
          />
          {/* El mínimo de 20 caracteres sólo existía en el esquema del
              servidor y ningún campo mostraba `fieldErrors`: escribir un
              motivo corto devolvía la página igual, sin error, sin mensaje y
              sin nada que hubiera cambiado en pantalla. */}
          <Field
            name="reason"
            label="¿Por qué debería incorporarse?"
            hint="Al menos 20 caracteres: indicá la comunidad superior, población aproximada y cómo se usa oficialmente el nombre."
            required
            error={feedback.value?.fieldErrors?.reason}
          >
            <Textarea
              name="reason"
              required
              minLength={20}
              maxLength={1500}
              rows={5}
              value={draft.reason}
              onInput$={(_, el) => (draft.reason = el.value)}
            />
          </Field>
          <Field
            name="evidence_url"
            label="Fuente oficial o mapa"
            error={feedback.value?.fieldErrors?.evidence_url}
          >
            <Input
              name="evidence_url"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={draft.evidence_url}
              onInput$={(_, el) => (draft.evidence_url = el.value)}
            />
          </Field>
          <SubmitButton size="lg" pending={submit.isRunning}>
            {translate(locale, "Enviar solicitud")}
          </SubmitButton>
        </Form>
      </Card>
      {requests.value.length > 0 && (
        <section class="mt-8">
          <h2 class="text-lg font-semibold">
            {translate(locale, "Tus solicitudes")}
          </h2>
          <ul class="mt-3 space-y-2">
            {requests.value.map((request) => (
              <li key={request.id} id={`request-${request.id}`}>
                <Card class="flex flex-wrap items-center gap-3 p-4">
                  <div class="min-w-0 flex-1">
                    <p class="font-medium text-ink-strong">
                      {request.requested_name}, {request.country}
                    </p>
                    <p class="text-xs text-ink-faint">
                      {formatDate(request.created_at, locale)}
                      {request.resolution_note
                        ? ` · ${request.resolution_note}`
                        : ""}
                    </p>
                  </div>
                  <Badge
                    tone={
                      request.status === "approved"
                        ? "success"
                        : request.status === "rejected"
                          ? "danger"
                          : request.status === "reviewing"
                            ? "brand"
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
  title: `${translate(resolveValue(useLocaleLoader), "Solicitar comunidad")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
