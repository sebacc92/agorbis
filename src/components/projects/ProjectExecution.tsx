import {
  component$,
  useComputed$,
  useSignal,
  useTask$,
  type QwikIntrinsicElements,
} from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import {
  Icon,
  Alert,
  Badge,
  Card,
  Chip,
  Field,
  ProgressBar,
  Select,
  SubmitButton,
  cx,
  type IconName,
} from "~/components/ui";
import { PROJECT_STATUS_LABEL } from "~/lib/constants";
import type { ProjectStatus, Tables } from "~/lib/database.types.helpers";
import type {
  useAddMilestone,
  useAddTask,
  useOfferContribution,
  useUpdateContribution,
  useUpdateMilestone,
  useUpdateProjectStatus,
  useUpdateTask,
} from "~/routes/proyectos/[id]";
import { ProjectExecutionCreateForm } from "./ProjectExecutionCreateForm";
import { formatDate, formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import {
  contributionStatusOptions,
  milestoneStatusOptions,
  projectStatusOptions,
  taskStatusOptions,
} from "~/lib/project-execution-states";

const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Pendiente",
  in_progress: "En curso",
  completed: "Completada",
  blocked: "Bloqueada",
} as const;
const MILESTONE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En curso",
  completed: "Completado",
  blocked: "Bloqueado",
} as const;
const CONTRIBUTION_STATUS_LABEL: Record<string, string> = {
  offered: "Ofrecido",
  accepted: "Aceptado",
  completed: "Completado",
  declined: "No utilizado",
} as const;
const CONTRIBUTION_KIND_LABEL: Record<string, string> = {
  time: "Tiempo",
  materials: "Materiales",
  skills: "Habilidades",
  logistics: "Logística",
  other: "Otro",
};
/**
 * El estado de un aporte se dice en palabras y el color sólo acompaña: antes
 * el badge llevaba el tipo ("Tiempo") con el color del estado, y el estado,
 * que el alta anuncia como público, sólo se veía por color (WCAG 1.4.1).
 * "No utilizado" va neutro: que no se haya usado no es un error.
 */
const CONTRIBUTION_STATUS_TONE: Record<
  string,
  "neutral" | "brand" | "success"
> = {
  offered: "neutral",
  accepted: "brand",
  completed: "success",
  declined: "neutral",
};
/** Chip neutro para datos que no son estados: tipo de aporte, contadores. */
const NEUTRAL_CHIP = "border-subtle bg-inset text-ink-muted";

/**
 * Opciones de un `StatusSelect` como una sola cadena.
 *
 * Son props primitivas a propósito. Qwik vuelve a dibujar un componente hijo
 * cuando alguna prop cambia de identidad; con un array nuevo en cada render
 * del padre, el refresco de loaders que sigue a la carga (D99) redibujaba el
 * selector antes de que terminara de bajar el manejador de `change`, y al
 * volver a aplicar `selected` pisaba lo recién elegido. Con cadenas iguales
 * no hay redibujado, y el DOM conserva la elección pase lo que pase.
 */
export function encodeStatusOptions(
  values: readonly string[],
  label: (value: string) => string,
): string {
  return values.map((value) => `${value}\t${label(value)}`).join("\n");
}

/**
 * Un `<select>` de estado que conserva lo que la persona eligió aunque el
 * padre se redibuje. Los loaders se refrescan solos poco después de cargar la
 * página y después de cada acción; un redibujado que vuelve a aplicar
 * `selected` desde los datos pisaba la elección hecha en ese intervalo, y el
 * formulario mandaba el estado viejo y "guardaba" lo que ya estaba. La
 * elección vive en una señal propia que sólo se vuelve a alinear cuando el
 * estado guardado cambia de verdad, y las props son primitivas para que un
 * redibujado del padre con los mismos datos no toque este componente.
 */
export const StatusSelect = component$<
  QwikIntrinsicElements["select"] & {
    name: string;
    current: string;
    /** Ver `encodeStatusOptions`. */
    options: string;
  }
>(({ current, options, ...rest }) => {
  const chosen = useSignal(current);
  useTask$(({ track }) => {
    chosen.value = track(() => current);
  });
  const entries = options.split("\n").map((entry) => {
    const [value, label] = entry.split("\t");
    return { value, label: label ?? value };
  });
  // Los atributos se pasan tal cual: un `id` explícito en `undefined` pisaría
  // el que `Select` deriva del `name` y rompería el `for` de la etiqueta.
  return (
    <Select
      {...rest}
      onChange$={(_, el) => {
        chosen.value = el.value;
      }}
    >
      {entries.map((option) => (
        <option
          key={option.value}
          value={option.value}
          selected={chosen.value === option.value}
        >
          {option.label}
        </option>
      ))}
    </Select>
  );
});

