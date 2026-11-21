import {
  $,
  component$,
  Slot,
  useOnWindow,
  useSignal,
  useVisibleTask$,
  type QRL,
} from "@qwik.dev/core";
import {
  Link,
  useLocation,
  usePreventNavigate$,
  type PreventNavigateCallback,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { Badge, cx, triggerHapticFeedback } from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import type { CommunityRef } from "~/lib/community";
import { routes } from "~/lib/community";
import { LEVEL_NAMES } from "~/lib/constants";
import type { ContentType } from "~/lib/database.types.helpers";
import { holdFocus } from "~/lib/focus-when-rendered";
import {
  CONTENT_TYPES,
  nextRenewalLabel,
  type QuotaSummary,
} from "~/lib/quota";
import { useLocale, translate } from "~/lib/i18n";
import type { DraftStatus } from "./draft-storage";
import "./native-forms.css";

/**
 * Estado de la red para el indicador de los formularios.
 *
 * Eran dos copias de una tarea visible que se descargaba y corría apenas el
 * formulario aparecía, sólo para quedarse escuchando. Con listeners de Qwik
 * no se baja nada hasta que la red cambia. `pageshow` cubre la carga y la
 * vuelta desde la caché atrás/adelante, que es cuando la página puede
 * aparecer ya sin conexión sin que se dispare `offline`.
 */
function useOnlineStatus() {
  const isOnline = useSignal(true);
  const sync = $(() => {
    isOnline.value = navigator.onLine;
  });
  useOnWindow("online", sync);
  useOnWindow("offline", sync);
  useOnWindow("pageshow", sync);
  return isOnline;
}

/**
 * Cabecera común de los cuatro formularios de creación.
 *
 * Muestra siempre y de forma prominente **dónde se está publicando**: es el
 * dato que más caro sale equivocar, porque el alcance de una encuesta global no
 * tiene nada que ver con el de una municipal. Incluye el selector para cambiar
 * de nivel, con el cupo de cada uno a la vista.
 */
export const FormShell = component$<{
  type: ContentType;
  community: CommunityRef;
  chain: CommunityRef[];
  summary: QuotaSummary;
  title: string;
  subtitle: string;
  draftStatus?: DraftStatus;
  beforeNavigate$?: QRL<PreventNavigateCallback>;
  /**
   * Al aparecer esta rama, lleva el título a la vista y le da el foco. Lo pide
   * cada ruta porque sólo ella sabe por qué se montó: Revisar y Volver a editar
   * sí, una carga directa o un rechazo no (ahí el foco es de `PublicationError`).
   */
  revealOnMount?: boolean;
  /**
   * Numera las secciones del formulario (D124): cada `fieldset` con `legend`
   * y cada bloque con `data-form-section` muestra "1 ·", "2 ·"… por CSS
   * counters (ver `native-forms.css`), sin tocar cada formulario. Opt-in
   * porque un formulario cuyos primeros campos no son `fieldset` arrancaría a
   * contar en el medio.
   */
  numbered?: boolean;
}>(
  ({
    type,
    community,
    chain,
    summary,
    title,
    subtitle,
    draftStatus = "idle",
    beforeNavigate$,
    revealOnMount = false,
    numbered = false,
  }) => {
    // El guard del router necesita un host DOM visible. En las rutas que
    // retornan otro component$ su task visible no llega a registrarse.
    usePreventNavigate$((target) => {
      if (target === undefined) return false;
      return beforeNavigate$?.(target) ?? false;
    });
    const pickerOpen = useSignal(false);
    const isOnline = useOnlineStatus();
    const locale = useLocale();
    const meta = CONTENT_TYPES[type];
    const loc = useLocation();
    const heading = useSignal<HTMLHeadingElement>();
    const revealed = useSignal(false);

    // El formulario mide unos 4000 px y la revisión menos: sin esto, tras Revisar
    // en un teléfono quedaba a la vista el pie, sin rastro de lo escrito y con el
    // foco en el `body`. Cada ruta devuelve este componente desde otra rama y Qwik
    // lo vuelve a montar, así que comparar el título con el anterior nunca dispara.
    //
    // Espera a que termine la acción porque al terminar se redibuja la página y
    // se pierde el foco (ver `holdFocus`, por si ese redibujado llega tarde). Una
    // sola vez, porque el beta puede repetir la tarea (D99) cuando la persona ya
    // siguió de largo. `instant` porque `html` pide scroll suave y `auto` lo
    // heredaría; el margen de las barras ya lo da `html:has([data-community-page])`.
    // eslint-disable-next-line qwik/no-use-visible-task -- foco y scroll tras montar la rama
    useVisibleTask$(
      ({ track, cleanup }) => {
        if (!revealOnMount || revealed.value) return;
        if (track(() => loc.isNavigating)) return;
        const frame = requestAnimationFrame(() => {
          const element = heading.value;
          if (!element) return;
          revealed.value = true;
          element.focus({ preventScroll: true });
          element.scrollIntoView({ block: "start", behavior: "instant" });
          holdFocus(element);
        });
        cleanup(() => cancelAnimationFrame(frame));
      },
      { strategy: "document-ready" },
    );

    // Los niveles de la cadena del usuario donde podría publicar este tipo.
    const targets = summary.entries.filter((e) => e.contentType === type);
    const current = targets.find((t) => t.communitySlug === community.slug);

    return (
      <div
        class="container-reading py-8"
        data-form-numbered={numbered ? "" : undefined}
      >
        <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />

        <header class="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1
              ref={heading}
              tabIndex={-1}
              class="text-display-lg sm:text-display-xl"
            >
              {translate(locale, title)}
            </h1>
            <p class="mt-2 text-ink-muted">{translate(locale, subtitle)}</p>
          </div>
          <div
            data-requires-script
            class="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface px-3 py-1 text-xs font-medium text-ink-muted shadow-xs"
          >
            <span
              class={cx(
                "inline-block size-2 rounded-full",
                draftStatus === "saved"
                  ? "bg-success-500"
                  : draftStatus === "error"
                    ? "bg-danger-500"
                    : "bg-accent-500",
              )}
              aria-hidden="true"
            />
            {/* Sin `role="status"`: la barra `DraftStatusBar` de cada formulario
                ya anuncia el mismo estado, y dos regiones vivas lo leían dos
                veces en cada autoguardado. */}
            <span>
              {translate(
                locale,
                draftStatus === "saved"
                  ? "Borrador guardado en este dispositivo"
                  : draftStatus === "saving"
                    ? "Guardando borrador…"
                    : draftStatus === "error"
                      ? "No pudimos guardar el borrador en este dispositivo"
                      : "Tu borrador se guarda en este dispositivo",
              )}
              {!isOnline.value && <> · {translate(locale, "Sin conexión")}</>}
            </span>
          </div>
        </header>

        {/* Dónde se publica + cambio de nivel. Una barra de una línea que en
            escritorio queda pegada al bajar (D124): el formulario mide miles
            de píxeles y el dato más caro de equivocar, dónde se publica y
            cuánto cupo queda, se perdía arriba. En el teléfono no se pega:
            ya hay dos barras fijas. */}
        <div class="mb-5 lg:sticky lg:top-20 lg:z-20">
          <div class="rounded-2xl border border-subtle bg-surface/95 p-3 backdrop-blur-md sm:px-4">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span
                aria-hidden="true"
                class="grid size-9 shrink-0 place-items-center rounded-xl border border-subtle bg-surface text-lg"
              >
                {community.emoji ?? "📍"}
              </span>

              <p class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <span class="text-xs uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Se publica en")}
                </span>
                <strong class="font-display font-semibold text-ink-strong">
                  {community.name}
                </strong>
                <Badge tone="neutral">
                  {translate(
                    locale,
                    LEVEL_NAMES[community.level] ?? "Comunidad",
                  )}
                </Badge>
                {current && (
                  <span class="text-xs text-ink-muted">
                    {current.remaining === null ? (
                      translate(locale, "Sin límite mensual.")
                    ) : (
                      <>
                        {translate(
                          locale,
                          "Te {{remainingVerb}} {{remaining}} de {{limit}} este mes · se renueva el {{date}}",
                          {
                            remainingVerb: translate(
                              locale,
                              current.remaining === 1 ? "queda" : "quedan",
                            ),
                            remaining: current.remaining,
                            limit: current.monthlyLimit ?? 0,
                            date: nextRenewalLabel(locale),
                          },
                        )}
                      </>
                    )}
                  </span>
                )}
              </p>

              {targets.length > 1 && (
                // Botón propio y no `Chip`: necesita aria-expanded, aria-controls
                // y la marca de "requiere script"; las clases son las del chip.
                <button
                  data-requires-script
                  type="button"
                  class={cx(
                    "inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors",
                    pickerOpen.value
                      ? "border-brand-600 bg-brand-600 text-white dark:border-brand-500 dark:bg-brand-500"
                      : "border-subtle bg-surface text-ink-muted hover:border-strong hover:text-ink-strong",
                  )}
                  aria-expanded={pickerOpen.value}
                  aria-controls="selector-nivel"
                  onClick$={() => (pickerOpen.value = !pickerOpen.value)}
                >
                  {translate(locale, "Cambiar nivel")}
                </button>
              )}
            </div>

            {/* Selector de nivel. Son links: funciona sin JavaScript una vez
                abierto, y con JS cerrado el usuario igual llega por la miga. */}
            {pickerOpen.value && targets.length > 1 && (
              <ul
                id="selector-nivel"
                class="mt-3 space-y-1.5 border-t border-subtle pt-3"
              >
                {targets.map((target) => {
                  const isCurrent = target.communitySlug === community.slug;
                  const exhausted =
                    target.remaining !== null && target.remaining <= 0;
                  return (
                    <li key={target.communitySlug}>
                      <Link
                        href={`${routes.community(target.communitySlug)}/${meta.newPath}`}
                        aria-current={isCurrent ? "true" : undefined}
                        class={cx(
                          "flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition-colors",
                          isCurrent
                            ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                            : exhausted
                              ? "border-subtle opacity-60"
                              : "border-subtle hover:border-brand-500",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          class="size-2 shrink-0 rounded-full"
                          style={{
                            background: `var(--level-${target.level})`,
                          }}
                        />
                        <span aria-hidden="true">
                          {target.communityEmoji ?? "📍"}
                        </span>
                        <span class="min-w-0 flex-1 truncate font-medium text-ink-strong">
                          {target.communityName}
                        </span>
                        <span class="shrink-0 text-xs text-ink-faint">
                          {translate(
                            locale,
                            LEVEL_NAMES[target.level] ?? "Comunidad",
                          )}
                        </span>
                        <span
                          class={cx(
                            "shrink-0 text-xs tabular-nums",
                            exhausted
                              ? "text-ink-faint"
                              : "font-semibold text-ink-strong",
                          )}
                        >
                          {target.remaining === null
                            ? "∞"
                            : `${target.remaining}/${target.monthlyLimit}`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <Slot />
      </div>
    );
  },
);

/**
 * Contador de caracteres. Pasa a color de alerta cerca del máximo.
 * Sin JavaScript muestra igual el límite, que es la información esencial.
 */
export const CharCounter = component$<{
  value: string;
  max: number;
  id: string;
}>(({ value, max, id }) => {
  const used = value.length;
  const ratio = used / max;
  const overLimit = used > max;
  const atLimit = used === max;

  // El valor visible sigue siendo exacto, pero la región viva cambia sólo al
  // cruzar hitos útiles. Así no interrumpe con cada tecla y todavía avisa al
  // acercarse, alcanzar o superar el límite.
  const liveMilestone = overLimit
    ? ">100%"
    : atLimit
      ? "100%"
      : ratio >= 0.99
        ? "99%"
        : ratio >= 0.95
          ? "95%"
          : ratio >= 0.9
            ? "90%"
            : "";

  return (
    <>
      <span
        id={id}
        class={cx(
          "rounded-full px-1.5 py-0.5 text-xs tabular-nums transition-colors",
          overLimit
            ? "bg-danger-500/12 font-semibold text-danger"
            : atLimit
              ? "bg-warn-400/15 font-semibold text-warn"
              : ratio >= 0.9
                ? "bg-warn-400/10 text-warn"
                : "text-ink-faint",
        )}
      >
        {used}/{max}
      </span>
      <span class="sr-only" aria-live="polite" aria-atomic="true">
        {liveMilestone}
      </span>
    </>
  );
});

/** Pantalla de confirmación previa: cómo va a quedar y qué cupo consume. */
export const ConfirmPanel = component$<{
  type: ContentType;
  communityName: string;
  remaining: number | null;
}>(({ type, communityName, remaining }) => {
  const locale = useLocale();
  const meta = CONTENT_TYPES[type];
  return (
    <div class="rounded-xl border border-brand-500/40 bg-brand-50 px-4 py-3 dark:bg-brand-950/40">
      <p class="text-sm font-medium text-brand">
        {translate(locale, "Revisá antes de publicar")}
      </p>
      <p class="mt-1 text-xs text-ink-muted">
        {translate(locale, "Se va a publicar en")}{" "}
        <strong class="text-ink-strong">{communityName}</strong>
        {remaining !== null && (
          <>
            {" "}
            {translate(
              locale,
              "y va a consumir 1 de tus {{remaining}} {{type}} disponibles este mes",
              {
                remaining,
                type: translate(
                  locale,
                  remaining === 1 ? meta.singular : meta.plural,
                ),
              },
            )}
          </>
        )}
        .{" "}
        {translate(
          locale,
          "Si lo borrás dentro de las 24 horas, el cupo vuelve.",
        )}
      </p>
    </div>
  );
});

/**
 * Contador circular de caracteres SVG con indicador de progreso continuo.
 */
export const CircularCharCounter = component$<{
  value: string;
  max: number;
  id?: string;
  size?: number;
}>(({ value, max, id, size = 24 }) => {
  const used = value.length;
  const ratio = Math.min(used / max, 1);
  const overLimit = used > max;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - ratio * circumference;

  const strokeColor = overLimit
    ? "stroke-danger-500 text-danger"
    : ratio >= 0.9
      ? "stroke-amber-500 text-amber-500"
      : "stroke-brand-500 text-brand-500";

  return (
    <div class="inline-flex items-center gap-1.5" id={id}>
      <svg class="-rotate-90 shrink-0" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke-width={strokeWidth}
          class="stroke-control fill-transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke-width={strokeWidth}
          stroke-dasharray={circumference}
          stroke-dashoffset={offset}
          stroke-linecap="round"
          class={cx(
            "fill-transparent transition-all duration-150",
            strokeColor,
          )}
        />
      </svg>
      <span
        class={cx(
          "text-xs tabular-nums",
          overLimit
            ? "font-bold text-danger"
            : ratio >= 0.9
              ? "font-semibold text-amber-600 dark:text-amber-400"
              : "text-ink-muted",
        )}
      >
        {used}/{max}
      </span>
    </div>
  );
});

/**
 * Barra de estado del borrador local con indicador de red y botón para descartar.
 */
export const DraftStatusBar = component$<{
  hasContent: boolean;
  status?: DraftStatus;
  /** El formulario arrancó desde un borrador guardado antes en este dispositivo. */
  restored?: boolean;
  onDiscard$?: import("@qwik.dev/core").QRL<() => void>;
}>(({ hasContent, status = "idle", restored = false, onDiscard$ }) => {
  const locale = useLocale();
  const isOnline = useOnlineStatus();

  if (!hasContent) return null;

  return (
    <div
      data-requires-script
      class={cx(
        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs transition-colors",
        status === "error"
          ? "border-danger-500/30 bg-danger-500/8 text-danger"
          : status === "saved"
            ? "border-success-500/30 bg-success-50/40 text-success-900 dark:bg-success-950/20 dark:text-success-200"
            : "border-amber-500/40 bg-amber-50/50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200",
      )}
    >
      <div class="flex items-center gap-2">
        <span
          class={cx(
            "size-2 rounded-full ring-2",
            status === "error"
              ? "bg-danger-500 ring-danger-500/20"
              : status === "saved"
                ? "bg-success-500 ring-success-500/20"
                : "bg-amber-500 ring-amber-500/20 animate-pulse",
          )}
          aria-hidden="true"
        />
        <span class="font-medium" role="status" aria-live="polite">
          {/* Quien abre el formulario con un borrador de otro día tiene que
              saber que lo que ve no es un formulario vacío. */}
          {translate(
            locale,
            status === "saving"
              ? "Guardando borrador…"
              : status === "error"
                ? "No pudimos guardar el borrador en este dispositivo"
                : restored
                  ? "Recuperamos el borrador guardado en este dispositivo"
                  : status === "saved"
                    ? "Borrador guardado en este dispositivo"
                    : "Tu borrador se guarda en este dispositivo",
          )}
          {!isOnline.value && <> · {translate(locale, "Sin conexión")}</>}
        </span>
      </div>
      {onDiscard$ && (
        <button
          type="button"
          onClick$={() => {
            triggerHapticFeedback("selection");
            playCivicSound("reset");
            onDiscard$();
          }}
          class="cursor-pointer text-xs font-semibold text-danger transition hover:underline active:scale-95"
        >
          {translate(locale, "Descartar borrador")}
        </button>
      )}
    </div>
  );
});
