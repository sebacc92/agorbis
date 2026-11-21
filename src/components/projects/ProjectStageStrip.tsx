import { component$ } from "@qwik.dev/core";
import type { IconName } from "~/components/ui/Icon";
import { StageStepper } from "~/components/ui/StageStepper";
import { PROJECT_STATUS_LABEL } from "~/lib/constants";
import { CONTENT_KINDS } from "~/lib/content-kinds";
import type { ProjectStatus } from "~/lib/database.types.helpers";
import { useLocale, translate } from "~/lib/i18n";

const STAGES = ["proposal", "funding", "in_progress", "completed"] as const;

const STAGE_HINT: Record<(typeof STAGES)[number], string> = {
  proposal: "Se presenta la idea.",
  funding: "Recibe compromisos de dinero, tiempo o materiales.",
  in_progress: "Se ejecuta y registra sus avances.",
  completed: "Terminó; queda su historial.",
};

/* Lo dibuja sólo el punto de la etapa actual; las demás muestran su número.
   "Completado" lleva el trofeo de Victorias, que también lista proyectos. */
const STAGE_ICON: Record<(typeof STAGES)[number], IconName> = {
  proposal: "bulb",
  funding: "users",
  in_progress: CONTENT_KINDS.project.icon,
  completed: "trophy",
};

/**
 * Dónde está un proyecto y quién lo mueve.
 *
 * El detalle mostraba sólo una etiqueta de estado, y los nombres no
 * coincidían: la ejecución decía "Buscando apoyos" donde el detalle decía
 * "Juntando apoyo", y el detalle "En marcha" donde la búsqueda y los reclamos
 * decían "En ejecución". Las etapas usan `PROJECT_STATUS_LABEL` y describen
 * lo que habilita cada una.
 * Las anteriores no se marcan como cumplidas: un proyecto puede pasar de
 * propuesta a ejecución sin juntar apoyo (`project-execution-states`).
 *
 * Desde D126 es la misma línea que la del reclamo (`StageStepper`): la etapa
 * actual con el naranja del proyecto y no con el violeta de la navegación, y
 * en el teléfono una sola fila con la pista de la actual debajo, en lugar de
 * cuatro recuadros en dos por dos que parecían botones.
 */
export const ProjectStageStrip = component$<{ status: string }>(
  ({ status }) => {
    const locale = useLocale();
    const current = (STAGES as readonly string[]).indexOf(status);
    if (current < 0) return null;

    return (
      <section
        aria-labelledby="etapas-proyecto"
        class="mt-5 rounded-2xl border border-subtle bg-surface p-4"
      >
        <h2 id="etapas-proyecto" class="text-sm font-semibold">
          {translate(locale, "Etapas del proyecto")}
        </h2>
        <StageStepper
          class="mt-4"
          kind="project"
          phone="line"
          current={current}
          stages={STAGES.map((stage) => ({
            id: stage,
            icon: STAGE_ICON[stage],
            title: translate(
              locale,
              PROJECT_STATUS_LABEL[stage as ProjectStatus].label,
            ),
            detail: translate(locale, STAGE_HINT[stage]),
          }))}
        />
        <p class="mt-3 text-xs text-ink-muted">
          {translate(
            locale,
            "Quien lo propuso marca cada etapa y moderación puede corregirla. Quienes se sumaron reciben una notificación cuando avanza.",
          )}
        </p>
      </section>
    );
  },
);