/* Íconos propios en lugar de emojis (D123): se tiñen con el texto y se ven
   igual en cualquier sistema. */
const CONTRIBUTION_KIND_ICON: Record<string, IconName> = {
  time: "clock",
  materials: "layers",
  skills: "bulb",
  logistics: "truck",
  other: "more",
};

export type ProjectExecutionActions = {
  addMilestone: ReturnType<typeof useAddMilestone>;
  updateMilestone: ReturnType<typeof useUpdateMilestone>;
  addTask: ReturnType<typeof useAddTask>;
  updateTask: ReturnType<typeof useUpdateTask>;
  offer: ReturnType<typeof useOfferContribution>;
  updateContribution: ReturnType<typeof useUpdateContribution>;
  updateProjectStatus: ReturnType<typeof useUpdateProjectStatus>;
};

type PublicProjectTask = Omit<Tables<"project_tasks">, "assigned_user_id">;

function useExecutionDisclosure(
  action:
    | ProjectExecutionActions["addMilestone"]
    | ProjectExecutionActions["addTask"]
    | ProjectExecutionActions["offer"],
  projectId: string,
) {
  const expanded = useSignal(action.formData?.get("project_id") === projectId);
  useTask$(({ track }) => {
    const result = track(() => action.value);
    if (
      result &&
      action.formData?.get("project_id") === projectId &&
      !action.isRunning
    )
      expanded.value = true;
  });
  return expanded;
}

const ExecutionStatusFeedback = component$<{
  action:
    | ProjectExecutionActions["updateTask"]
    | ProjectExecutionActions["updateMilestone"]
    | ProjectExecutionActions["updateContribution"]
    | ProjectExecutionActions["updateProjectStatus"];
  scopeField: string;
  scopeId: string;
}>(({ action, scopeField, scopeId }) => {
  const locale = useLocale();
  const result = useComputed$(() =>
    !action.isRunning && action.formData?.get(scopeField) === scopeId
      ? action.value
      : undefined,
  );
  return (
    <>
      {result.value?.message && (
        <Alert>{translate(locale, result.value.message)}</Alert>
      )}
      {result.value?.fieldErrors?.status && (
        <Alert>{translate(locale, "Elegí un estado válido.")}</Alert>
      )}
      {result.value && "saved" in result.value && (
        <p role="status" class="w-full text-xs text-success">
          {translate(locale, "El estado se guardó.")}
        </p>
      )}
    </>
  );
});

/**
 * Una tarea de la ejecución de un proyecto.
 *
 * Estaba escrita en línea dentro del `map` de hitos, que es también el motivo
 * por el que las tareas sin hito no se veían: el único lugar que las dibujaba
 * estaba anidado en un hito. Extraerla permite listar las dos clases con el
 * mismo markup en vez de duplicarlo.
 *
 * La acción de ruta es compartida; cada fila limita su estado y confirmación
 * al identificador enviado, sin bloquear las otras tareas.
 */
