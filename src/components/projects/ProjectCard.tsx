import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Badge, Card, Icon, ProgressBar } from "~/components/ui";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { routes } from "~/lib/community";
import { PROJECT_STATUS_LABEL } from "~/lib/constants";
import type { ProjectStatus } from "~/lib/database.types.helpers";
import { formatMoney, formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface ProjectCardData {
  id: string;
  title: string;
  summary: string;
  status: ProjectStatus;
  budget_amount: number | null;
  currency: string;
  pledged_total: number;
  created_at: string;
  pledgeCount: number;
}

export const ProjectCard = component$<{ project: ProjectCardData }>(
  ({ project }) => {
    const locale = useLocale();
    const status = PROJECT_STATUS_LABEL[project.status];
    const hasBudget = !!project.budget_amount && project.budget_amount > 0;
    /**
     * Cuánto del presupuesto está cubierto. Los dos montos ya estaban, pero
     * compararlos de un vistazo es trabajo mental: "$1.200.000 de $9.600.000"
     * no se lee como "12 %" hasta que uno se sienta a dividir.
     */
    const funded = hasBudget
      ? Math.round((project.pledged_total / project.budget_amount!) * 100)
      : 0;
    const goalReached =
      hasBudget && project.pledged_total >= project.budget_amount!;

    return (
      /* Tarjeta plana con la franja naranja del tipo (D123). */
      <Card
        interactive
        accent={CONTENT_KIND_TONES.project.accent}
        class="h-full active:scale-[0.99] touch-manipulation"
      >
        <Link
          href={routes.project(project.id)}
          class="flex h-full flex-col rounded-2xl p-5 touch-target"
        >
          {/* Meta en una línea: estado y, cuando corresponde, la meta; la
              fecha a la derecha (D123). */}
          <div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <Badge
              tone={status.tone as "neutral" | "brand" | "success" | "danger"}
            >
              {translate(locale, status.label)}
            </Badge>
            {/* Llegar al presupuesto es el hito que decide si la propuesta
                pasa de papel a obra, y en la tarjeta se leía sólo como una
                barra llena, que también puede ser un proyecto sin monto. */}
            {goalReached && (
              <span class="inline-flex items-center gap-1 font-medium text-success">
                <Icon name="sparkles" />
                {translate(locale, "Meta alcanzada")}
              </span>
            )}
            <span class="ml-auto text-ink-faint">
              <RelativeTime value={project.created_at} />
            </span>
          </div>

          <h3 dir="auto" class="font-display text-display-xs text-ink-strong">
            {project.title}
          </h3>
          <p
            dir="auto"
            class="ugc-text mt-2 line-clamp-3 flex-1 text-base text-ink-muted"
          >
            {project.summary}
          </p>

          {hasBudget && (
            <div class="mt-4">
              <div class="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span class="font-medium text-data">
                  {formatMoney(project.pledged_total, project.currency, locale)}
                  <span class="ml-1.5 tabular-nums text-ink-faint">
                    {formatNumber(funded, locale)}%
                  </span>
                </span>
                <span class="text-ink-faint">
                  {translate(locale, "de {{amount}}", {
                    amount: formatMoney(
                      project.budget_amount,
                      project.currency,
                      locale,
                    ),
                  })}
                </span>
              </div>
              <ProgressBar
                value={project.pledged_total}
                max={project.budget_amount!}
                label={translate(
                  locale,
                  "Comprometido: {{current}} de {{total}}",
                  {
                    current: formatMoney(
                      project.pledged_total,
                      project.currency,
                      locale,
                    ),
                    total: formatMoney(
                      project.budget_amount,
                      project.currency,
                      locale,
                    ),
                  },
                )}
              />
            </div>
          )}

          {/* Un solo pie: compromisos a la izquierda, llamada a la derecha.
              La tarjeta entera es el enlace y nada decía a qué lleva: entrar a
              comprometer aporte y entrar a seguir una obra en marcha son dos
              intenciones distintas, y el estado ya las distingue acá. */}
          <div class="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
            <span class="inline-flex items-center gap-1 text-xs font-medium text-ink-muted">
              <Icon name="users" />
              {/* "0 compromisos" se lee como un veredicto sobre la propuesta;
                  lo cierto es que todavía no la vio nadie. */}
              {project.pledgeCount === 0
                ? translate(locale, "Todavía sin compromisos")
                : pluralize(
                    project.pledgeCount,
                    "compromiso",
                    "compromisos",
                    locale,
                  )}
            </span>
            <span class="inline-flex items-center gap-1 font-medium text-brand">
              {project.status === "funding" && !goalReached
                ? translate(locale, "Sumar tu apoyo")
                : translate(locale, "Ver el proyecto")}
              <Icon name="arrow-right" />
            </span>
          </div>
        </Link>
      </Card>
    );
  },
);
