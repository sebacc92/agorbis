import { $, component$, useSignal } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import {
  Icon,
  Badge,
  triggerCivicConfetti,
  triggerHapticFeedback,
  type IconName,
} from "~/components/ui";
import { CONTENT_KINDS } from "~/lib/content-kinds";
import { formatDate, pluralize } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";

/** Un hito: el ícono es propio (D123), el emoji cambiaba con cada sistema. */
interface Milestone {
  id: string;
  icon: IconName;
  title: string;
  tag: string;
  date: string;
  description: string;
  done: boolean;
  progress: number;
  targetLabel: string;
}

export interface MilestoneCarouselProps {
  communityName: string;
  communitySlug: string;
  createdAt: string;
  memberCount: number;
  resolvedClaimsCount: number;
  pollsCount: number;
  projectsCount: number;
}

export const MilestoneCarousel = component$<MilestoneCarouselProps>(
  ({
    communityName,
    communitySlug,
    createdAt,
    memberCount,
    resolvedClaimsCount,
    pollsCount,
    projectsCount,
  }) => {
    const locale = useLocale();
    const activeSlide = useSignal(0);
    const celebratedMilestone = useSignal<string | null>(null);

    // El progreso sale sólo de los contadores reales: un hito sin actividad
    // muestra 0 %, nunca un avance de relleno.
    const milestones: Milestone[] = [
      {
        id: "foundation",
        icon: "leaf",
        title: translate(locale, "Comunidad creada"),
        tag: translate(locale, "Inicio"),
        date: createdAt
          ? formatDate(createdAt, locale)
          : translate(locale, "Fase inicial"),
        description: translate(
          locale,
          "{{name}} existe en Agorbis desde esta fecha.",
          { name: communityName },
        ),
        done: true,
        progress: 100,
        targetLabel: translate(locale, "Fecha de creación"),
      },
      {
        id: "members-10",
        icon: "users",
        title: translate(locale, "Primeros 10 vecinos"),
        tag: translate(locale, "Participación"),
        date:
          memberCount >= 10
            ? translate(locale, "Completado")
            : translate(locale, "En progreso"),
        description: translate(
          locale,
          "Diez personas con residencia registrada en la comunidad.",
        ),
        done: memberCount >= 10,
        progress: Math.min(100, Math.round((memberCount / 10) * 100)),
        targetLabel: `${memberCount}/10 ${translate(locale, "vecinos")}`,
      },
      {
        id: "members-50",
        icon: "home-group",
        title: translate(locale, "Meta de 50 vecinos"),
        tag: translate(locale, "Participación"),
        date:
          memberCount >= 50
            ? translate(locale, "Completado")
            : translate(locale, "Próximo desafío"),
        description: translate(
          locale,
          "Cincuenta personas con residencia registrada en la comunidad.",
        ),
        done: memberCount >= 50,
        progress: Math.min(100, Math.round((memberCount / 50) * 100)),
        targetLabel: `${memberCount}/50 ${translate(locale, "vecinos")}`,
      },
      {
        id: "first-victory",
        icon: "trophy",
        title: translate(locale, "Victorias ciudadanas"),
        tag: translate(locale, "Reclamos"),
        date:
          resolvedClaimsCount > 0
            ? translate(locale, "{{count}} resueltos", {
                count: resolvedClaimsCount,
              })
            : translate(locale, "En marcha"),
        description: translate(
          locale,
          "Reclamos de la comunidad marcados como resueltos.",
        ),
        done: resolvedClaimsCount > 0,
        progress: resolvedClaimsCount > 0 ? 100 : 0,
        targetLabel:
          resolvedClaimsCount > 0
            ? pluralize(
                resolvedClaimsCount,
                "reclamo marcado como resuelto",
                "reclamos marcados como resueltos",
                locale,
              )
            : translate(locale, "Primer reclamo por resolver"),
      },
      {
        id: "civic-deliberation",
        icon: CONTENT_KINDS.poll.icon,
        title: translate(locale, "Encuestas"),
        tag: translate(locale, "Encuestas"),
        date:
          pollsCount > 0
            ? translate(locale, "Activas")
            : translate(locale, "Pendiente"),
        description: translate(locale, "Encuestas publicadas en la comunidad."),
        done: pollsCount > 0,
        progress: pollsCount > 0 ? 100 : 0,
        targetLabel: pluralize(
          pollsCount,
          "encuesta publicada",
          "encuestas publicadas",
          locale,
        ),
      },
      {
        id: "community-projects",
        icon: CONTENT_KINDS.project.icon,
        title: translate(locale, "Proyectos participativos"),
        tag: translate(locale, "Proyectos"),
        date:
          projectsCount > 0
            ? translate(locale, "En desarrollo")
            : translate(locale, "Por iniciar"),
        description: translate(
          locale,
          "Proyectos propuestos por vecinos para mejorar el espacio común.",
        ),
        done: projectsCount > 0,
        progress: projectsCount > 0 ? 100 : 0,
        targetLabel: pluralize(
          projectsCount,
          "proyecto propuesto",
          "proyectos propuestos",
          locale,
        ),
      },
    ];

    const celebrate$ = $((mId: string) => {
      celebratedMilestone.value = mId;
      triggerCivicConfetti();
      triggerHapticFeedback();
      setTimeout(() => {
        if (celebratedMilestone.value === mId) {
          celebratedMilestone.value = null;
        }
      }, 3500);
    });

    const achievedCount = milestones.filter((m) => m.done).length;

    return (
      <section
        class="mt-6 rounded-3xl border border-subtle bg-surface p-5 sm:p-6 shadow-xs"
        aria-labelledby="milestones-heading"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex text-xl text-brand" aria-hidden="true">
                <Icon name="flag" />
              </span>
              {/* Sin Title Case ni "conquistas cívicas" (D126): el título
                  dice qué es y la nota, de dónde salen los números. */}
              <h2
                id="milestones-heading"
                class="text-lg font-bold tracking-tight text-ink-strong sm:text-xl"
              >
                {translate(locale, "Hitos de {{name}}", {
                  name: communityName,
                })}
              </h2>
              <Badge tone="brand">
                {achievedCount}/{milestones.length}{" "}
                {translate(locale, "alcanzados")}
              </Badge>
            </div>
            <p class="mt-1 text-xs text-ink-muted sm:text-sm">
              {translate(
                locale,
                "Lo que {{name}} ya alcanzó y lo que falta, con los números de hoy.",
                { name: communityName },
              )}
            </p>
          </div>

          <div class="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick$={() => {
                activeSlide.value = Math.max(0, activeSlide.value - 1);
              }}
              disabled={activeSlide.value === 0}
              class="flex size-[44px] items-center justify-center rounded-xl border border-subtle bg-surface text-ink-strong transition hover:bg-muted disabled:opacity-40"
              aria-label={translate(locale, "Hito anterior")}
            >
              <Icon name="arrow-left" />
            </button>
            <span class="font-mono text-xs text-ink-faint">
              {activeSlide.value + 1} / {milestones.length}
            </span>
            <button
              type="button"
              onClick$={() => {
                activeSlide.value = Math.min(
                  milestones.length - 1,
                  activeSlide.value + 1,
                );
              }}
              disabled={activeSlide.value >= milestones.length - 1}
              class="flex size-[44px] items-center justify-center rounded-xl border border-subtle bg-surface text-ink-strong transition hover:bg-muted disabled:opacity-40"
              aria-label={translate(locale, "Siguiente hito")}
            >
              <Icon name="arrow-right" />
            </button>
          </div>
        </div>

        <p role="status" aria-live="polite" aria-atomic="true" class="sr-only">
          {translate(locale, "Hito {{current}} de {{total}}", {
            current: activeSlide.value + 1,
            total: milestones.length,
          })}
          {": "}
          {milestones[activeSlide.value].title}
        </p>

        {/* Carousel de Hitos */}
        <div class="relative mt-5 overflow-hidden">
          <div
            class="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${activeSlide.value * 100}%)` }}
          >
            {milestones.map((m, idx) => {
              const isCurrent = idx === activeSlide.value;
              const isCelebrated = celebratedMilestone.value === m.id;
              return (
                <div
                  key={m.id}
                  class="min-w-full px-1"
                  aria-hidden={!isCurrent}
                  inert={!isCurrent}
                >
                  <div
                    class={`relative flex flex-col justify-between rounded-2xl border p-5 transition-all sm:p-6 ${
                      m.done
                        ? "border-success-500/30 bg-success-50/20 dark:bg-success-950/15"
                        : "border-subtle bg-muted/30"
                    }`}
                  >
                    <div>
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2.5">
                          {/* El color dice el estado: verde lo conseguido,
                              atenuado lo que falta. */}
                          <span
                            class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface text-xl shadow-xs ${
                              m.done ? "text-success" : "text-ink-muted"
                            }`}
                          >
                            <Icon name={m.icon} />
                          </span>
                          <div>
                            <span class="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                              {m.tag}
                            </span>
                            <h3 class="text-base font-bold text-ink-strong sm:text-lg">
                              {m.title}
                            </h3>
                          </div>
                        </div>

                        <div class="flex items-center gap-2">
                          <span class="text-xs font-medium text-ink-faint">
                            {m.date}
                          </span>
                          {/* El Badge del sistema y no píldoras propias; el
                              pendiente en neutro y no en ámbar crudo. */}
                          {m.done ? (
                            <Badge tone="success">
                              <Icon name="check" />
                              {translate(locale, "Conseguido")}
                            </Badge>
                          ) : (
                            <Badge tone="neutral">
                              <Icon name="clock" />
                              {translate(locale, "En camino")}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <p class="mt-3 text-xs leading-relaxed text-ink-muted sm:text-sm">
                        {m.description}
                      </p>
                    </div>

                    <div class="mt-5 border-t border-subtle/70 pt-4">
                      <div class="flex items-center justify-between text-xs">
                        <span class="font-semibold text-ink-strong">
                          {m.targetLabel}
                        </span>
                        <span class="font-mono text-ink-muted">
                          {m.progress}%
                        </span>
                      </div>
                      <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          class={`h-full transition-all duration-500 ${
                            m.done ? "bg-success-500" : "bg-brand-600"
                          }`}
                          style={{ width: `${m.progress}%` }}
                        />
                      </div>

                      <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                        {m.done ? (
                          <button
                            type="button"
                            onClick$={() => celebrate$(m.id)}
                            class="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-success-500/40 bg-success-500/10 px-3 py-1.5 text-xs font-semibold text-success-800 transition hover:bg-success-500/20 active:scale-95 dark:text-success-300"
                          >
                            <Icon name="sparkles" />
                            <span>
                              {isCelebrated
                                ? translate(locale, "¡Bravo vecinos!")
                                : translate(
                                    locale,
                                    "Celebrar hito con el barrio",
                                  )}
                            </span>
                          </button>
                        ) : (
                          <Link
                            href={`/c/${communitySlug}/miembros`}
                            class="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-50/50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100/60 dark:bg-brand-950/30 dark:text-brand-300"
                          >
                            <Icon name="users" />
                            <span>
                              {translate(
                                locale,
                                "Invitar vecinos para alcanzarlo",
                              )}
                            </span>
                          </Link>
                        )}

                        <span class="text-2xs text-ink-faint">
                          {translate(locale, "Hito {{current}} de {{total}}", {
                            current: idx + 1,
                            total: milestones.length,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Indicadores de diapositivas */}
        <div class="mt-4 flex flex-wrap items-center justify-center gap-1">
          {milestones.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              onClick$={() => {
                activeSlide.value = idx;
              }}
              class="flex size-[44px] items-center justify-center rounded-xl hover:bg-muted"
              aria-current={idx === activeSlide.value ? "true" : undefined}
              aria-label={translate(locale, "Ir al hito {{number}}", {
                number: idx + 1,
              })}
            >
              <span
                aria-hidden="true"
                class={`h-2 rounded-full transition-all ${
                  idx === activeSlide.value
                    ? "w-6 bg-brand-600"
                    : "w-2 bg-[var(--ink-muted)]"
                }`}
              />
            </button>
          ))}
        </div>
      </section>
    );
  },
);