const TaskItem = component$<{
  task: PublicProjectTask;
  updateTask: ProjectExecutionActions["updateTask"];
  canManage: boolean;
  organizations: Pick<Tables<"organizations">, "id" | "name">[];
}>(({ task, canManage, organizations, updateTask }) => {
  const locale = useLocale();
  const isDone = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const isBlocked = task.status === "blocked";
  // Cadenas planas y no expresiones sobre `task`: Qwik compara una prop
  // derivada de un objeto por la identidad de ese objeto, y el refresco del
  // loader trae un `task` nuevo con los mismos datos. Con valores iguales el
  // selector no se vuelve a montar y conserva lo que la persona eligió (D99).
  const taskStatus = task.status;
  const taskSelectId = `task-status-${task.id}`;
  const taskSelectLabel = translate(locale, "Estado de la tarea {{title}}", {
    title: task.title,
  });
  const taskOptions = encodeStatusOptions(
    taskStatusOptions(task.status),
    (state) => translate(locale, TASK_STATUS_LABEL[state] ?? state),
  );

  return (
    <li
      key={task.id}
      class={cx(
        "flex flex-wrap items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
        isDone
          ? "border-subtle bg-surface/50 text-ink-muted"
          : isInProgress
            ? "border-brand-500/30 bg-brand-50/40 dark:bg-brand-950/20"
            : isBlocked
              ? "border-danger-500/30 bg-danger-50/40 dark:bg-danger-950/20"
              : "border-subtle bg-muted/60",
      )}
    >
      <span
        aria-hidden="true"
        class={cx(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
          isDone
            ? "bg-success-100 text-success-700 dark:bg-success-950 dark:text-success-300"
            : isInProgress
              ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 animate-pulse"
              : isBlocked
                ? "bg-danger-100 text-danger-700 dark:bg-danger-950 dark:text-danger-300"
                : "bg-inset text-ink-faint",
        )}
      >
        {isDone ? (
          <Icon name="check" />
        ) : isInProgress ? (
          <Icon name="sparkles" />
        ) : isBlocked ? (
          <Icon name="alert" />
        ) : (
          <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
        )}
      </span>
      <span
        dir="auto"
        class={cx("font-medium", isDone && "line-through text-ink-muted")}
      >
        {task.title}
      </span>
      {/* Las habilidades son texto libre de hasta 300 caracteres, así que van
          en una etiqueta propia y no en el Chip: su píldora (`rounded-full`)
          con varias líneas apoyaba la primera y la última sobre la curva del
          borde. Con el radio chico el texto envuelve parejo, el ícono queda
          en la primera línea y se puede copiar lo que pide la tarea. */}
      {task.skills_needed && (
        <span class="inline-flex max-w-full items-start gap-1.5 rounded-lg border border-subtle bg-inset px-2.5 py-1 text-2xs font-medium text-ink-muted">
          <Icon name="wrench" class="mt-0.5 text-[1.1em]" />
          <bdi dir="auto" class="min-w-0 break-words">
            {task.skills_needed}
          </bdi>
        </span>
      )}
      {task.assigned_organization_id && (
        <Badge tone="brand">
          <Icon name="building" />
          {translate(locale, "Responsable:")}{" "}
          {organizations.find((org) => org.id === task.assigned_organization_id)
            ?.name ?? translate(locale, "Institución")}
        </Badge>
      )}
      {canManage && (
        <Form action={updateTask} class="ml-auto flex items-center gap-1.5">
          <input type="hidden" name="task_id" value={task.id} />
          <input type="hidden" name="project_id" value={task.project_id} />
          {/* El `id` sale del `name`, así que todos los
                selectores de estado de la página —uno por tarea,
                uno por hito, uno por aporte— compartían
                `id="status"`. Además de HTML inválido, rompe
                `getElementById` y cualquier `label for`.

                El envío era automático al cambiar el valor: sin
                JavaScript no había forma de guardar, y con
                teclado las flechas sobre el desplegable cerrado
                disparaban el guardado en cada tecla, antes de
                llegar al estado que se quería. Con botón, el
                cambio se confirma cuando la persona lo decide. */}
          <StatusSelect
            name="status"
            id={taskSelectId}
            aria-label={taskSelectLabel}
            class="h-8 py-1 text-xs"
            current={taskStatus}
            options={taskOptions}
          />
          <SubmitButton
            variant="secondary"
            size="sm"
            class="h-8 px-2.5 text-xs"
            aria-label={translate(locale, "Guardar el estado de {{title}}", {
              title: task.title,
            })}
            pending={
              updateTask.isRunning &&
              updateTask.formData?.get("task_id") === task.id
            }
          >
            {translate(locale, "Guardar")}
          </SubmitButton>
          <ExecutionStatusFeedback
            action={updateTask}
            scopeField="task_id"
            scopeId={task.id}
          />
        </Form>
      )}
    </li>
  );
});

