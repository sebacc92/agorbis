import {
  $,
  component$,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Icon,
  Alert,
  Button,
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  SubmitButton,
  buttonClass,
  cx,
  triggerHapticFeedback,
  type IconName,
} from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { playCivicSound } from "~/lib/audio-feedback";

import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { readCursor } from "~/lib/cursor";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATIONS_PAGE_SIZE,
  NOTIFICATION_PREFERENCES,
  NOTIFICATION_TYPES,
  notificationFilterArguments,
  notificationInboxPage,
  notificationListHref,
  notificationPageCounts,
  notificationVisual,
  readNotificationFilters,
  type NotificationType,
} from "~/lib/notifications";
import { localizeNotificationBody } from "~/lib/localize-system-text";
import { invalidateViewer, requireUser, supabase } from "~/lib/session";
import { nativeActionHref } from "~/lib/native-action-href";
import { notificationPreferenceDraft } from "~/lib/notification-preference-draft";
import { useLocaleLoader, useViewer } from "../layout";

export const useNotifications = routeLoader$(
  async (ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);
    const cursor = readCursor(ev.url.searchParams);
    const filters = readNotificationFilters(ev.url.searchParams);
    const [inbox, preferences, communities] = await Promise.all([
      db.rpc("notification_inbox", {
        ...notificationFilterArguments(filters),
        p_before_created: cursor?.created_at,
        p_before_id: cursor?.id,
        p_limit: NOTIFICATIONS_PAGE_SIZE,
      }),
      db
        .from("notification_preferences")
        .select(
          "replies, poll_results, claim_updates, project_updates, institutional_responses",
        )
        .eq("user_id", viewer.userId)
        .maybeSingle(),
      db.rpc("notification_communities"),
    ]);
    const loadError = inbox.error ?? preferences.error ?? communities.error;
    if (loadError) {
      logFailure({ scope: "notificaciones/cargar" }, loadError);
      throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
    }
    return {
      ...notificationInboxPage(inbox.data),
      filters,
      cursor,
      hasCursor: Boolean(cursor),
      filtered: Boolean(
        filters.unreadOnly || filters.type || filters.communityId,
      ),
      preferences: preferences.data ?? DEFAULT_NOTIFICATION_PREFERENCES,
      communities: communities.data ?? [],
    };
  },
  { search: ["sin_leer", "tipo", "comunidad", "antes", "id"] },
);

// IIFEs `@__PURE__` (como en `~/lib/url`): sin la anotación, estas llamadas
// de nivel superior a zod no se pueden descartar en el cliente y el chunk de
// la página arrastraba zod entero aunque sólo las usen las actions.
const filterSchema = /* @__PURE__ */ (() => ({
  sin_leer: z.enum(["", "1"]).optional(),
  tipo: z
    .enum(
      NOTIFICATION_TYPES.map(({ value }) => value) as [
        NotificationType,
        ...NotificationType[],
      ],
    )
    .optional(),
  comunidad: z.string().uuid().optional().or(z.literal("")),
}))();

export const useReadNotifications = routeAction$(
  async (data, ev) => {
    await requireUser(ev);
    const filters = readNotificationFilters(
      new URLSearchParams({
        sin_leer: data.sin_leer ?? "",
        tipo: data.tipo ?? "",
        comunidad: data.comunidad ?? "",
      }),
    );
    const { data: updated, error } = await supabase(ev).rpc(
      "mark_notifications_read",
      {
        ...notificationFilterArguments(filters),
        p_notification_id: data.notification_id || undefined,
      },
    );
    if (
      error ||
      !Number.isSafeInteger(updated) ||
      updated === null ||
      updated < 0
    ) {
      logFailure(
        { scope: "notificaciones/marcar-leidas" },
        error ?? new Error("La base no confirmó el marcado de notificaciones."),
      );
      return ev.fail(400, {
        message: "No pudimos marcar las notificaciones como leídas.",
      });
    }
    if (updated > 0 && ev.internalRequest !== "action") invalidateViewer(ev);
    return { done: true as const, updated };
  },
  {
    validation: [
      zod$({
        notification_id: z.string().uuid().optional().or(z.literal("")),
        ...filterSchema,
      }),
    ],
    invalidate: [useNotifications, useViewer],
  },
);

