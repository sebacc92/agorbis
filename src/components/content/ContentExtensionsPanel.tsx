import {
  component$,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Signal,
} from "@qwik.dev/core";
import { Form, Link, useLocation } from "@qwik.dev/router";
import { PublicationError } from "~/components/forms/PublicationError";
import { clearConfirmedFields } from "~/components/forms/clear-confirmed-fields";
import { postedText } from "~/components/forms/posted-fields";
import {
  Alert,
  Badge,
  Card,
  ExternalLinkHint,
  Field,
  Icon,
  Input,
  Select,
  SubmitButton,
  Textarea,
} from "~/components/ui";
import type { ContentExtensions } from "~/lib/content-extensions";
import type { ContentType } from "~/lib/database.types.helpers";
import type {
  RelationAction,
  SourceAction,
  InstitutionalResponseAction,
} from "~/lib/extension-actions";
import { nativeActionHref } from "~/lib/native-action-href";
import { relationKind, selectedRelationFromUrl } from "~/lib/relation-picker";
import { formatDate, pluralize } from "~/lib/format";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { ContentRelationPicker } from "./ContentRelationPicker";
import { useLocale, translate } from "~/lib/i18n";

const TYPE_LABEL: Record<ContentType, string> = {
  poll: "Encuesta",
  debate: "Debate",
  claim: "Reclamo",
  project: "Proyecto",
};

const RELATION_LABEL = {
  related: "Relacionado",
  result_of: "Resultado de",
  proposal_for: "Propuesta para",
  follow_up: "Continuación",
} as const;

const RESPONSE_LABEL = {
  information: "Información oficial",
  acknowledged: "Recibido",
  commitment: "Compromiso institucional",
  completed: "Acción completada",
} as const;

const ExtensionLoadError = component$<{ message: string; href: string }>(
  ({ message, href }) => {
    const locale = useLocale();
    return (
      <div
        role="alert"
        class="mt-3 rounded-2xl border border-warn-400/40 bg-warn-400/10 p-4 text-sm"
      >
        <p>{translate(locale, message)}</p>
        <a
          href={href}
          class="mt-1 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2"
        >
          {translate(locale, "Volver a cargar")}
        </a>
      </div>
    );
  },
);

function useExtensionErrorFocus(
  action: SourceAction | InstitutionalResponseAction | RelationAction,
  box: Signal<HTMLDivElement | undefined>,
  details: Signal<HTMLDetailsElement | undefined>,
  type: ContentType,
  id: string,
  fields: [string, string] = ["content_type", "content_id"],
) {
  const location = useLocation();
  const focusedResult = useSignal<
    | SourceAction["value"]
    | InstitutionalResponseAction["value"]
    | RelationAction["value"]
  >();
  // eslint-disable-next-line qwik/no-use-visible-task -- enfocar el rechazo sólo tras actualizar el DOM del formulario
  useVisibleTask$(
    ({ track, cleanup }) => {
      const running = track(() => action.isRunning);
      const result = track(() => action.value);
      const navigating = track(() => location.isNavigating);
      const error = track(() => box.value);
      const scope = track(() => details.value);
      if (
        !error ||
        !scope ||
        running ||
        navigating ||
        result === focusedResult.value ||
        !(result?.message || result?.fieldErrors) ||
        action.formData?.get(fields[0]) !== type ||
        action.formData?.get(fields[1]) !== id
      )
        return;
      const focus = () => {
        const element = box.value;
        if (
          action.isRunning ||
          location.isNavigating ||
          action.value !== result ||
          !element?.isConnected ||
          !element.getClientRects().length
        )
          return false;
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: "center", behavior: "auto" });
        if (document.activeElement !== element) return false;
        // Otra acción puede navegar sin cambiar este rechazo. Cada resultado
        // nuevo conserva su propio foco, incluso si repite el mismo mensaje.
        focusedResult.value = result;
        return true;
      };
      // La acción entrega su resultado antes de revalidar el loader. Esperamos
      // el final de navegación y el commit del nodo actual; una mutación sólo
      // agenda foco para el próximo cuadro, nunca para un DOM intermedio.
      let frame = 0;
      const scheduleFocus = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (focus()) observer.disconnect();
        });
      };
      const observer = new MutationObserver(scheduleFocus);
      observer.observe(scope, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "open", "style", "class"],
      });
      scheduleFocus();
      cleanup(() => {
        cancelAnimationFrame(frame);
        observer.disconnect();
      });
    },
    { strategy: "document-ready" },
  );
}

