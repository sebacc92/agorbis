import { component$, useId, useSignal } from "@qwik.dev/core";
import {
  Badge,
  Button,
  Card,
  DialogFrame,
  Icon,
  ProgressBar,
  cx,
  triggerCivicConfetti,
  triggerHapticFeedback,
  type IconName,
} from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { translate, useLocale } from "~/lib/i18n";
import { civicProgress } from "~/lib/civic-progress";

export interface CivicBadge {
  id: string;
  /**
   * Ícono propio del sello (D123). Antes era un emoji fijado en el código:
   * nadie lo eligió, así que no era identidad sino interfaz.
   */
  icon: IconName;
  title: string;
  description: string;
  unlocked: boolean;
  progressText?: string;
}

/**
 * Pasaporte cívico: los sellos obtenidos y, como mucho, el que sigue.
 *
 * No repite quién es la persona. Nombre, comunidad y fecha de alta ya están
 * en la banda de la cabecera; el pasaporte volvía a poner el nombre como h2
 * y, en el perfil público, un "Comunidad" genérico con un pin que se leía
 * como la comunidad de la persona (D126).
 */
export const CivicPassportCard = component$<{
  badges: CivicBadge[];
  /**
   * Acciones que mide el nivel. Sólo el perfil propio muestra nivel y barra:
   * el público conoce apenas las últimas publicaciones y le daba a la misma
   * persona otro nivel que el de su perfil.
   */
  totalActions?: number;
  /** Falso en un perfil ajeno: nada en segunda persona sobre otra persona. */
  own?: boolean;
}>(({ badges, totalActions = 0, own = true }) => {
  const locale = useLocale();
  const inspectedBadge = useSignal<CivicBadge | null>(null);
  const badgeTitleId = useId();

  const progress = civicProgress(totalActions);
  const nextLevelText =
    progress.nextThreshold === null
      ? translate(locale, "Nivel máximo alcanzado")
      : translate(
          locale,
          "{{completed}} de {{required}} acciones para el siguiente nivel",
          { completed: progress.completed, required: progress.required },
        );

  const unlocked = badges.filter((b) => b.unlocked);
  const unlockedCount = unlocked.length;
  // Un solo paso por delante: una cuenta nueva veía cinco casilleros con
  // "Pendiente", una lista de lo que no hizo (décima ronda, mejora 10). La
  // "victoria" depende de que un reclamo se resuelva, no de la persona: va
  // última como próximo paso.
  const locked = badges.filter((b) => !b.unlocked);
  const next = locked.find((b) => b.id !== "victory") ?? locked[0] ?? null;
  const inspected = inspectedBadge.value;

  return (
    // Plana, como las demás secciones del perfil (D123): el degradado, el
    // borde violeta y la sombra al pasar el mouse la hacían parecer clicable.
    <Card class="p-6 sm:p-8">
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-subtle pb-5">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 text-display-xs">
            <Icon name="stamp" class="text-ink-muted" />
            {translate(locale, "Pasaporte cívico")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted tabular-nums">
            {unlockedCount} / {badges.length}{" "}
            {translate(locale, "sellos cívicos")}
          </p>
          {/* Sin "credencial verificada": Agorbis no verifica identidad, así
              que el pasaporte no emite nada que se pueda presentar como tal. */}
        </div>

        {/* El nivel en verde recién cuando hay algo que celebrar: con cero
            acciones el nivel 1 es el punto de partida, no un logro (D123). El
            texto puede envolver en vez de desbordar la tarjeta a 320 px. */}
        {own && (
          <Badge
            tone={progress.level >= 2 ? "success" : "neutral"}
            class="max-w-full"
          >
            <Icon name="star" />
            <span class="whitespace-normal">
              {translate(locale, progress.title)} ·{" "}
              {translate(locale, "Nivel {{level}}", { level: progress.level })}
            </span>
          </Badge>
        )}
      </div>

      {/* Nivel y barra sólo en el perfil propio. En uno ajeno medían otra
          cosa (las publicaciones mostradas) y contradecían al propio. */}
      {own && (
        <div class="mt-5">
          <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs">
            <span class="text-ink-muted">{nextLevelText}</span>
            <span
              class={cx(
                "font-semibold tabular-nums",
                progress.actions > 0 ? "text-ink-strong" : "text-ink-faint",
              )}
            >
              {translate(locale, "{{count}} acciones en total", {
                count: progress.actions,
              })}
            </span>
          </div>
          <div class="mt-2">
            <ProgressBar
              value={progress.completed}
              max={progress.required}
              label="Progreso del pasaporte cívico"
              valueText={nextLevelText}
            />
          </div>
        </div>
      )}

      {/* Sellos: los obtenidos y, como mucho, el que sigue. La grilla mide
          su contenedor y no la pantalla: el mismo pasaporte va en el ancho de
          /perfil y en la columna de lectura del perfil público. */}
      <div class="mt-6 @container">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-bold uppercase tracking-wider text-ink-faint">
            {unlocked.length === 0
              ? translate(locale, own ? "Tu primer sello" : "Primer sello")
              : translate(locale, "Sellos obtenidos")}
          </h3>
          {unlocked.length > 0 && (
            <span class="text-2xs text-ink-muted">
              {translate(locale, "Tocá un sello para inspeccionarlo")}
            </span>
          )}
        </div>

        {/* Adentro de un botón sólo va contenido de frase: los `div`, `h4` y
            `p` de antes cortaban el servidor de desarrollo (Q12) en /u/[id] y
            en la pestaña Resumen de /perfil. `data-badge` marca los obtenidos;
            el siguiente lleva `data-next-badge`. */}
        {unlocked.length > 0 && (
          <div class="mt-3 grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
            {unlocked.map((badge) => (
              <button
                key={badge.id}
                type="button"
                data-badge={badge.id}
                onClick$={() => {
                  inspectedBadge.value = badge;
                  triggerHapticFeedback("selection");
                }}
                class="flex cursor-pointer flex-col rounded-2xl border border-success-500/40 bg-success-50/40 p-4 text-left transition-colors duration-150 hover:border-success-500/70 hover:bg-success-50/80 touch-manipulation dark:bg-success-950/20 dark:hover:bg-success-950/40"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-success-500/15 text-success">
                    <Icon name={badge.icon} class="text-lg" />
                  </span>
                  <Badge tone="success">
                    <Icon name="check" />
                    {translate(locale, "Obtenido")}
                  </Badge>
                </span>
                <span class="mt-3 block text-sm font-semibold text-ink-strong">
                  {badge.title}
                </span>
                <span class="mt-1 line-clamp-2 text-2xs leading-relaxed text-ink-muted">
                  {badge.description}
                </span>
                {badge.progressText && (
                  <span class="mt-auto block pt-3 text-3xs font-medium text-ink-faint">
                    {badge.progressText}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {next ? (
          <button
            type="button"
            data-next-badge
            onClick$={() => {
              inspectedBadge.value = next;
              triggerHapticFeedback("selection");
            }}
            class="mt-3 flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-dashed border-subtle bg-muted/30 p-4 text-left transition-colors duration-150 hover:border-strong hover:bg-muted/60 touch-manipulation"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-inset text-ink-muted">
              <Icon name={next.icon} class="text-lg" />
            </span>
            <span class="min-w-0">
              <span class="block text-3xs font-bold uppercase tracking-wider text-ink-faint">
                {unlocked.length === 0 && own
                  ? translate(locale, "Para empezar")
                  : translate(locale, "Próximo sello")}
              </span>
              <span class="mt-0.5 block text-sm font-semibold text-ink-strong">
                {next.title}
              </span>
              <span class="mt-1 block text-2xs leading-relaxed text-ink-muted">
                {next.description}
              </span>
              {next.progressText && (
                <span class="mt-2 block text-3xs font-medium text-ink-faint">
                  {next.progressText}
                </span>
              )}
            </span>
          </button>
        ) : badges.length > 0 ? (
          <p class="mt-3 text-xs text-ink-muted">
            {translate(
              locale,
              own
                ? "Obtuviste todos los sellos que existen hoy."
                : "Tiene todos los sellos que existen hoy.",
            )}
          </p>
        ) : null}
      </div>

      {/* Sin `backdropClass`: vale el velo del sistema de `DialogFrame`. */}
      {inspected && (
        <DialogFrame
          onClose$={() => {
            inspectedBadge.value = null;
          }}
          labelledBy={badgeTitleId}
          class="w-[calc(100vw-2rem)] max-w-md rounded-3xl border border-subtle bg-surface p-6 text-ink shadow-2xl animate-scale-pop"
        >
          <div class="flex items-start justify-between gap-2 border-b border-subtle pb-4">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class={cx(
                  "grid size-12 shrink-0 place-items-center rounded-2xl",
                  inspected.unlocked
                    ? "bg-success-500/15 text-success"
                    : "bg-inset text-ink-muted",
                )}
              >
                <Icon name={inspected.icon} class="text-2xl" />
              </span>
              <div class="min-w-0">
                <h2 id={badgeTitleId} class="text-lg font-bold text-ink-strong">
                  {inspected.title}
                </h2>
                {inspected.unlocked ? (
                  <span class="inline-flex items-center gap-1 text-xs font-semibold text-success">
                    <Icon name="check" />
                    {translate(locale, "Sello cívico acreditado")}
                  </span>
                ) : (
                  <span class="inline-flex items-center gap-1 text-xs font-medium text-ink-faint">
                    <Icon name="lock" />
                    {translate(locale, "Sello pendiente de logro")}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick$={() => {
                inspectedBadge.value = null;
              }}
              class="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl text-ink-faint transition-colors duration-150 hover:bg-muted hover:text-ink-strong touch-manipulation"
              aria-label={translate(locale, "Cerrar")}
            >
              <Icon name="x" class="text-base" />
            </button>
          </div>

          <div class="mt-4 space-y-3 text-sm">
            <p class="leading-relaxed text-ink">{inspected.description}</p>

            {inspected.progressText && (
              <div class="rounded-xl bg-muted/50 p-3">
                <p class="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  {translate(locale, "Progreso actual")}
                </p>
                <p class="mt-0.5 text-xs font-bold text-ink-strong">
                  {inspected.progressText}
                </p>
              </div>
            )}

            {/* El consejo felicita o propone en segunda persona: en un perfil
                ajeno le hablaba a quien mira de un logro de otra persona. */}
            {own && (
              <p class="flex gap-2 rounded-xl border border-subtle bg-muted/40 p-3 text-xs leading-relaxed text-ink">
                <Icon name="bulb" class="mt-0.5 shrink-0 text-sm text-accent" />
                <span>
                  <span class="font-semibold text-ink-strong">
                    {translate(locale, "Consejo cívico:")}
                  </span>{" "}
                  {inspected.unlocked
                    ? translate(
                        locale,
                        "¡Felicitaciones! Este sello demuestra tu compromiso directo con la vida comunitaria y tus vecinos.",
                      )
                    : translate(
                        locale,
                        "Participá votando, apoyando reclamos de tu cuadra o proponiendo proyectos para sumar este sello a tu pasaporte.",
                      )}
                </span>
              </p>
            )}
          </div>

          <div class="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-subtle pt-4">
            {own && inspected.unlocked && (
              <Button
                size="sm"
                onClick$={() => {
                  triggerCivicConfetti();
                  showToast(
                    translate(locale, "¡Sello cívico celebrado!"),
                    "success",
                  );
                }}
              >
                <Icon name="sparkles" />
                {translate(locale, "Celebrar sello")}
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              onClick$={() => {
                inspectedBadge.value = null;
              }}
            >
              {translate(locale, "Entendido")}
            </Button>
          </div>
        </DialogFrame>
      )}
    </Card>
  );
});