export const ProjectExecution = component$<{
  actions: ProjectExecutionActions;
  projectId: string;
  milestones: Tables<"project_milestones">[];
  tasks: PublicProjectTask[];
  contributions: Omit<Tables<"project_contributions">, "user_id">[];
  /**
   * La lectura de aportes falló y `contributions` llegó vacío por eso: el
   * vacío no puede decir que nadie ofreció nada (D74).
   */
  contributionsLoadFailed?: boolean;
  canManage: boolean;
  canModerate?: boolean;
  canContribute: boolean;
  projectStatus: Tables<"projects">["status"];
  organizations: Pick<Tables<"organizations">, "id" | "name">[];
}>(
  ({
    actions,
    projectId,
    milestones,
    tasks,
    contributions,
    contributionsLoadFailed = false,
    canManage,
    canModerate,
    canContribute,
    projectStatus,
    organizations,
  }) => {
    const {
      addMilestone,
      updateMilestone,
      addTask,
      updateTask,
      offer,
      updateContribution,
      updateProjectStatus,
    } = actions;
    const milestoneExpanded = useExecutionDisclosure(addMilestone, projectId);
    const taskExpanded = useExecutionDisclosure(addTask, projectId);
    const offerExpanded = useExecutionDisclosure(offer, projectId);
    const locale = useLocale();

    // Las que no cuelgan de ningún hito. Se comparan contra los hitos que
    // realmente llegaron y no sólo contra `null`: una tarea que apunta a un
    // hito borrado también dejaba de dibujarse.
    // Cadenas planas para los selectores de estado (ver TaskItem y D99).
    const generalStatus = projectStatus;
    const generalOptions = encodeStatusOptions(
      projectStatusOptions(projectStatus, canModerate),
      (state) =>
        translate(
          locale,
          PROJECT_STATUS_LABEL[state as ProjectStatus]?.label ?? state,
        ),
    );
    const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
    const looseTasks = tasks.filter(
      (task) => !task.milestone_id || !milestoneIds.has(task.milestone_id),
    );

    const completedMilestones = milestones.filter(
      (m) => m.status === "completed",
    ).length;
    const totalMilestones = milestones.length;
    const milestonePct =
      totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

    const completedTasks = tasks.filter((t) => t.status === "completed").length;
    const totalTasks = tasks.length;
    // Una sola frase para la línea del resumen y para lo que anuncia la barra.
    // Con una sola tarea decía "1 tareas registradas": va con su plural.
    const progressText =
      totalMilestones > 0
        ? translate(
            locale,
            "{{completed}} de {{total}} hitos completados ({{pct}}%)",
            {
              completed: formatNumber(completedMilestones, locale),
              total: formatNumber(totalMilestones, locale),
              pct: formatNumber(milestonePct, locale),
            },
          )
        : pluralize(
            totalTasks,
            "tarea registrada",
            "tareas registradas",
            locale,
          );

    return (
      <section class="mt-8" aria-labelledby="ejecucion-titulo">
        {/* Título de sección de página, con la misma escala que Preguntas y
            respuestas; antes era más grande que todos sus vecinos. */}
        <h2 id="ejecucion-titulo" class="font-display text-display-sm">
          {translate(locale, "Ejecución del proyecto")}
        </h2>
        <p class="mt-1 text-sm text-ink-muted">
          {translate(
            locale,
            "Hitos, tareas y aportes concretos para que el plan pueda avanzar.",
          )}
        </p>

        {canManage && (
          <Form
            action={updateProjectStatus}
            class="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-subtle bg-surface p-4"
          >
            <input type="hidden" name="project_id" value={projectId} />
            <Field name="status" label="Estado general" class="min-w-48 flex-1">
              <StatusSelect
                name="status"
                current={generalStatus}
                options={generalOptions}
              />
            </Field>
            <SubmitButton
              variant="secondary"
              pending={updateProjectStatus.isRunning}
            >
              {translate(locale, "Actualizar proyecto")}
            </SubmitButton>
            <ExecutionStatusFeedback
              action={updateProjectStatus}
              scopeField="project_id"
              scopeId={projectId}
            />
          </Form>
        )}

        {/* Resumen del avance: íconos propios y el chip del sistema en lugar
            de emojis y pastillas con ámbar crudo. Los contadores van neutros,
            porque "0/0 hitos" en verde parecía algo para festejar (D123), y
            la barra es un `progressbar` que dice de qué es su porcentaje. */}
        {(totalMilestones > 0 || totalTasks > 0) && (
          <div class="mt-4 rounded-2xl border border-subtle bg-surface p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <Icon name="chart" class="shrink-0 text-xl text-ink-muted" />
                <div>
                  <h3 class="text-sm font-semibold text-ink-strong">
                    {translate(locale, "Progreso de ejecución")}
                  </h3>
                  <p class="text-xs text-ink-muted">{progressText}</p>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <Chip variant="badge" icon="flag" toneClass={NEUTRAL_CHIP}>
                  {formatNumber(completedMilestones, locale)}/
                  {formatNumber(totalMilestones, locale)}{" "}
                  {translate(locale, "hitos")}
                </Chip>
                <Chip variant="badge" icon="list" toneClass={NEUTRAL_CHIP}>
                  {formatNumber(completedTasks, locale)}/
                  {formatNumber(totalTasks, locale)}{" "}
                  {translate(locale, "tareas")}
                </Chip>
                {contributions.length > 0 && (
                  <Chip
                    variant="badge"
                    icon="handshake"
                    toneClass={NEUTRAL_CHIP}
                  >
                    {pluralize(
                      contributions.length,
                      "aporte",
                      "aportes",
                      locale,
                    )}
                  </Chip>
                )}
              </div>
            </div>
            {totalMilestones > 0 && (
              <div class="mt-3">
                <ProgressBar
                  value={completedMilestones}
                  max={totalMilestones}
                  label="Progreso de ejecución"
                  valueText={progressText}
                />
              </div>
            )}
          </div>
        )}

        <div class="mt-5 space-y-4">
          {milestones.length === 0 && (
            <p class="rounded-2xl border border-dashed border-strong p-5 text-sm text-ink-faint">
              {translate(locale, "Todavía no se definieron hitos.")}
            </p>
          )}

          {milestones.length > 0 && (
            <div class="relative space-y-6 before:absolute before:left-5 before:top-4 before:bottom-6 before:w-0.5 before:bg-subtle/60">
              {milestones.map((milestone, idx) => {
                const isCompleted = milestone.status === "completed";
                const isInProgress = milestone.status === "in_progress";
                const isBlocked = milestone.status === "blocked";
                const milestoneStatus = milestone.status;
                const milestoneOptions = encodeStatusOptions(
                  milestoneStatusOptions(milestone.status),
                  (state) =>
                    translate(locale, MILESTONE_STATUS_LABEL[state] ?? state),
                );
                const milestoneTasks = tasks.filter(
                  (task) => task.milestone_id === milestone.id,
                );

                return (
                  <div
                    key={milestone.id}
                    class="relative flex items-start gap-3 sm:gap-4"
                  >
                    {/* Indicador del hito en la línea de tiempo */}
                    <div
                      class={cx(
                        "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold shadow-xs transition-all",
                        isCompleted
                          ? "border-success-500 bg-success-50 text-success-700 ring-4 ring-success-500/10 dark:bg-success-950/80 dark:text-success-300"
                          : isInProgress
                            ? "border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/20 animate-pulse dark:bg-brand-950/80 dark:text-brand-300"
                            : isBlocked
                              ? "border-danger-500 bg-danger-50 text-danger-700 ring-4 ring-danger-500/10 dark:bg-danger-950/80 dark:text-danger-300"
                              : "border-subtle bg-surface text-ink-faint",
                      )}
                      aria-label={translate(locale, "Hito {{num}}", {
                        num: idx + 1,
                      })}
                    >
                      {isCompleted ? (
                        <Icon name="check" />
                      ) : isInProgress ? (
                        <Icon name="sparkles" />
                      ) : isBlocked ? (
                        <Icon name="alert" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    {/* Tarjeta del hito */}
                    <Card
                      class={cx(
                        "flex-1 p-5 transition-shadow",
                        isInProgress
                          ? "border-brand-500/40 shadow-soft ring-1 ring-brand-500/20"
                          : "border-subtle",
                      )}
                    >
                      <div class="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            isCompleted
                              ? "success"
                              : isBlocked
                                ? "danger"
                                : isInProgress
                                  ? "brand"
                                  : "neutral"
                          }
                        >
                          {milestone.status === "pending"
                            ? translate(locale, "Pendiente")
                            : isInProgress
                              ? translate(locale, "En curso")
                              : isCompleted
                                ? translate(locale, "Completado")
                                : translate(locale, "Bloqueado")}
                        </Badge>
                        <h3 dir="auto" class="font-semibold text-ink-strong">
                          {milestone.title}
                        </h3>
                        {milestone.target_date && (
                          <span class="ml-auto text-xs text-ink-faint">
                            {translate(locale, "Meta: {{date}}", {
                              date: formatDate(milestone.target_date, locale),
                            })}
                          </span>
                        )}
                      </div>
                      {milestone.description && (
                        <p
                          dir="auto"
                          class="ugc-text mt-2 text-sm text-ink-muted"
                        >
                          {milestone.description}
                        </p>
                      )}
                      {milestoneTasks.length > 0 && (
                        <ul class="mt-3.5 space-y-2">
                          {milestoneTasks.map((task) => (
                            <TaskItem
                              key={task.id}
                              task={task}
                              updateTask={updateTask}
                              canManage={canManage}
                              organizations={organizations}
                            />
                          ))}
                        </ul>
                      )}
                      {canManage && (
                        <Form
                          action={updateMilestone}
                          class="mt-3.5 flex items-center gap-2 border-t border-subtle/60 pt-3"
                        >
                          <input
                            type="hidden"
                            name="milestone_id"
                            value={milestone.id}
                          />
                          <input
                            type="hidden"
                            name="project_id"
                            value={projectId}
                          />
                          <StatusSelect
                            name="status"
                            id={`milestone-status-${milestone.id}`}
                            aria-label={translate(
                              locale,
                              "Estado del hito {{title}}",
                              {
                                title: milestone.title,
                              },
                            )}
                            class="max-w-48"
                            current={milestoneStatus}
                            options={milestoneOptions}
                          />
                          <SubmitButton
                            variant="secondary"
                            size="sm"
                            pending={
                              updateMilestone.isRunning &&
                              updateMilestone.formData?.get("milestone_id") ===
                                milestone.id
                            }
                          >
                            {translate(locale, "Actualizar hito")}
                          </SubmitButton>
                          <ExecutionStatusFeedback
                            action={updateMilestone}
                            scopeField="milestone_id"
                            scopeId={milestone.id}
                          />
                        </Form>
                      )}
                    </Card>
                  </div>
                );
              })}
            </div>
          )}

          {/* Tareas sueltas.
              El formulario de alta ofrece "Sin hito" y la action lo guarda como
              `milestone_id: null`, pero el único lugar que dibujaba tareas
              estaba adentro del `map` de hitos: la tarea se creaba, se
              guardaba y no aparecía en ninguna parte. La interfaz ofrecía una
              opción que hacía desaparecer lo que se acababa de crear. */}
          {looseTasks.length > 0 && (
            <Card class="p-5">
              <h3 class="font-semibold">
                {translate(locale, "Tareas sin hito")}
              </h3>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Trabajo que todavía no se colgó de ningún hito.",
                )}
              </p>
              <ul class="mt-3 space-y-2">
                {looseTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    updateTask={updateTask}
                    canManage={canManage}
                    organizations={organizations}
                  />
                ))}
              </ul>
            </Card>
          )}
        </div>

        {canManage && (
          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <Card class="p-4">
              <details
                open={milestoneExpanded.value}
                onToggle$={(_, element) => {
                  milestoneExpanded.value = element.open;
                }}
              >
                <summary class="cursor-pointer font-medium text-brand">
                  {translate(locale, "Crear hito")}
                </summary>
                <ProjectExecutionCreateForm
                  action={addMilestone}
                  kind="milestone"
                  projectId={projectId}
                  sortOrder={milestones.length}
                  milestones={milestones}
                  organizations={organizations}
                />
              </details>
            </Card>
            <Card class="p-4">
              <details
                open={taskExpanded.value}
                onToggle$={(_, element) => {
                  taskExpanded.value = element.open;
                }}
              >
                <summary class="cursor-pointer font-medium text-brand">
                  {translate(locale, "Crear tarea")}
                </summary>
                <ProjectExecutionCreateForm
                  action={addTask}
                  kind="task"
                  projectId={projectId}
                  sortOrder={milestones.length}
                  milestones={milestones}
                  organizations={organizations}
                />
              </details>
            </Card>
          </div>
        )}

        {/* El panel de aporte manda acá ("Ofrecelos acá"). Sin filas ni
            sesión quedaba un título solo: ahora dice que todavía no hay
            aportes y qué hace falta para ofrecer uno. */}
        <div id="aportes-no-monetarios" class="mt-6 scroll-mt-24">
          <div class="flex flex-wrap items-center gap-2.5">
            <h3 class="min-w-0 flex-1 font-display text-display-xs text-ink-strong">
              {translate(locale, "Aportes no monetarios")}
            </h3>
            {contributions.length > 0 && (
              <span class="text-xs font-medium tabular-nums text-ink-muted">
                {pluralize(contributions.length, "aporte", "aportes", locale)}
              </span>
            )}
          </div>
          {contributionsLoadFailed && (
            <Alert tone="warn" class="mt-3">
              {translate(
                locale,
                "No pudimos cargar los aportes. Recargá la página para volver a intentarlo.",
              )}
            </Alert>
          )}
          {contributions.length > 0 ? (
            <ul class="mt-3 space-y-2">
              {contributions.map((entry) => {
                const contributionStatus = entry.status;
                const contributionOptions = encodeStatusOptions(
                  contributionStatusOptions(entry.status),
                  (state) =>
                    translate(
                      locale,
                      CONTRIBUTION_STATUS_LABEL[state] ?? state,
                    ),
                );
                return (
                  <li
                    key={entry.id}
                    class="flex flex-wrap items-center gap-3 rounded-2xl border border-subtle bg-surface p-4"
                  >
                    {/* El tipo con su ícono, neutro; el estado, aparte y en
                        palabras. */}
                    <Chip
                      variant="badge"
                      icon={CONTRIBUTION_KIND_ICON[entry.kind] ?? "more"}
                      toneClass={NEUTRAL_CHIP}
                    >
                      {translate(
                        locale,
                        CONTRIBUTION_KIND_LABEL[entry.kind] ?? entry.kind,
                      )}
                    </Chip>
                    <span class="min-w-0 flex-1 text-sm text-ink">
                      <bdi dir="auto" class="ugc-text">
                        {entry.description}
                      </bdi>
                      {entry.quantity ? (
                        <>
                          {" · "}
                          {formatNumber(entry.quantity, locale)}{" "}
                          {entry.unit ?? ""}
                        </>
                      ) : null}
                    </span>
                    <Badge
                      tone={CONTRIBUTION_STATUS_TONE[entry.status] ?? "neutral"}
                    >
                      {translate(
                        locale,
                        CONTRIBUTION_STATUS_LABEL[entry.status] ?? entry.status,
                      )}
                    </Badge>
                    {canManage && (
                      <Form action={updateContribution} class="flex gap-2">
                        <input
                          type="hidden"
                          name="contribution_id"
                          value={entry.id}
                        />
                        <input
                          type="hidden"
                          name="project_id"
                          value={projectId}
                        />
                        <StatusSelect
                          name="status"
                          id={`contribution-status-${entry.id}`}
                          aria-label={translate(locale, "Estado del aporte")}
                          class="max-w-36"
                          current={contributionStatus}
                          options={contributionOptions}
                        />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          pending={
                            updateContribution.isRunning &&
                            updateContribution.formData?.get(
                              "contribution_id",
                            ) === entry.id
                          }
                        >
                          {translate(locale, "Guardar")}
                        </SubmitButton>
                        <ExecutionStatusFeedback
                          action={updateContribution}
                          scopeField="contribution_id"
                          scopeId={entry.id}
                        />
                      </Form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            // Ante un fallo de lectura la lista llega vacía: el aviso de
            // arriba ya lo dice y acá no se afirma que nadie ofreció nada.
            !contributionsLoadFailed && (
              <p class="mt-2 text-sm text-ink-faint">
                {translate(
                  locale,
                  "Todavía nadie ofreció tiempo, materiales ni habilidades.",
                )}
              </p>
            )
          )}

          {/* Quien no puede ofrecer se enteraba recién al no encontrar el
              formulario; el llamado a ingresar ya está en el panel de aporte. */}
          {!canContribute && (
            <p class="mt-2 text-xs text-ink-muted">
              {translate(
                locale,
                "Para ofrecer un aporte hay que ingresar y vivir en la comunidad del proyecto.",
              )}
            </p>
          )}

          {canContribute && (
            <Card class="mt-3 p-4">
              <details
                open={offerExpanded.value}
                onToggle$={(_, element) => {
                  offerExpanded.value = element.open;
                }}
              >
                <summary class="cursor-pointer text-sm font-medium text-brand">
                  {translate(
                    locale,
                    "Ofrecer tiempo, materiales o habilidades",
                  )}
                </summary>
                <ProjectExecutionCreateForm
                  action={offer}
                  kind="contribution"
                  projectId={projectId}
                  sortOrder={milestones.length}
                  milestones={milestones}
                  organizations={organizations}
                />
              </details>
            </Card>
          )}
        </div>
      </section>
    );
  },
);
