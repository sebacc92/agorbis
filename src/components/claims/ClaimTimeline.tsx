import {
  $,
  component$,
  useComputed$,
  useId,
  useSignal,
  useStore,
  useTask$,
} from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import {
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ExternalLinkHint,
  Field,
  Icon,
  Input,
  Select,
  SubmitButton,
  Textarea,
  cx,
  type IconName,
} from "~/components/ui";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import type { Tables } from "~/lib/database.types.helpers";
import type {
  useAddClaimEvent,
  useAssignClaimOrganization,
} from "~/routes/reclamos/[id]";
import { PublicationError } from "~/components/forms/PublicationError";
import {
  claimEventDraft,
  clearSubmittedClaimEventDraft,
} from "~/lib/claim-event-draft";
import {
  isOfficialClaimEvent,
  isClaimProgressEvent,
} from "~/lib/claim-event-presentation";
import { formatDate, formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { localizeClaimEventTitle } from "~/lib/localize-system-text";

const EVENT_LABEL = {
  created: "Creación",
  status_change: "Cambio de estado",
  official_response: "Respuesta oficial",
  evidence: "Evidencia",
  update: "Actualización",
  resolution: "Resolución",
} as const;

type EventFilter = "all" | "official" | "evidence" | "status";

export type ClaimTimelineEvent = Omit<Tables<"claim_events">, "actor_id"> & {
  organization?: Pick<Tables<"organizations">, "id" | "name"> | null;
};

export const ClaimTimeline = component$<{
  addEvent: ReturnType<typeof useAddClaimEvent>;
  assign: ReturnType<typeof useAssignClaimOrganization>;
  claimId: string;
  events: ClaimTimelineEvent[];
  organizations: Pick<Tables<"organizations">, "id" | "name">[];
  responsible: Pick<Tables<"organizations">, "id" | "name"> | null;
  canManage: boolean;
  canUpdate: boolean;
  canRespondOfficially?: boolean;
  canChangeStatus?: boolean;
  myOrganizationId?: string | null;
}>(
  ({
    addEvent,
    assign,
    claimId,
    events,
    organizations,
    responsible,
    canManage,
    canUpdate,
    canRespondOfficially = false,
    canChangeStatus = false,
    myOrganizationId,
  }) => {
    const locale = useLocale();
    const instanceId = useId();
    const filterLabelId = `claim-event-filters-${instanceId}`;
    const fieldPrefix = `claim-event-${claimId}-`;
    const posted =
      addEvent.formData?.get("claim_id") === claimId
        ? addEvent.formData
        : undefined;
    const draft = useStore(
      claimEventDraft(posted && addEvent.value?.failed ? posted : undefined),
    );
    const feedback = useComputed$(() =>
      addEvent.formData?.get("claim_id") === claimId && !addEvent.isRunning
        ? addEvent.value
        : undefined,
    );
    const handledEvent = useSignal<string>();

    const selectedFilter = useSignal<EventFilter>("all");

    useTask$(({ track }) => {
      const result = track(() => addEvent.value);
      const submitted = addEvent.formData;
      if (
        !result ||
        !("added" in result) ||
        result.claimId !== claimId ||
        !submitted ||
        handledEvent.value === result.eventId
      )
        return;
      handledEvent.value = result.eventId;
      Object.assign(draft, clearSubmittedClaimEventDraft(draft, submitted));
      selectedFilter.value = "all";
    });

    const officialCount = events.filter(isOfficialClaimEvent).length;
    const evidenceCount = events.filter(
      (e) => e.event_type === "evidence" || !!e.evidence_url,
    ).length;
    const statusCount = events.filter(isClaimProgressEvent).length;

    const filteredEvents = events.filter((e) => {
      if (selectedFilter.value === "official") {
        return isOfficialClaimEvent(e);
      }
      if (selectedFilter.value === "evidence") {
        return e.event_type === "evidence" || !!e.evidence_url;
      }
      if (selectedFilter.value === "status") {
        return isClaimProgressEvent(e);
      }
      return true;
    });

    // Un solo chip con un único estado elegido (D126): eran cuatro píldoras
    // hechas a mano, cada una con su color crudo y un emoji en la etiqueta.
    // Las condiciones para mostrar cada filtro son las de siempre.
    const eventFilters: {
      key: EventFilter;
      icon?: IconName;
      label: string;
      count: number;
    }[] = [
      { key: "all", label: translate(locale, "Todos"), count: events.length },
      {
        key: "official",
        icon: "building",
        label: translate(locale, "Respuestas oficiales"),
        count: officialCount,
      },
      {
        key: "evidence",
        icon: "link",
        label: translate(locale, "Evidencia vecinal"),
        count: evidenceCount,
      },
      {
        key: "status",
        icon: "chart",
        label: translate(locale, "Avances y estado"),
        count: statusCount,
      },
    ];
    const visibleFilters = eventFilters.filter(
      (filter) => filter.key === "all" || filter.count > 0,
    );

    const scrollToLatest$ = $(() => {
      const el = document.getElementById("timeline-latest-event");
      if (el) {
        // Con "reducir movimiento" el salto es directo, como en `Alert`: el
        // `smooth` explícito pisaba la preferencia de la persona.
        el.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
      }
    });

    return (
      <section class="mt-8" aria-labelledby="seguimiento-reclamo">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* `scroll-mt` porque ahora hay dos enlaces que apuntan acá (la
                ficha y el reloj de respuesta) y la cabecera pegajosa se le
                monta encima al destino. */}
            <h2
              id="seguimiento-reclamo"
              class="scroll-mt-24 text-xl font-semibold"
            >
              {translate(locale, "Seguimiento público")}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                "Cada novedad conserva fecha, responsable y evidencia.",
              )}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            {/* Botón fantasma y no chip: un chip con `onClick$` se anuncia
                como interruptor (`aria-pressed`) y esto es un salto. La flecha
                tipográfica entraba en el nombre accesible. */}
            {events.length > 2 && (
              <Button variant="ghost" size="sm" onClick$={scrollToLatest$}>
                <Icon name="chevron-down" />
                <span>{translate(locale, "Ir al último movimiento")}</span>
              </Button>
            )}
            {responsible ? (
              <Badge tone="brand">
                {translate(locale, "Responsable: {{name}}", {
                  name: responsible.name,
                })}
              </Badge>
            ) : (
              <Badge tone="neutral">
                {translate(locale, "Sin organismo asignado")}
              </Badge>
            )}
          </div>
        </div>

        {/* Filtros rápidos por tipo de evento */}
        {events.length > 1 && (
          <div
            role="group"
            aria-labelledby={filterLabelId}
            class="mt-4 flex flex-wrap items-center gap-2 text-xs"
          >
            <span id={filterLabelId} class="font-medium text-ink-faint">
              {translate(locale, "Filtrar eventos:")}
            </span>
            {/* El contador sigue a los filtros de temas de la comunidad, con
                un velo oscuro y no blanco sobre el relleno del chip elegido:
                con blanco, el número de 10 px quedaba en 3,97:1 en claro y
                3,08:1 en oscuro, debajo del 4,5:1 de WCAG 1.4.3. */}
            {visibleFilters.map((filter) => {
              const selected = selectedFilter.value === filter.key;
              return (
                <Chip
                  key={filter.key}
                  icon={filter.icon}
                  selected={selected}
                  onClick$={() => {
                    selectedFilter.value = filter.key;
                  }}
                >
                  <span>{filter.label}</span>
                  <span
                    class={cx(
                      "rounded-full px-1.5 py-0.5 text-3xs tabular-nums",
                      selected
                        ? "bg-black/20 text-white"
                        : "bg-inset text-ink-muted",
                    )}
                  >
                    {filter.count}
                  </span>
                </Chip>
              );
            })}
            <p
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class="w-full text-ink-muted"
            >
              {translate(locale, "Mostrando {{shown}} de {{total}} eventos.", {
                shown: formatNumber(filteredEvents.length, locale),
                total: formatNumber(events.length, locale),
              })}
            </p>
          </div>
        )}

        {/* Tres de los reclamos de la base no tienen ni un evento: el `<ol>`
            salía vacío debajo del título y la página parecía cortada. El
            silencio institucional es información, pero hay que decirlo. Con
            el estado vacío del sistema (D126): el emoji del agujero se veía
            como una mancha negra. */}
        {events.length === 0 && (
          <div class="mt-5">
            <EmptyState
              illustration="empty"
              title="Todavía no hay novedades"
              description="Nadie publicó una respuesta ni una actualización. Cuando alguna institución acuse recibo, va a aparecer acá con su fecha y su evidencia."
            />
          </div>
        )}

        {events.length > 0 && filteredEvents.length === 0 ? (
          <div class="mt-5 rounded-2xl border border-subtle bg-surface p-6 text-center">
            <p class="text-sm text-ink-muted">
              {translate(
                locale,
                "No hay eventos registrados para este filtro.",
              )}
            </p>
            <button
              type="button"
              onClick$={() => {
                selectedFilter.value = "all";
              }}
              class="mt-3 inline-flex items-center rounded-xl bg-muted px-3 py-1.5 text-xs font-semibold text-ink-strong hover:bg-subtle"
            >
              {translate(locale, "Ver todos los eventos")}
            </button>
          </div>
        ) : (
          <ol class="mt-5 space-y-0">
            {filteredEvents.map((event, index) => {
              const isLatest = index === filteredEvents.length - 1;
              const isOfficial = isOfficialClaimEvent(event);
              const isEvidence =
                event.event_type === "evidence" || !!event.evidence_url;
              const isStatus = event.event_type === "status_change";

              // Tokens del tema y no la paleta cruda: el violeta queda para la
              // navegación y lo demás toma el color del reclamo (D123).
              const dotColor = isOfficial
                ? "bg-success-500"
                : isEvidence
                  ? "bg-data-500"
                  : isStatus
                    ? "bg-warn-500"
                    : "bg-kind-claim";

              const badgeTone = isOfficial
                ? "success"
                : isStatus
                  ? "warn"
                  : "neutral";

              return (
                <li
                  key={event.id}
                  id={isLatest ? "timeline-latest-event" : undefined}
                  class="relative flex gap-4 pb-6"
                >
                  {index < filteredEvents.length - 1 && (
                    <span
                      aria-hidden="true"
                      class="absolute left-[0.7rem] top-6 h-full w-0.5 bg-[var(--border-strong)] opacity-60"
                    />
                  )}
                  <span
                    aria-hidden="true"
                    class={cx(
                      "relative mt-1 size-6 shrink-0 rounded-full border-4 border-[var(--surface-app)] transition-all",
                      dotColor,
                      isOfficial && "ring-4 ring-success-500/25 shadow-xs",
                      isLatest &&
                        !isOfficial &&
                        "ring-4 ring-kind-claim/20 shadow-xs",
                    )}
                  />
                  <div
                    class={cx(
                      "min-w-0 flex-1 rounded-2xl p-3 transition-colors",
                      isLatest
                        ? "bg-muted/80 border border-subtle/50 shadow-2xs"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 dir="auto" class="font-semibold text-ink-strong">
                        {localizeClaimEventTitle(
                          locale,
                          event.title,
                          event.status,
                        )}
                      </h3>
                      <Badge tone={badgeTone}>
                        {translate(
                          locale,
                          event.event_type === "resolution"
                            ? event.organization_id
                              ? "Resolución institucional"
                              : "Resolución ciudadana"
                            : (EVENT_LABEL[
                                event.event_type as keyof typeof EVENT_LABEL
                              ] ?? event.event_type),
                        )}
                      </Badge>
                      <time
                        dateTime={event.event_date}
                        class="ml-auto text-xs text-ink-faint tabular-nums"
                      >
                        {formatDate(event.event_date, locale)}
                      </time>
                    </div>
                    {event.organization_id && (
                      <p class="mt-1 text-xs font-medium text-ink-muted">
                        {event.organization ? (
                          <>
                            {translate(locale, "Institución:")}{" "}
                            <bdi dir="auto">{event.organization.name}</bdi>
                          </>
                        ) : (
                          translate(locale, "Institución no disponible")
                        )}
                      </p>
                    )}
                    {event.body && (
                      <p
                        dir="auto"
                        class="ugc-text mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-muted"
                      >
                        {event.body}
                      </p>
                    )}
                    {event.evidence_url && (
                      <a
                        href={event.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-2 inline-block text-sm font-medium text-brand hover:underline"
                      >
                        {translate(locale, "Ver evidencia")}
                        <ExternalLinkHint />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {canManage && organizations.length > 0 && (
          <Card class="p-4">
            <Form action={assign} class="flex flex-wrap items-end gap-3">
              <input type="hidden" name="claim_id" value={claimId} />
              <Field
                name="organization_id"
                label="Organismo responsable"
                class="min-w-64 flex-1"
              >
                <Select name="organization_id">
                  <option value="">{translate(locale, "Sin asignar")}</option>
                  {organizations.map((org) => (
                    <option
                      key={org.id}
                      value={org.id}
                      selected={org.id === responsible?.id}
                    >
                      {org.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <SubmitButton variant="secondary" pending={assign.isRunning}>
                {translate(locale, "Asignar")}
              </SubmitButton>
              {assign.value?.message && (
                <Alert class="w-full">
                  {translate(locale, assign.value.message)}
                </Alert>
              )}
              {assign.value?.assigned && (
                <p
                  role="status"
                  class="w-full text-sm font-medium text-success"
                >
                  {translate(locale, "Organismo asignado.")}
                </p>
              )}
            </Form>
          </Card>
        )}

        {canUpdate && (
          <Card class="mt-4 p-5">
            {feedback.value && "added" in feedback.value && (
              <p
                role="status"
                aria-live="polite"
                class="mb-3 text-sm font-medium text-success"
              >
                {translate(
                  locale,
                  "La actualización se publicó en el seguimiento.",
                )}
              </p>
            )}
            <h3 class="font-semibold">
              {translate(locale, "Agregar una actualización")}
            </h3>
            <Form action={addEvent} class="mt-4 space-y-3">
              <PublicationError
                value={feedback.value}
                title="No se publicó la actualización"
                fieldIdPrefix={fieldPrefix}
              />
              <input type="hidden" name="claim_id" value={claimId} />
              <input
                type="hidden"
                name="organization_id"
                value={myOrganizationId ?? ""}
              />
              <div class="grid gap-3 sm:grid-cols-2">
                <Field
                  name={`${fieldPrefix}event_type`}
                  label="Tipo"
                  required
                  error={feedback.value?.fieldErrors?.event_type}
                >
                  <Select
                    id={`${fieldPrefix}event_type`}
                    name="event_type"
                    required
                    value={draft.event_type}
                    onChange$={(_, el) => (draft.event_type = el.value)}
                  >
                    <option
                      value="update"
                      selected={draft.event_type === "update"}
                    >
                      {translate(locale, "Actualización")}
                    </option>
                    <option
                      value="evidence"
                      selected={draft.event_type === "evidence"}
                    >
                      {translate(locale, "Nueva evidencia")}
                    </option>
                    {canRespondOfficially && (
                      <option
                        value="official_response"
                        selected={draft.event_type === "official_response"}
                      >
                        {translate(locale, "Respuesta oficial")}
                      </option>
                    )}
                    <option
                      value="resolution"
                      selected={draft.event_type === "resolution"}
                    >
                      {translate(
                        locale,
                        myOrganizationId
                          ? "Resolución institucional"
                          : "Resolución ciudadana",
                      )}
                    </option>
                  </Select>
                </Field>
                <Field
                  name={`${fieldPrefix}event_date`}
                  label="Fecha"
                  error={feedback.value?.fieldErrors?.event_date}
                >
                  <Input
                    id={`${fieldPrefix}event_date`}
                    name="event_date"
                    type="date"
                    value={draft.event_date}
                    onInput$={(_, el) => (draft.event_date = el.value)}
                    aria-invalid={
                      feedback.value?.fieldErrors?.event_date
                        ? "true"
                        : undefined
                    }
                  />
                </Field>
              </div>
              <Field
                name={`${fieldPrefix}title`}
                label="Título"
                required
                error={feedback.value?.fieldErrors?.title}
              >
                <Input
                  id={`${fieldPrefix}title`}
                  name="title"
                  required
                  maxLength={180}
                  value={draft.title}
                  onInput$={(_, el) => (draft.title = el.value)}
                  aria-invalid={
                    feedback.value?.fieldErrors?.title ? "true" : undefined
                  }
                  aria-describedby={
                    feedback.value?.fieldErrors?.title
                      ? `${fieldPrefix}title-error`
                      : undefined
                  }
                />
              </Field>
              <Field
                name={`${fieldPrefix}body`}
                label="Detalle"
                error={feedback.value?.fieldErrors?.body}
              >
                <Textarea
                  id={`${fieldPrefix}body`}
                  name="body"
                  rows={4}
                  maxLength={3000}
                  value={draft.body}
                  onInput$={(_, el) => (draft.body = el.value)}
                  aria-invalid={
                    feedback.value?.fieldErrors?.body ? "true" : undefined
                  }
                />
              </Field>
              <div class="grid gap-3 sm:grid-cols-2">
                {canChangeStatus && (
                  <Field
                    name={`${fieldPrefix}status`}
                    label="Nuevo estado"
                    error={feedback.value?.fieldErrors?.status}
                  >
                    <Select
                      id={`${fieldPrefix}status`}
                      name="status"
                      value={draft.status}
                      onChange$={(_, el) => (draft.status = el.value)}
                    >
                      <option value="" selected={draft.status === ""}>
                        {translate(locale, "Sin cambiar")}
                      </option>
                      <option value="open" selected={draft.status === "open"}>
                        {translate(locale, "Abierto")}
                      </option>
                      <option
                        value="under_review"
                        selected={draft.status === "under_review"}
                      >
                        {translate(locale, "En evaluación")}
                      </option>
                      <option
                        value="acknowledged"
                        selected={draft.status === "acknowledged"}
                      >
                        {translate(locale, "Recibido")}
                      </option>
                      <option
                        value="in_progress"
                        selected={draft.status === "in_progress"}
                      >
                        {translate(locale, "En ejecución")}
                      </option>
                      <option
                        value="resolved"
                        selected={draft.status === "resolved"}
                      >
                        {translate(locale, "Resuelto")}
                      </option>
                      <option
                        value="rejected"
                        selected={draft.status === "rejected"}
                      >
                        {translate(locale, "Respuesta negativa")}
                      </option>
                    </Select>
                  </Field>
                )}
                <Field
                  name={`${fieldPrefix}evidence_url`}
                  label="Enlace de evidencia"
                  error={feedback.value?.fieldErrors?.evidence_url}
                >
                  <Input
                    id={`${fieldPrefix}evidence_url`}
                    name="evidence_url"
                    type="url"
                    inputMode="url"
                    placeholder="https://…"
                    value={draft.evidence_url}
                    onInput$={(_, el) => (draft.evidence_url = el.value)}
                    aria-invalid={
                      feedback.value?.fieldErrors?.evidence_url
                        ? "true"
                        : undefined
                    }
                  />
                </Field>
              </div>
              <SubmitButton pending={addEvent.isRunning}>
                {translate(locale, "Publicar actualización")}
              </SubmitButton>
            </Form>
          </Card>
        )}
      </section>
    );
  },
);
