import { component$ } from "@qwik.dev/core";
import { CONTENT_KIND_TONES, type ContentKind } from "~/lib/content-kinds";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Una etapa de la línea. Los textos llegan traducidos: quien la usa sabe qué
 * significa cada etapa y qué dato la acompaña.
 */
export interface Stage {
  /** Clave estable de la etapa. */
  id: string;
  /** Nombre visible; es el primer párrafo del ítem. */
  title: string;
  /** Dato o pista debajo del nombre. */
  detail?: string;
  /**
   * Ícono propio. Lo lleva el punto de la etapa actual aunque esté
   * registrada, porque es el que dice dónde está; la tilde queda para las
   * otras registradas.
   */
  icon?: IconName;
  /**
   * La base registró la etapa y su punto lleva una tilde. El proyecto no lo
   * usa: puede saltear etapas y nada registra que las anteriores se
   * cumplieron.
   */
  done?: boolean;
  /** El estado para lectores de pantalla ("Etapa registrada"). */
  srState?: string;
}

type StageState = "current" | "done" | "pending";

/**
 * Línea de etapas de reclamos y proyectos (D126).
 *
 * Había dos anatomías para lo mismo: el reclamo era una tarjeta con degradé,
 * sombra, emojis, pasos pendientes al 60 % de opacidad y cinco pasos en dos
 * columnas que dejaban "Victoria" sola en el teléfono; el proyecto, cuatro
 * recuadros violetas que parecían botones. Acá hay una sola: un punto por
 * etapa unido por una línea neutra. La actual lleva el color de su tipo y su
 * ícono (el violeta queda para la navegación, D123), las registradas una
 * tilde y las demás su número. Sin pulso ni opacidad: el estado se lee igual
 * con "reducir movimiento" y bajo el sol.
 */
export const StageStepper = component$<{
  stages: Stage[];
  /** Posición de la etapa actual (`aria-current="step"`); -1 si no hay. */
  current: number;
  kind: ContentKind;
  /**
   * Cómo se acomoda en el teléfono. "rows": una fila por etapa con su
   * detalle, para etapas que traen datos propios (fechas, apoyos). "line":
   * una sola fila de puntos y nombres, con la pista de la etapa actual
   * debajo. Desde `sm` las dos son columnas parejas.
   */
  phone?: "rows" | "line";
  class?: string;
}>(({ stages, current, kind, phone = "rows", class: cls }) => {
  const tone = CONTENT_KIND_TONES[kind];
  const rows = phone === "rows";
  const last = stages.length - 1;
  const active: Stage | undefined = stages[current];
  const dot: Record<StageState, string> = {
    current: cx("border-2 border-current", tone.bg, tone.text),
    done: cx("border bg-surface", tone.border, tone.text),
    pending: "border border-strong bg-surface text-ink-muted",
  };
  const title: Record<StageState, string> = {
    current: tone.text,
    done: "text-ink-strong",
    pending: "text-ink-muted",
  };

  return (
    <div class={cls}>
      <ol class={cx("flex", rows && "flex-col sm:flex-row")}>
        {stages.map((stage, index) => {
          const state: StageState =
            index === current ? "current" : stage.done ? "done" : "pending";
          return (
            <li
              key={stage.id}
              aria-current={state === "current" ? "step" : undefined}
              data-state={state}
              class={cx(
                "flex min-w-0",
                rows
                  ? "gap-3 sm:flex-1 sm:basis-0 sm:flex-col sm:items-center sm:gap-0 sm:text-center"
                  : "flex-1 basis-0 flex-col items-center text-center",
              )}
            >
              {/* El punto y sus tramos de línea. En columnas lleva un tramo a
                  cada lado y los de etapas vecinas se tocan; en filas, uno
                  baja hasta el punto siguiente. */}
              <span
                aria-hidden="true"
                class={cx(
                  "flex items-center",
                  rows ? "flex-col sm:w-full sm:flex-row" : "w-full",
                )}
              >
                <span
                  class={cx(
                    "h-px flex-1",
                    rows && "hidden sm:block",
                    index > 0 ? "bg-strong" : "bg-transparent",
                  )}
                />
                <span
                  class={cx(
                    "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    dot[state],
                  )}
                >
                  {state === "current" && stage.icon ? (
                    <Icon name={stage.icon} class="text-base" />
                  ) : state === "done" ? (
                    <Icon name="check" class="text-base" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  class={cx(
                    "flex-1",
                    rows ? "w-px sm:h-px sm:w-auto" : "h-px",
                    index < last ? "bg-strong" : "bg-transparent",
                  )}
                />
              </span>
              {/* Ocupa el ancho de su columna: centrado y sin ancho, el bloque
                  mediría lo que su palabra más larga, `break-words` no
                  cortaría y, con la letra al 130 % o en 320 px, "Completado"
                  pisaría la etapa vecina. `hyphens-auto` corta por sílaba y
                  con guion según el `lang` del documento; sin él quedaba
                  "Completad" arriba y la "o" sola abajo. */}
              <div
                class={cx(
                  "min-w-0",
                  rows
                    ? cx(
                        index < last && "pb-3",
                        "sm:w-full sm:px-1.5 sm:pb-0 sm:pt-2",
                      )
                    : "w-full px-0.5 pt-2",
                )}
              >
                <p
                  class={cx(
                    "hyphens-auto break-words text-xs font-semibold leading-tight",
                    title[state],
                  )}
                >
                  {stage.title}
                </p>
                {stage.srState && <span class="sr-only">{stage.srState}</span>}
                {/* En la fila del teléfono la pista no entra a la vista, pero
                    el lector de pantalla la sigue leyendo dentro de su etapa.
                    `not-sr-only` borra el margen y `sm:mt-0.5` lo repone. */}
                {stage.detail && (
                  <p
                    class={cx(
                      "mt-0.5 text-xs text-ink-muted",
                      !rows && "sr-only sm:not-sr-only sm:mt-0.5",
                    )}
                  >
                    {stage.detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {/* En una sola fila no entran las pistas: la de la etapa actual va
          debajo, con su nombre en el color del tipo para atarla al punto.
          Es una copia visual: el lector de pantalla ya leyó la pista en su
          etapa y así no escucha dos veces el nombre. */}
      {!rows && active?.detail && (
        <p aria-hidden="true" class="mt-3 text-xs text-ink-muted sm:hidden">
          <span class={cx("font-semibold", tone.text)}>{active.title}</span>
          {": "}
          {active.detail}
        </p>
      )}
    </div>
  );
});