const preferenceValue = /* @__PURE__ */ (() => z.enum(["on"]).optional())();
export const useSaveNotificationPreferences = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const savedPreferences = {
      replies: data.replies === "on",
      poll_results: data.poll_results === "on",
      claim_updates: data.claim_updates === "on",
      project_updates: data.project_updates === "on",
      institutional_responses: data.institutional_responses === "on",
    };
    const { error } = await supabase(ev)
      .from("notification_preferences")
      .upsert(
        {
          user_id: viewer.userId,
          ...savedPreferences,
        },
        { onConflict: "user_id" },
      );
    if (error) {
      logFailure({ scope: "notificaciones/preferencias" }, error);
      return ev.fail(400, {
        message: "No pudimos guardar tus preferencias. Probá de nuevo.",
      });
    }
    return { saved: true as const, preferences: savedPreferences };
  },
  zod$({
    replies: preferenceValue,
    poll_results: preferenceValue,
    claim_updates: preferenceValue,
    project_updates: preferenceValue,
    institutional_responses: preferenceValue,
  }),
);

interface QuickFilter {
  id: string;
  label: string;
  href: string;
  isActive: boolean;
  icon?: IconName;
  /** Relleno del seleccionado cuando el filtro es un tipo de contenido. */
  selectedClass?: string;
  count?: number;
}