export const ContentExtensionsPanel = component$<{
  type: ContentType;
  id: string;
  data: ContentExtensions;
  canManage: boolean;
  addSource: SourceAction;
  respond: InstitutionalResponseAction;
  addRelation: RelationAction;
}>(({ type, id, data, canManage, addSource, respond, addRelation }) => {
  const location = useLocation();
  const retryUrl = new URL(location.url);
  retryUrl.searchParams.delete("qaction");
  const retryHref = `${retryUrl.pathname}${retryUrl.search}`;
  const sourceBox = useSignal<HTMLDivElement>();
  const responseBox = useSignal<HTMLDivElement>();
  const sourceDetails = useSignal<HTMLDetailsElement>();
  const responseDetails = useSignal<HTMLDetailsElement>();
  const relationBox = useSignal<HTMLDivElement>();
  const relationDetails = useSignal<HTMLDetailsElement>();
  useExtensionErrorFocus(addSource, sourceBox, sourceDetails, type, id);
  useExtensionErrorFocus(respond, responseBox, responseDetails, type, id);
  useExtensionErrorFocus(addRelation, relationBox, relationDetails, type, id, [
    "source_type",
    "source_id",
  ]);
  const locale = useLocale();
  const relationPosted = useComputed$(() =>
    addRelation.formData?.get("source_id") === id &&
    addRelation.formData?.get("source_type") === type
      ? addRelation.formData
      : undefined,
  );
  const relationResult = useComputed$(() =>
    relationPosted.value && !addRelation.isRunning
      ? addRelation.value
      : undefined,
  );
  const relationExpanded = useSignal(
    !!relationResult.value ||
      !!selectedRelationFromUrl(location.url, type, id) ||
      location.url.searchParams.has("vincular_relacion"),
  );
  const relationType = useSignal(
    postedText(
      relationPosted.value,
      "relation_type",
      relationKind(location.url.searchParams.get("vincular_relacion")),
    ),
  );
  useTask$(({ track }) => {
    const running = track(() => addRelation.isRunning);
    const result = track(() => addRelation.value);
    if (relationPosted.value && (running || result))
      relationExpanded.value = true;
  });
  const sourcePosted = useComputed$(() =>
    addSource.formData?.get("content_id") === id &&
    addSource.formData?.get("content_type") === type
      ? addSource.formData
      : undefined,
  );
  const responsePosted = useComputed$(() =>
    respond.formData?.get("content_id") === id &&
    respond.formData?.get("content_type") === type
      ? respond.formData
      : undefined,
  );
  const sourceResult = useComputed$(() =>
    sourcePosted.value && !addSource.isRunning ? addSource.value : undefined,
  );
  const responseResult = useComputed$(() =>
    responsePosted.value && !respond.isRunning ? respond.value : undefined,
  );
  const sourceError = useComputed$(
    () => sourceResult.value?.message || sourceResult.value?.fieldErrors,
  );
  const sourceExpanded = useSignal(!!sourceResult.value);
  const responseExpanded = useSignal(!!responseResult.value);
  useTask$(({ track }) => {
    const running = track(() => addSource.isRunning);
    const result = track(() => addSource.value);
    if (
      addSource.formData?.get("content_id") === id &&
      addSource.formData?.get("content_type") === type &&
      (running || result?.message || result?.fieldErrors || result?.saved)
    )
      sourceExpanded.value = true;
  });
  useTask$(({ track }) => {
    const running = track(() => respond.isRunning);
    const result = track(() => respond.value);
    if (
      respond.formData?.get("content_id") === id &&
      respond.formData?.get("content_type") === type &&
      (running || result?.message || result?.fieldErrors || result?.posted)
    )
      responseExpanded.value = true;
  });
  const sourcePrefix = `source-${id}-`;
  const responsePrefix = `response-${id}-`;
  // Los errores nativos vuelven a renderizar el documento. El POST inicial
  // recupera sus campos; con JavaScript el borrador conserva también ediciones
  // hechas mientras el servidor estaba respondiendo.
  const sourceDraft = useStore({
    title: postedText(sourcePosted.value, "title"),
    publisher: postedText(sourcePosted.value, "publisher"),
    url: postedText(sourcePosted.value, "url"),
    published_at: postedText(sourcePosted.value, "published_at"),
  });
  const responseDraft = useStore({
    organization_id: postedText(
      responsePosted.value,
      "organization_id",
      data.myOrganizations[0]?.id ?? "",
    ),
    response_type: postedText(
      responsePosted.value,
      "response_type",
      "information",
    ),
    body: postedText(responsePosted.value, "body"),
    source_url: postedText(responsePosted.value, "source_url"),
  });

  useTask$(({ track }) => {
    const result = track(() => sourceResult.value);
    if (result?.saved && sourcePosted.value)
      clearConfirmedFields(sourceDraft, sourcePosted.value, [
        "title",
        "publisher",
        "url",
        "published_at",
      ]);
  });
  useTask$(({ track }) => {
    const result = track(() => responseResult.value);
    if (result?.posted && responsePosted.value)
      clearConfirmedFields(responseDraft, responsePosted.value, [
        "body",
        "source_url",
      ]);
  });
  const sourceUnsent = useComputed$(() =>
    Object.values(sourceDraft).some(Boolean),
  );
  const responseUnsent = useComputed$(
    () => !!(responseDraft.body || responseDraft.source_url),
  );

  // Una sección vacía sólo sirve a quien puede completarla. Al resto le
  // mostraba "todavía no tiene fuentes" y "todavía no se vinculó" en cada
  // publicación nueva, que en una instalación que arranca son todas (D96).
  // Un fallo de carga se sigue mostrando: no es lo mismo que un vacío.
  const showSources =
    canManage || data.sources.length > 0 || !!data.loadFailures.sources;
  const showRelated =
    canManage || data.related.length > 0 || !!data.loadFailures.related;
  const showResponses =
    data.responses.length > 0 ||
    data.myOrganizations.length > 0 ||
    !!data.loadFailures.responses ||
    !!data.loadFailures.representation;
  if (!showSources && !showRelated && !showResponses) return null;

  // Clases compartidas por las tres secciones (D124): antes eran tres bloques
  // sueltos, cada uno con un recuadro punteado de "todavía no tiene…" y una
  // tarjeta aparte para el formulario. Ahora viven en una sola tarjeta,
  // separadas por una línea, con encabezado de una línea y contador.
  const SECTION = "p-5 sm:p-6";
  const HEADER = "flex flex-wrap items-center gap-2.5";
  const TITLE =
    "flex min-w-0 flex-1 items-center gap-2 font-display text-display-xs text-ink-strong";
  const COUNT = "text-xs font-medium tabular-nums text-ink-muted";
  const EMPTY = "mt-2 text-sm text-ink-faint";
  const SUMMARY =
    "inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-control bg-surface px-3 text-sm font-medium text-ink-strong transition-colors select-none hover:border-brand-500 hover:bg-muted touch-manipulation [&::-webkit-details-marker]:hidden";

  return (
    <Card class="mt-8 divide-y divide-subtle">
      {showSources && (
        <section aria-labelledby="fuentes-titulo" class={SECTION}>
          <div class={HEADER}>
            <h2 id="fuentes-titulo" class={TITLE}>
              <Icon name="file-text" class="text-ink-muted" />
              {translate(locale, "Fuentes y documentos")}
            </h2>
            {data.sources.some((source) => source.verified_at) && (
              <Badge tone="success">
                {translate(locale, "Fuentes verificadas")}
              </Badge>
            )}
            <span class={COUNT}>
              {pluralize(data.sources.length, "fuente", "fuentes", locale)}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-muted">
            {translate(
              locale,
              "Evidencia para distinguir hechos, contexto y propuestas.",
            )}
          </p>

          {data.loadFailures.sources && (
            <ExtensionLoadError
              message="No pudimos cargar todas las fuentes. Los documentos disponibles se muestran abajo."
              href={`${retryHref}#fuentes-titulo`}
            />
          )}
          {data.sources.length > 0 ? (
            <ul class="mt-3 space-y-2">
              {data.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex gap-3 rounded-xl border border-subtle bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-strong hover:shadow-soft"
                  >
                    <Icon
                      name="file-text"
                      class="mt-0.5 text-lg text-ink-muted"
                    />
                    <span class="min-w-0 flex-1">
                      <span
                        dir="auto"
                        class="block font-medium text-ink-strong"
                      >
                        {source.title}
                        <ExternalLinkHint />
                      </span>
                      <span class="mt-0.5 block text-xs text-ink-faint">
                        {source.publisher ? (
                          <bdi dir="auto">{source.publisher}</bdi>
                        ) : (
                          new URL(source.url).hostname
                        )}
                        {source.published_at
                          ? ` · ${formatDate(source.published_at, locale)}`
                          : ""}
                      </span>
                    </span>
                    {source.verified_at && (
                      <Badge tone="success">
                        {translate(locale, "Verificada")}
                      </Badge>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          ) : !data.loadFailures.sources ? (
            <p class={EMPTY}>
              {translate(
                locale,
                "Esta publicación todavía no tiene fuentes adjuntas.",
              )}
            </p>
          ) : null}

          {canManage && (
            <div class="mt-3">
              <details
                ref={sourceDetails}
                open={sourceExpanded.value}
                onToggle$={(_, element) =>
                  (sourceExpanded.value = element.open)
                }
              >
                <summary class={SUMMARY}>
                  <Icon name="plus" />
                  {translate(locale, "Agregar una fuente")}
                </summary>
                <Form action={addSource} class="mt-4 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="content_type" value={type} />
                  <input type="hidden" name="content_id" value={id} />
                  {sourceResult.value?.saved && (
                    <Alert tone="success" class="sm:col-span-2">
                      {translate(locale, "Se guardó la fuente “{{title}}”.", {
                        title: sourceResult.value.sourceTitle ?? "",
                      })}
                      {sourceUnsent.value && (
                        <p class="mt-1">
                          {translate(
                            locale,
                            "Los cambios sin enviar siguen en el formulario.",
                          )}
                        </p>
                      )}
                    </Alert>
                  )}
                  <div class="sm:col-span-2" hidden={!sourceError.value}>
                    <PublicationError
                      value={sourceResult.value}
                      title="No se guardó la fuente"
                      fieldIdPrefix={sourcePrefix}
                      focusRef={sourceBox}
                    />
                  </div>
                  <Field
                    name={`${sourcePrefix}title`}
                    label="Título"
                    required
                    error={sourceResult.value?.fieldErrors?.title}
                  >
                    <Input
                      id={`${sourcePrefix}title`}
                      name="title"
                      required
                      maxLength={180}
                      aria-invalid={
                        sourceResult.value?.fieldErrors?.title
                          ? "true"
                          : undefined
                      }
                      aria-describedby={
                        sourceResult.value?.fieldErrors?.title
                          ? `${sourcePrefix}title-error`
                          : undefined
                      }
                      value={sourceDraft.title}
                      onInput$={(_, el) => (sourceDraft.title = el.value)}
                    />
                  </Field>
                  <Field
                    name={`${sourcePrefix}publisher`}
                    label="Organización o medio"
                    error={sourceResult.value?.fieldErrors?.publisher}
                  >
                    <Input
                      id={`${sourcePrefix}publisher`}
                      name="publisher"
                      maxLength={120}
                      aria-invalid={
                        sourceResult.value?.fieldErrors?.publisher
                          ? "true"
                          : undefined
                      }
                      aria-describedby={
                        sourceResult.value?.fieldErrors?.publisher
                          ? `${sourcePrefix}publisher-error`
                          : undefined
                      }
                      value={sourceDraft.publisher}
                      onInput$={(_, el) => (sourceDraft.publisher = el.value)}
                    />
                  </Field>
                  <Field
                    name={`${sourcePrefix}url`}
                    label="Enlace"
                    required
                    class="sm:col-span-2"
                    error={sourceResult.value?.fieldErrors?.url}
                  >
                    <Input
                      id={`${sourcePrefix}url`}
                      name="url"
                      type="url"
                      inputMode="url"
                      required
                      placeholder="https://…"
                      aria-invalid={
                        sourceResult.value?.fieldErrors?.url
                          ? "true"
                          : undefined
                      }
                      aria-describedby={
                        sourceResult.value?.fieldErrors?.url
                          ? `${sourcePrefix}url-error`
                          : undefined
                      }
                      value={sourceDraft.url}
                      onInput$={(_, el) => (sourceDraft.url = el.value)}
                    />
                  </Field>
                  <Field
                    name={`${sourcePrefix}published_at`}
                    label="Fecha de publicación"
                    error={sourceResult.value?.fieldErrors?.published_at}
                  >
                    <Input
                      id={`${sourcePrefix}published_at`}
                      name="published_at"
                      type="date"
                      aria-invalid={
                        sourceResult.value?.fieldErrors?.published_at
                          ? "true"
                          : undefined
                      }
                      aria-describedby={
                        sourceResult.value?.fieldErrors?.published_at
                          ? `${sourcePrefix}published_at-error`
                          : undefined
                      }
                      value={sourceDraft.published_at}
                      onInput$={(_, el) =>
                        (sourceDraft.published_at = el.value)
                      }
                    />
                  </Field>
                  <div class="flex items-end">
                    <SubmitButton pending={addSource.isRunning}>
                      {translate(locale, "Guardar fuente")}
                    </SubmitButton>
                  </div>
                </Form>
              </details>
            </div>
          )}
        </section>
      )}

      {showResponses && (
        <section aria-labelledby="respuestas-institucionales" class={SECTION}>
          <div class={HEADER}>
            <h2 id="respuestas-institucionales" class={TITLE}>
              <Icon name="building" class="text-ink-muted" />
              {translate(locale, "Respuestas institucionales")}
            </h2>
            <span class={COUNT}>
              {pluralize(
                data.responses.length,
                "respuesta",
                "respuestas",
                locale,
              )}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-muted">
            {translate(
              locale,
              "Mensajes firmados por representantes verificados.",
            )}
          </p>

          {data.loadFailures.responses && (
            <ExtensionLoadError
              message="No pudimos cargar todas las respuestas o sus instituciones. Esto no significa que no haya respuestas."
              href={`${retryHref}#respuestas-institucionales`}
            />
          )}
          {data.loadFailures.representation && (
            <ExtensionLoadError
              message="No pudimos consultar tu representación institucional. Volvé a cargarla antes de responder."
              href={`${retryHref}#respuestas-institucionales`}
            />
          )}

          <ul class="mt-3 space-y-3">
            {data.responses.map((response) => (
              <li key={response.id}>
                <Card class="border-brand-500/30 p-5 shadow-xs transition-all duration-200 hover:shadow-soft">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">
                      <Icon name="check" />
                      {response.organization?.name ? (
                        <bdi dir="auto">{response.organization.name}</bdi>
                      ) : (
                        translate(locale, "Organización verificada")
                      )}
                    </Badge>
                    <span class="text-xs text-ink-faint">
                      {translate(
                        locale,
                        RESPONSE_LABEL[
                          response.response_type as keyof typeof RESPONSE_LABEL
                        ] ?? response.response_type,
                      )}{" "}
                      ·{" "}
                      {/* Una respuesta institucional es un hecho fechado: el
                          "hace 2 meses" solo no sirve para citarla. */}
                      <RelativeTime value={response.created_at} />
                    </span>
                  </div>
                  <p
                    dir="auto"
                    class="ugc-text mt-3 whitespace-pre-line text-sm leading-relaxed text-ink"
                  >
                    {response.body}
                  </p>
                  {response.source_url && (
                    <a
                      href={response.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="mt-3 inline-block text-sm font-medium text-brand hover:underline"
                    >
                      {translate(locale, "Ver documento respaldatorio")}
                      <ExternalLinkHint />
                    </a>
                  )}
                </Card>
              </li>
            ))}
          </ul>

          {data.myOrganizations.length > 0 &&
            !data.loadFailures.representation && (
              <div class="mt-3">
                <details
                  ref={responseDetails}
                  open={responseExpanded.value}
                  onToggle$={(_, element) =>
                    (responseExpanded.value = element.open)
                  }
                >
                  <summary class={SUMMARY}>
                    <Icon name="plus" />
                    {translate(locale, "Responder como institución")}
                  </summary>
                  <Form action={respond} class="mt-4 space-y-3">
                    <input type="hidden" name="content_type" value={type} />
                    <input type="hidden" name="content_id" value={id} />
                    {responseResult.value?.posted && (
                      <Alert tone="success">
                        {translate(
                          locale,
                          "Se publicó la respuesta institucional.",
                        )}
                        {responseUnsent.value && (
                          <p class="mt-1">
                            {translate(
                              locale,
                              "Los cambios sin enviar siguen en el formulario.",
                            )}
                          </p>
                        )}
                      </Alert>
                    )}
                    <PublicationError
                      value={responseResult.value}
                      title="No se publicó la respuesta institucional"
                      fieldIdPrefix={responsePrefix}
                      focusRef={responseBox}
                    />
                    <div class="grid gap-3 sm:grid-cols-2">
                      <Field
                        name={`${responsePrefix}organization_id`}
                        label="Organización"
                        required
                        error={
                          responseResult.value?.fieldErrors?.organization_id
                        }
                      >
                        <Select
                          id={`${responsePrefix}organization_id`}
                          name="organization_id"
                          required
                          aria-invalid={
                            responseResult.value?.fieldErrors?.organization_id
                              ? "true"
                              : undefined
                          }
                          aria-describedby={
                            responseResult.value?.fieldErrors?.organization_id
                              ? `${responsePrefix}organization_id-error`
                              : undefined
                          }
                          value={responseDraft.organization_id}
                          onChange$={(_, el) =>
                            (responseDraft.organization_id = el.value)
                          }
                        >
                          {data.myOrganizations.map((org) => (
                            <option
                              key={org.id}
                              value={org.id}
                              selected={
                                org.id === responseDraft.organization_id
                              }
                            >
                              {org.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field
                        name={`${responsePrefix}response_type`}
                        label="Tipo de respuesta"
                        required
                        error={responseResult.value?.fieldErrors?.response_type}
                      >
                        <Select
                          id={`${responsePrefix}response_type`}
                          name="response_type"
                          required
                          aria-invalid={
                            responseResult.value?.fieldErrors?.response_type
                              ? "true"
                              : undefined
                          }
                          aria-describedby={
                            responseResult.value?.fieldErrors?.response_type
                              ? `${responsePrefix}response_type-error`
                              : undefined
                          }
                          value={responseDraft.response_type}
                          onChange$={(_, el) =>
                            (responseDraft.response_type = el.value)
                          }
                        >
                          {Object.entries(RESPONSE_LABEL).map(
                            ([value, label]) => (
                              <option
                                key={value}
                                value={value}
                                selected={value === responseDraft.response_type}
                              >
                                {translate(locale, label)}
                              </option>
                            ),
                          )}
                        </Select>
                      </Field>
                    </div>
                    <Field
                      name={`${responsePrefix}body`}
                      label="Respuesta"
                      required
                      hint="Escribí al menos 20 caracteres."
                      error={responseResult.value?.fieldErrors?.body}
                    >
                      <Textarea
                        id={`${responsePrefix}body`}
                        name="body"
                        required
                        maxLength={4000}
                        rows={5}
                        aria-invalid={
                          responseResult.value?.fieldErrors?.body
                            ? "true"
                            : undefined
                        }
                        aria-describedby={[
                          responseResult.value?.fieldErrors?.body
                            ? `${responsePrefix}body-error`
                            : "",
                          `${responsePrefix}body-hint`,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        value={responseDraft.body}
                        onInput$={(_, el) => (responseDraft.body = el.value)}
                      />
                    </Field>
                    <Field
                      name={`${responsePrefix}source_url`}
                      label="Documento respaldatorio"
                      error={responseResult.value?.fieldErrors?.source_url}
                    >
                      <Input
                        id={`${responsePrefix}source_url`}
                        name="source_url"
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        aria-invalid={
                          responseResult.value?.fieldErrors?.source_url
                            ? "true"
                            : undefined
                        }
                        aria-describedby={
                          responseResult.value?.fieldErrors?.source_url
                            ? `${responsePrefix}source_url-error`
                            : undefined
                        }
                        value={responseDraft.source_url}
                        onInput$={(_, el) =>
                          (responseDraft.source_url = el.value)
                        }
                      />
                    </Field>
                    <SubmitButton pending={respond.isRunning}>
                      {translate(locale, "Publicar respuesta verificada")}
                    </SubmitButton>
                  </Form>
                </details>
              </div>
            )}
        </section>
      )}

      {showRelated && (
        <section aria-labelledby="relacionados-titulo" class={SECTION}>
          <div class={HEADER}>
            <h2 id="relacionados-titulo" class={TITLE}>
              <Icon name="link" class="text-ink-muted" />
              {translate(locale, "Contenido relacionado")}
            </h2>
            <span class={COUNT}>
              {pluralize(
                data.related.length,
                "relacionada",
                "relacionadas",
                locale,
              )}
            </span>
          </div>
          {data.loadFailures.related && (
            <ExtensionLoadError
              message="No pudimos cargar todo el contenido relacionado. Volvé a intentarlo."
              href={`${retryHref}#relacionados-titulo`}
            />
          )}
          {data.related.length > 0 ? (
            <ul class="mt-3 grid gap-2 sm:grid-cols-2">
              {data.related.map((item) => (
                <li key={item.relationId}>
                  <Link
                    href={item.href}
                    class="block h-full rounded-xl border border-subtle bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-strong hover:shadow-soft"
                  >
                    <span class="text-xs font-semibold text-brand">
                      {translate(
                        locale,
                        RELATION_LABEL[
                          item.relationType as keyof typeof RELATION_LABEL
                        ] ?? item.relationType,
                      )}{" "}
                      · {translate(locale, TYPE_LABEL[item.type])}
                    </span>
                    <span
                      dir="auto"
                      class="mt-1 block text-sm font-medium text-ink-strong"
                    >
                      {item.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : !data.loadFailures.related ? (
            <p class={EMPTY}>
              {translate(locale, "Todavía no se vinculó con otra publicación.")}
            </p>
          ) : null}

          {canManage && (
            <div class="mt-3">
              <details
                ref={relationDetails}
                open={relationExpanded.value}
                onToggle$={(_, element) =>
                  (relationExpanded.value = element.open)
                }
              >
                <summary class={SUMMARY}>
                  <Icon name="plus" />
                  {translate(locale, "Vincular contenido existente")}
                </summary>
                <Form
                  action={addRelation}
                  class="mt-4 grid gap-3 sm:grid-cols-2"
                >
                  <input type="hidden" name="source_type" value={type} />
                  <input type="hidden" name="source_id" value={id} />
                  <div class="sm:col-span-2">
                    {relationResult.value?.linked && (
                      <Alert tone="success">
                        {translate(locale, "Se vinculó la publicación.")}
                      </Alert>
                    )}
                    <PublicationError
                      value={relationResult.value}
                      title="No se vinculó la publicación"
                      fieldIdPrefix={`relation-${id}-`}
                      focusRef={relationBox}
                    />
                  </div>
                  <Field
                    name={`relation-${id}-relation_type`}
                    label="Relación"
                    required
                    error={relationResult.value?.fieldErrors?.relation_type}
                  >
                    <Select
                      id={`relation-${id}-relation_type`}
                      name="relation_type"
                      required
                      value={relationType.value}
                      onChange$={(_, element) =>
                        (relationType.value = element.value)
                      }
                    >
                      {Object.entries(RELATION_LABEL).map(([value, label]) => (
                        <option
                          key={value}
                          value={value}
                          selected={value === relationType.value}
                        >
                          {translate(locale, label)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <ContentRelationPicker
                    sourceType={type}
                    sourceId={id}
                    posted={relationPosted.value}
                    error={relationResult.value?.fieldErrors?.target_id}
                    selection={data.selectedRelation}
                  />
                  {!relationPosted.value &&
                    selectedRelationFromUrl(location.url, type, id) &&
                    !data.selectedRelation &&
                    !data.loadFailures.related && (
                      <p class="sm:col-span-2 text-sm text-ink-muted">
                        {translate(
                          locale,
                          "La publicación seleccionada no está disponible. Volvé a buscarla.",
                        )}
                      </p>
                    )}
                  <SubmitButton
                    pending={addRelation.isRunning}
                    formAction={nativeActionHref(
                      retryHref,
                      addRelation.actionPath,
                    )}
                  >
                    {translate(locale, "Vincular")}
                  </SubmitButton>
                </Form>
              </details>
            </div>
          )}
        </section>
      )}
    </Card>
  );
});
