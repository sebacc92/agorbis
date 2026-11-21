import { component$ } from "@qwik.dev/core";
import { Badge } from "~/components/ui";
import { StageStepper, type Stage } from "~/components/ui/StageStepper";
import { CONTENT_KINDS } from "~/lib/content-kinds";
import { formatDate } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";

export interface ClaimProgressTrackerProps {
  status: string;
  supportCount: number;
  threshold: number;
  createdAt: string;
  escalatedAt?: string | null;
  escalatedToName?: string | null;
  firstResponseAt?: string | null;
  hasOfficialResponse: boolean;
}

/**
 * Etapas de un reclamo: cada una dice sólo lo que la base registró (D58).
 * Desde D126 es la misma línea que la del proyecto (`StageStepper`), con el
 * rosa del reclamo en la etapa actual y una fila por etapa en el teléfono.
 */
export const ClaimProgressTracker = component$<ClaimProgressTrackerProps>(
  ({
    status,
    supportCount,
    threshold,
    createdAt,
    escalatedAt,
    escalatedToName,
    firstResponseAt,
    hasOfficialResponse,
  }) => {
    const locale = useLocale();
    const isResolved = status === "resolved";
    const hasThreshold = supportCount >= threshold;
    // Escalar exige apoyo y además que venza el plazo sin respuesta (D58):
    // llegar a la meta de apoyos no alcanza para decir que el reclamo subió.
    const isEscalated = Boolean(escalatedAt);
    const hasAcknowledgment = Boolean(firstResponseAt);
    const inManagement =
      hasAcknowledgment || hasOfficialResponse || status === "in_progress";
    const currentStep = isResolved
      ? "resolved"
      : inManagement
        ? "management"
        : isEscalated
          ? "escalated"
          : "signatures";

    const recorded = (done: boolean) =>
      done
        ? translate(locale, "Etapa registrada")
        : translate(locale, "Etapa sin registrar");

    // La elevación lleva capas y no un edificio: el reclamo se muestra
    // también en la comunidad superior, no se manda a ningún organismo (D58).
    const stages: Stage[] = [
      {
        id: "reported",
        icon: CONTENT_KINDS.claim.icon,
        title: translate(locale, "Reportado"),
        detail: formatDate(createdAt, locale),
        done: true,
        srState: recorded(true),
      },
      {
        id: "signatures",
        icon: "users",
        title: translate(locale, "Apoyos vecinales"),
        detail: hasThreshold
          ? translate(locale, "Meta alcanzada")
          : `${supportCount} / ${threshold}`,
        done: hasThreshold,
        srState: recorded(hasThreshold),
      },
      {
        id: "escalated",
        icon: "layers",
        title: translate(locale, "Elevación formal"),
        detail: escalatedAt
          ? `${formatDate(escalatedAt, locale)}${escalatedToName ? ` · ${translate(locale, "Visible también en {{territory}}", { territory: escalatedToName })}` : ""}`
          : translate(locale, "Sin elevación registrada"),
        done: isEscalated,
        srState: recorded(isEscalated),
      },
      {
        id: "management",
        icon: "building",
        title: translate(locale, "En gestión"),
        detail: hasOfficialResponse
          ? translate(locale, "Respuesta oficial registrada")
          : hasAcknowledgment
            ? translate(locale, "Acuse institucional registrado")
            : status === "in_progress"
              ? translate(locale, "Estado de gestión registrado")
              : translate(locale, "Sin respuesta institucional registrada"),
        done: inManagement,
        srState: recorded(inManagement),
      },
      {
        id: "resolved",
        icon: "trophy",
        title: translate(locale, "Victoria"),
        detail: isResolved
          ? translate(locale, "Problema resuelto")
          : translate(locale, "Solución vecinal"),
        done: isResolved,
        srState: recorded(isResolved),
      },
    ];
    const current = stages.findIndex((stage) => stage.id === currentStep);

    // El tono sigue al texto del resumen: escalado y ya en gestión dice "Con
    // seguimiento registrado", que no es una alerta. El violeta queda para la
    // navegación (D123).
    const summaryTone = isResolved
      ? "success"
      : isEscalated && !inManagement
        ? "warn"
        : "neutral";

    // Una sección con título y no un <nav>: no hay ningún enlace adentro, y
    // un landmark de navegación sin enlaces confunde a quien recorre la
    // página por regiones.
    return (
      <section
        aria-labelledby="etapas-reclamo"
        class="my-5 rounded-2xl border border-subtle bg-surface p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 id="etapas-reclamo" class="text-sm font-semibold">
            {translate(locale, "Etapas del reclamo")}
          </h2>
          <Badge tone={summaryTone}>
            {isResolved
              ? translate(locale, "Resolución registrada")
              : inManagement
                ? translate(locale, "Con seguimiento registrado")
                : isEscalated
                  ? translate(locale, "Escalado por falta de respuesta")
                  : hasThreshold
                    ? translate(locale, "Meta de apoyos alcanzada")
                    : translate(locale, "En recolección comunitaria")}
          </Badge>
        </div>
        <StageStepper
          class="mt-4"
          kind="claim"
          stages={stages}
          current={current}
        />
      </section>
    );
  },
);