export default component$(() => {
  const notifications = useNotifications();
  const read = useReadNotifications();
  const preferences = useSaveNotificationPreferences();
  const locale = useLocale();
  const { items, total, unread, filters, filtered, hasCursor } =
    notifications.value;
  const firstPageHref = notificationListHref(filters);
  const inboxHref = useComputed$(() =>
    notificationListHref(
      notifications.value.filters,
      notifications.value.cursor ?? undefined,
    ).replace("/notificaciones", "/notificaciones/"),
  );
  const filterDraft = useStore({ ...filters });
  const appliedFilterContext = useSignal(inboxHref.value);
  useTask$(({ track }) => {
    const context = track(() => inboxHref.value);
    if (context === appliedFilterContext.value) return;
    appliedFilterContext.value = context;
    // Una navegación aplica su URL. Releer los avisos en el mismo contexto
    // conserva también las opciones que todavía no se enviaron.
    Object.assign(filterDraft, notifications.value.filters);
  });
  // Los chips sólo cubren un tipo o "sin leer" por separado; el panel se
  // abre solo cuando el filtro vigente combina dimensiones que no reflejan.
  const showAdvancedFilters = useSignal(
    Boolean(
      filters.communityId ||
      (filters.type && filters.unreadOnly) ||
      filters.type === "essential",
    ),
  );
  const isSpeaking = useSignal(false);
  const preferenceDraft = useSignal(
    notificationPreferenceDraft(
      notifications.value.preferences,
      preferences.formData,
    ),
  );
  const preferencesExpanded = useSignal(!!preferences.formData);
  useTask$(({ track }) => {
    const result = track(() => preferences.value);
    if (result?.failed) preferencesExpanded.value = true;
  });
  const savedPreferences = useSignal({ ...notifications.value.preferences });
  const preferencesDirty = useComputed$(() =>
    NOTIFICATION_PREFERENCES.some(
      ({ key }) => preferenceDraft.value[key] !== savedPreferences.value[key],
    ),
  );

  // La voz pertenece a esta pantalla: una navegación no debe dejarla hablando.
  // eslint-disable-next-line qwik/no-use-visible-task -- registra únicamente el cleanup del audio del navegador
  useVisibleTask$(
    ({ cleanup }) => {
      cleanup(() => {
        if (isSpeaking.value && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          isSpeaking.value = false;
        }
      });
    },
    { strategy: "document-ready" },
  );

  const pageCounts = notificationPageCounts(items);

  const handleReadCompleted = $(
    (event: CustomEvent<{ status: number; value: unknown }>) => {
      const result = event.detail.value as
        { done?: boolean; updated?: number } | undefined;
      if (
        event.detail.status < 200 ||
        event.detail.status >= 300 ||
        result?.done !== true ||
        typeof result.updated !== "number" ||
        result.updated <= 0
      )
        return;
      // Marcar leídas confirma una tarea, no festeja un logro: ya no hay
      // confeti ni sonido de celebración al vaciar la bandeja (D96).
      triggerHapticFeedback("success");
      playCivicSound("click");
    },
  );

  const handleToggleSpeech = $(() => {
    if (typeof window === "undefined") return;
    if (isSpeaking.value) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      isSpeaking.value = false;
      playCivicSound("toggle");
      return;
    }

    if (!("speechSynthesis" in window)) {
      showToast(
        translate(
          locale,
          "Tu navegador no cuenta con lector de voz integrado.",
        ),
        "info",
      );
      return;
    }

    playCivicSound("click");
    triggerHapticFeedback("medium");
    window.speechSynthesis.cancel();

    const textToSpeak = translate(
      locale,
      "Resumen de esta página. Hay {{shown}} notificaciones visibles y {{unread}} sin leer. Entre ellas: {{claims}} actualizaciones de reclamos, {{replies}} respuestas en debates, {{institutional}} respuestas institucionales y {{polls}} cierres de encuestas.",
      {
        ...pageCounts,
      },
    );

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = locale === "en" ? "en-US" : "es-AR";
    utterance.rate = 1.05;
    utterance.onend = () => {
      isSpeaking.value = false;
    };
    utterance.onerror = () => {
      isSpeaking.value = false;
    };
    isSpeaking.value = true;
    window.speechSynthesis.speak(utterance);
  });

  // Las etiquetas se traducen acá, con literales: pasaban por una variable
  // que check-i18n no ve, y "Sin leer", "Oficiales" y la de reclamos salían
  // en castellano en inglés. Los tipos de contenido prestan su ícono y el
  // color del seleccionado, como los filtros del feed.
  const quickFilters: QuickFilter[] = [
    {
      id: "all",
      label: translate(locale, "Todas"),
      href: "/notificaciones",
      isActive: !filters.unreadOnly && !filters.type,
      count: total,
    },
    {
      id: "unread",
      label: translate(locale, "Sin leer"),
      href: "/notificaciones?sin_leer=1",
      isActive: Boolean(filters.unreadOnly) && !filters.type,
      count: unread,
    },
    {
      id: "claim_update",
      label: translate(locale, "Reclamos y victorias"),
      href: "/notificaciones?tipo=claim_update",
      isActive: filters.type === "claim_update",
      icon: "megaphone",
      selectedClass: CONTENT_KIND_TONES.claim.selected,
    },
    {
      id: "reply",
      label: translate(locale, "Respuestas"),
      href: "/notificaciones?tipo=reply",
      isActive: filters.type === "reply",
      icon: "chat",
    },
    {
      id: "poll_closed",
      label: translate(locale, "Encuestas"),
      href: "/notificaciones?tipo=poll_closed",
      isActive: filters.type === "poll_closed",
      icon: "ballot",
      selectedClass: CONTENT_KIND_TONES.poll.selected,
    },
    {
      id: "institutional_response",
      label: translate(locale, "Oficiales"),
      href: "/notificaciones?tipo=institutional_response",
      isActive: filters.type === "institutional_response",
      icon: "building",
    },
    {
      id: "project_update",
      label: translate(locale, "Proyectos"),
      href: "/notificaciones?tipo=project_update",
      isActive: filters.type === "project_update",
      icon: "hammer",
      selectedClass: CONTENT_KIND_TONES.project.selected,
    },
  ];

  return (
    <div class="container-content py-8">
      <header class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight">
            {translate(locale, "Notificaciones")}
          </h1>
          <p class="mt-1 text-ink-muted">
            {translate(
              locale,
              "Respuestas y cambios que requieren tu atención.",
            )}
          </p>
          {/* Los conteos incluyen todas las coincidencias del filtro y no
              cambian al recorrer sus páginas. La campana conserva el total. */}
          {total > 0 && (
            <p class="mt-1.5 text-sm text-ink-faint">
              {filtered || unread > 0
                ? translate(
                    locale,
                    filtered
                      ? "{{unread}} sin leer de {{total}} coincidencias"
                      : "{{unread}} sin leer de {{total}}",
                    {
                      unread: unread,
                      total: total,
                    },
                  )
                : translate(locale, "Estás al día: no hay ninguna sin leer.")}
            </p>
          )}
        </div>
        {/* La lista va primero: el resumen de la página ocupaba media
            pantalla antes del título. Escuchar describe sólo lo visible
            (D80) y las preferencias quedan al final, con su enlace acá. */}
        <div class="flex flex-wrap items-center gap-2">
          {/* Primero lo que cambia la bandeja, después la herramienta de
              lectura y al final el enlace a las preferencias. */}
          {unread > 0 && (
            <Form action={read} onSubmitCompleted$={handleReadCompleted}>
              <input type="hidden" name="notification_id" value="" />
              <input
                type="hidden"
                name="sin_leer"
                value={filters.unreadOnly ? "1" : ""}
              />
              <input type="hidden" name="tipo" value={filters.type} />
              <input
                type="hidden"
                name="comunidad"
                value={filters.communityId}
              />
              <SubmitButton
                variant="secondary"
                size="sm"
                formAction={nativeActionHref(inboxHref.value, read.actionPath)}
                pending={
                  read.isRunning && !read.formData?.get("notification_id")
                }
              >
                {translate(
                  locale,
                  filtered
                    ? "Marcar coincidencias como leídas"
                    : "Marcar todas como leídas",
                )}
              </SubmitButton>
            </Form>
          )}
          {items.length > 0 && (
            <>
              <button
                type="button"
                onClick$={handleToggleSpeech}
                aria-describedby="resumen-alcance"
                // La misma anatomía que "Marcar todas como leídas": eran
                // tres acciones con tres alturas, radios y cuerpos de letra.
                class={buttonClass(
                  "secondary",
                  "sm",
                  // Detener no destruye nada: el relleno de marca dice "en
                  // curso" sin el rojo de una acción peligrosa.
                  cx(
                    "gap-1.5",
                    isSpeaking.value &&
                      "border-brand-600 bg-brand-600 text-white hover:bg-brand-700",
                  ),
                )}
                aria-label={
                  isSpeaking.value
                    ? translate(locale, "Detener audio")
                    : translate(locale, "Escuchar resumen auditivo")
                }
              >
                <Icon
                  name={isSpeaking.value ? "stop" : "volume"}
                  class="text-sm"
                />
                <span>
                  {isSpeaking.value
                    ? translate(locale, "Detener audio")
                    : translate(locale, "Escuchar resumen")}
                </span>
              </button>
              <span id="resumen-alcance" class="sr-only">
                {translate(
                  locale,
                  "Lee las notificaciones de esta página, con los filtros actuales.",
                )}
              </span>
            </>
          )}
          <a
            href="#preferencias"
            class="inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-semibold text-brand hover:bg-muted hover:underline"
          >
            {translate(locale, "Elegir qué recibir")}
            <Icon name="chevron-down" class="ml-1 text-sm" />
          </a>
        </div>
      </header>
      {/* Filtros rápidos con el chip único (D126): eran siete píldoras
          propias con emoji. Las clases de 44 px van por `class` porque la
          fila se recorre con el dedo y los E2E miden ese mínimo. */}
      <div class="mb-5 space-y-3">
        <div class="scrollbar-slim -mx-4 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:px-0">
          {quickFilters.map((tab) => (
            <Chip
              key={tab.id}
              href={
                filters.communityId
                  ? `${tab.href}${tab.href.includes("?") ? "&" : "?"}comunidad=${filters.communityId}`
                  : tab.href
              }
              selected={tab.isActive}
              icon={tab.icon}
              selectedClass={tab.selectedClass}
              onClick$={() => {
                triggerHapticFeedback("selection");
                playCivicSound("toggle");
              }}
              class="min-h-11 min-w-11 shrink-0 snap-start"
            >
              <span>{tab.label}</span>
              {typeof tab.count === "number" && tab.count > 0 && (
                <span
                  class={cx(
                    "rounded-full px-1.5 py-0.5 text-3xs font-semibold tabular-nums",
                    tab.isActive
                      ? "bg-white/20 text-white"
                      : "bg-inset text-ink-muted",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Chip>
          ))}
        </div>

        {filtered && (
          <Chip
            variant="action"
            href="/notificaciones"
            icon="x"
            class="min-h-11"
          >
            {translate(locale, "Limpiar filtros")}
          </Chip>
        )}
        <details
          open={showAdvancedFilters.value}
          onToggle$={(_, element) => (showAdvancedFilters.value = element.open)}
          class="group rounded-2xl border border-subtle bg-surface p-4"
        >
          {/* Sin el triángulo nativo, que Chromium dibujaba aunque el resto
              de la app ya usara chevron: ícono, texto y chevron, como "Más
              herramientas" en la comunidad. */}
          <summary
            aria-controls="notification-filters"
            class="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-strong [&::-webkit-details-marker]:hidden"
          >
            <Icon name="filter" class="text-base text-ink-muted" />
            <span class="flex-1">
              {showAdvancedFilters.value
                ? translate(locale, "Ocultar filtros")
                : translate(locale, "Más filtros")}
            </span>
            <Icon
              name="chevron-down"
              class="text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none"
            />
          </summary>
          {/* Filtros combinables (tipo, comunidad y sólo sin leer): los chips
            no permiten cruzar un tipo con "sin leer" ni elegir los avisos
            esenciales, y el marcado masivo respeta exactamente este filtro. */}
          <form
            id="notification-filters"
            method="get"
            action="/notificaciones"
            class="flex flex-wrap items-end gap-3 rounded-2xl border border-subtle bg-surface p-4 shadow-xs animate-scale-pop"
            aria-label={translate(locale, "Filtrar notificaciones")}
          >
            {locale === "en" && <input type="hidden" name="lang" value="en" />}

            <label class="min-w-44 flex-1 text-xs font-semibold text-ink-strong">
              {translate(locale, "Tipo de notificación")}
              <select
                name="tipo"
                value={filterDraft.type}
                onChange$={(_, element) =>
                  (filterDraft.type = element.value as NotificationType)
                }
                class="mt-1 min-h-10 w-full rounded-xl border border-control bg-surface px-3 text-xs"
              >
                {NOTIFICATION_TYPES.map((option) => (
                  <option
                    key={option.value || "all-notification-types"}
                    value={option.value}
                    selected={option.value === filterDraft.type}
                  >
                    {translate(locale, option.label)}
                  </option>
                ))}
              </select>
            </label>

            <label class="min-w-44 flex-1 text-xs font-semibold text-ink-strong">
              {translate(locale, "Comunidad")}
              <select
                name="comunidad"
                value={filterDraft.communityId}
                onChange$={(_, element) =>
                  (filterDraft.communityId = element.value)
                }
                class="mt-1 min-h-10 w-full rounded-xl border border-control bg-surface px-3 text-xs"
              >
                <option
                  key="all-communities"
                  value=""
                  selected={!filterDraft.communityId}
                >
                  {translate(locale, "Todas las comunidades")}
                </option>
                {filters.communityId &&
                  !notifications.value.communities.some(
                    (community) =>
                      community.community_id === filters.communityId,
                  ) && (
                    <option
                      key={`unavailable-${filters.communityId}`}
                      value={filters.communityId}
                      selected={filters.communityId === filterDraft.communityId}
                    >
                      {translate(locale, "Comunidad sin notificaciones")}
                    </option>
                  )}
                {notifications.value.communities.map((community) => (
                  <option
                    key={community.community_id}
                    value={community.community_id}
                    selected={
                      community.community_id === filterDraft.communityId
                    }
                  >
                    {community.name}
                  </option>
                ))}
              </select>
            </label>

            <label class="flex min-h-10 items-center gap-2 text-xs font-semibold text-ink-strong">
              <input
                type="checkbox"
                name="sin_leer"
                value="1"
                checked={filterDraft.unreadOnly}
                onChange$={(_, element) =>
                  (filterDraft.unreadOnly = element.checked)
                }
                class="size-4 accent-brand-600"
              />
              {translate(locale, "Sólo sin leer")}
            </label>

            {/* `Button` usa "button" por defecto: este sí envía el GET. */}
            <Button type="submit" size="sm">
              {translate(locale, "Aplicar filtros")}
            </Button>
          </form>
        </details>
      </div>
      {read.value?.failed && (
        <Alert class="mb-4">
          {translate(
            locale,
            read.value.message ??
              "No pudimos marcar las notificaciones como leídas.",
          )}
        </Alert>
      )}
      {read.value?.done && !read.isRunning && (
        <Alert tone="success" class="mb-4">
          {read.value.updated > 0
            ? translate(
                locale,
                "Notificaciones marcadas como leídas: {{count}}.",
                { count: read.value.updated },
              )
            : translate(
                locale,
                "No había notificaciones sin leer en esta selección.",
              )}
        </Alert>
      )}
      {items.length === 0 ? (
        /* Llegar al final de la lista paginada no es lo mismo que no tener
           ninguna: el texto de bienvenida ahí es desconcertante. */
        hasCursor ? (
          <EmptyState
            illustration="empty"
            title="No hay notificaciones más viejas"
            description="Llegaste al final de tu historial."
          >
            <ButtonLink href={firstPageHref} variant="secondary">
              {translate(locale, "Volver a las últimas")}
            </ButtonLink>
          </EmptyState>
        ) : filtered ? (
          <EmptyState
            illustration="search"
            title="No hay notificaciones con estos filtros"
            description="Podés cambiar el tipo o la comunidad, o volver a mostrar las leídas."
          >
            <ButtonLink href="/notificaciones" variant="secondary">
              {translate(locale, "Quitar filtros")}
            </ButtonLink>
          </EmptyState>
        ) : (
          <EmptyState
            illustration="empty"
            title="No tenés notificaciones"
            description="Las respuestas, cierres y avances van a aparecer acá."
          />
        )
      ) : (
        <ol class="space-y-2">
          {items.map((item) => {
            const visual = notificationVisual(item.type, item.entity_type);
            return (
              <li key={item.id}>
                {/* La tarjeta ocupa el ancho de la pantalla pero sólo el
                    título era tocable: un blanco de un renglón dentro de una
                    caja de cien. El enlace se estira sobre toda la tarjeta
                    (`after:inset-0`) y el botón de "marcar leída" queda por
                    encima, así que cada uno sigue haciendo lo suyo. */}
                <Card
                  class={cx(
                    "relative p-4",
                    !item.read_at &&
                      "border-brand-500/40 bg-brand-50/40 dark:bg-brand-950/20",
                  )}
                >
                  <div class="flex gap-3">
                    {/* La ficha de tipo de la portada: ícono y color de lo
                        que originó el aviso, no un emoji por `type`. */}
                    <span
                      aria-hidden="true"
                      class={cx(
                        "grid size-10 shrink-0 place-items-center rounded-xl text-lg",
                        visual.tone,
                      )}
                    >
                      <Icon name={visual.icon} />
                    </span>
                    <div class="min-w-0 flex-1">
                      {/* En el teléfono el título ocupa el renglón entero y la
                          hora va debajo, a la izquierda, como un dato más:
                          a la derecha quedaba sola en un renglón, y junto
                          al título lo apretaba en cuatro. Desde `sm` va a
                          la derecha del título. */}
                      <div class="flex flex-wrap items-start gap-x-2 gap-y-0.5 sm:flex-nowrap">
                        {/* Punto y título van en un grupo sin wrap: sueltos
                            en esta fila, un título que no entraba al lado del
                            punto (casi todos en un teléfono) bajaba de
                            renglón y dejaba el punto solo arriba. */}
                        <div class="flex min-w-0 basis-full items-start gap-2 sm:basis-0 sm:flex-1">
                          {/* El punto reemplaza al badge "Nueva" que
                              repetían todas las filas sin leer. Va fuera del
                              botón, igual que su texto para lectores, porque
                              el nombre del botón es el título y nada más.
                              Violeta y no rosa: el rosa es de los reclamos. */}
                          {!item.read_at && (
                            <>
                              <span
                                aria-hidden="true"
                                class="mt-2 size-2 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400"
                              />
                              <span class="sr-only">
                                {translate(locale, "Sin leer")}
                              </span>
                            </>
                          )}
                          {/* Una no leída usa POST: los scanners y
                              prefetchers pueden seguir links GET, pero nunca
                              deben cambiar el estado de la bandeja. La
                              navegación ya leída sigue siendo un enlace
                              convencional. */}
                          {item.read_at ? (
                            <Link
                              href={item.href}
                              class="font-semibold text-ink-strong after:absolute after:inset-0 after:rounded-2xl hover:text-brand"
                            >
                              {translate(locale, item.title)}
                            </Link>
                          ) : (
                            <form
                              method="post"
                              action="/notificaciones/abrir/"
                              class="contents"
                            >
                              <input type="hidden" name="id" value={item.id} />
                              <button
                                type="submit"
                                class="cursor-pointer text-left font-semibold text-ink-strong after:absolute after:inset-0 after:rounded-2xl hover:text-brand"
                              >
                                {translate(locale, item.title)}
                              </button>
                            </form>
                          )}
                        </div>
                        <RelativeTime
                          value={item.created_at}
                          class="text-xs text-ink-faint sm:ml-auto sm:shrink-0 sm:whitespace-nowrap sm:pt-0.5"
                        />
                      </div>
                      {item.body && (
                        <p class="mt-1 text-sm text-ink-muted">
                          {localizeNotificationBody(locale, item.body)}
                        </p>
                      )}
                    </div>
                    {!item.read_at && (
                      <Form
                        action={read}
                        onSubmitCompleted$={handleReadCompleted}
                        class="relative"
                      >
                        <input
                          type="hidden"
                          name="notification_id"
                          value={item.id}
                        />
                        {/* Era sólo el glifo: un blanco de ~16 px, la mitad
                            del mínimo táctil. La caja crece sin que cambie
                            el dibujo. */}
                        {/* El pendiente es del ítem que se tocó, no de la
                            lista entera: antes los 40 tildes se apagaban a
                            la vez y no se sabía cuál se estaba marcando. */}
                        <button
                          type="submit"
                          formAction={nativeActionHref(
                            inboxHref.value,
                            read.actionPath,
                          )}
                          disabled={read.isRunning}
                          aria-busy={
                            read.isRunning &&
                            read.formData?.get("notification_id") === item.id
                          }
                          aria-label={translate(locale, "Marcar como leída")}
                          class="grid size-11 place-items-center rounded-2xl text-ink-faint transition-colors hover:bg-muted hover:text-brand disabled:opacity-50"
                        >
                          {read.isRunning &&
                          read.formData?.get("notification_id") === item.id ? (
                            <svg
                              viewBox="0 0 24 24"
                              class="size-4 animate-spin"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2.5"
                              aria-hidden="true"
                            >
                              <circle
                                cx="12"
                                cy="12"
                                r="9"
                                class="opacity-25"
                              />
                              <path
                                stroke-linecap="round"
                                d="M21 12a9 9 0 00-9-9"
                              />
                            </svg>
                          ) : (
                            <Icon name="check" />
                          )}
                        </button>
                      </Form>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {/* Misma paginación por cursor que los listados de comunidad: sólo
          avanza, así que se ofrece siempre la vuelta al principio. */}
      {(notifications.value.nextCursor || hasCursor) && (
        <nav
          aria-label={translate(locale, "Paginación")}
          class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium"
        >
          {hasCursor && (
            <Link
              href={firstPageHref}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              <Icon name="arrow-left" class="mr-1 text-sm" />
              {translate(locale, "Volver a las últimas")}
            </Link>
          )}
          {notifications.value.nextCursor && (
            <Link
              href={notificationListHref(
                filters,
                notifications.value.nextCursor,
              )}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver notificaciones más antiguas")}
              <Icon name="arrow-right" class="ml-1 text-sm" />
            </Link>
          )}
        </nav>
      )}

      <details
        id="preferencias"
        class="group mt-10 mb-4 rounded-2xl border border-subtle bg-surface p-4"
        open={preferencesExpanded.value}
        onToggle$={(_, details) => (preferencesExpanded.value = details.open)}
      >
        {/* La misma anatomía que "Más filtros". El texto va solo en su span
            porque los E2E lo buscan con texto exacto. */}
        <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold text-ink-strong [&::-webkit-details-marker]:hidden">
          <Icon name="settings" class="text-base text-ink-muted" />
          <span class="flex-1">
            {translate(locale, "Qué novedades querés recibir")}
          </span>
          <Icon
            name="chevron-down"
            class="text-ink-faint transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <p class="mt-2 mb-3 text-sm text-ink-muted">
          {translate(
            locale,
            "Elegí los avisos nuevos de contenido. El historial se conserva y podés cambiar estas opciones cuando quieras.",
          )}
        </p>
        <p class="mb-4 text-sm text-ink-muted">
          {translate(
            locale,
            "Los avisos de cuenta, seguridad, moderación y solicitudes siempre se reciben. Estas opciones no cambian los correos de acceso o seguridad.",
          )}
        </p>
        <Form
          action={preferences}
          onSubmitCompleted$={$((event) => {
            const result = event.detail.value as
              | {
                  saved?: boolean;
                  preferences?: typeof DEFAULT_NOTIFICATION_PREFERENCES;
                }
              | undefined;
            if (
              event.detail.status >= 200 &&
              event.detail.status < 300 &&
              result?.saved === true &&
              result.preferences
            ) {
              // Una edición durante el envío sigue pendiente de guardar.
              savedPreferences.value = { ...result.preferences };
            }
          })}
        >
          <div class="grid gap-2 sm:grid-cols-2">
            {NOTIFICATION_PREFERENCES.map((option) => (
              <label
                key={option.key}
                class="flex min-h-12 items-center gap-3 rounded-2xl border border-subtle bg-surface px-3.5 py-2.5 text-sm transition-all duration-150 hover:border-brand-500/40 hover:bg-muted/40 active:scale-[0.99] touch-manipulation cursor-pointer shadow-xs has-checked:border-brand-500/60 has-checked:bg-brand-50/40 dark:has-checked:bg-brand-950/30"
              >
                <input
                  type="checkbox"
                  name={option.key}
                  checked={preferenceDraft.value[option.key]}
                  onChange$={(_, input) => {
                    preferenceDraft.value = {
                      ...preferenceDraft.value,
                      [option.key]: input.checked,
                    };
                  }}
                  class="size-4.5 rounded accent-brand-600"
                />
                <span class="text-ink-strong font-medium">
                  {translate(locale, option.label)}
                </span>
              </label>
            ))}
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton
              size="sm"
              pending={preferences.isRunning}
              formAction={nativeActionHref(
                inboxHref.value,
                preferences.actionPath,
              )}
            >
              {translate(locale, "Guardar preferencias")}
            </SubmitButton>
            <span
              role="status"
              aria-live="polite"
              class="text-sm text-ink-muted"
            >
              {preferencesDirty.value ? (
                translate(locale, "Cambios sin guardar")
              ) : preferences.value?.saved && !preferences.isRunning ? (
                <span class="inline-flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-50/80 px-3 py-1 text-xs font-semibold text-success-700 dark:bg-success-950/60 dark:text-success-300 animate-scale-pop shadow-xs">
                  <Icon name="check" />
                  <span>{translate(locale, "Guardado.")}</span>
                </span>
              ) : null}
            </span>
          </div>
        </Form>
      </details>
      {preferences.value?.failed && (
        <Alert class="mb-4">
          {translate(
            locale,
            preferences.value.message ??
              "No pudimos guardar tus preferencias. Probá de nuevo.",
          )}
        </Alert>
      )}
      {preferences.value?.saved &&
        !preferencesDirty.value &&
        !preferences.isRunning && (
          <Alert tone="success" class="mb-4">
            {translate(locale, "Guardamos tus preferencias de notificaciones.")}
          </Alert>
        )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Notificaciones")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
