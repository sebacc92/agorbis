import {
  component$,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
} from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import { PublicationError } from "~/components/forms/PublicationError";
import type { PublicationFeedback } from "~/lib/content-publication";
import { Field, Input, Select, SubmitButton, Textarea } from "~/components/ui";
import type { Tables } from "~/lib/database.types.helpers";
import { useLocale, translate } from "~/lib/i18n";
import type {
  useAddMilestone,
  useAddTask,
  useOfferContribution,
} from "~/routes/proyectos/[id]";

type CreateAction =
  | ReturnType<typeof useAddMilestone>
  | ReturnType<typeof useAddTask>
  | ReturnType<typeof useOfferContribution>;
type FieldDefinition = {
  name: string;
  label: string;
  type?: "textarea" | "date" | "number" | "select";
  required?: boolean;
  maximum?: number;
  minimum?: number;
  options?: { value: string; label: string; ui?: boolean }[];
};

export const ProjectExecutionCreateForm = component$<{
  action: CreateAction;
  kind: "milestone" | "task" | "contribution";
  projectId: string;
  sortOrder?: number;
  milestones?: Tables<"project_milestones">[];
  organizations?: Pick<Tables<"organizations">, "id" | "name">[];
}>(
  ({
    action,
    kind,
    projectId,
    sortOrder,
    milestones = [],
    organizations = [],
  }) => {
    const locale = useLocale();
    const prefix = `execution-${kind}-${projectId}-`;
    const defaults: Record<string, string> = {
      title: "",
      description: "",
      target_date: "",
      milestone_id: "",
      skills_needed: "",
      assigned_organization_id: "",
      due_date: "",
      kind: "time",
      quantity: "",
      unit: "",
    };
    const ownPost = action.formData?.get("project_id") === projectId;
    const draft = useStore(
      Object.fromEntries(
        Object.entries(defaults).map(([field, initial]) => [
          field,
          ownPost && action.value?.failed
            ? (action.formData?.get(field)?.toString() ?? initial)
            : initial,
        ]),
      ),
    );
    const handled = useSignal("");
    const feedback = useComputed$<
      | (PublicationFeedback & { saved?: boolean; confirmationId?: string })
      | undefined
    >(() =>
      action.formData?.get("project_id") === projectId && !action.isRunning
        ? action.value
        : undefined,
    );
    useTask$(({ track }) => {
      const result = track(() => action.value);
      const posted = action.formData;
      if (
        !result ||
        !("saved" in result) ||
        !result.saved ||
        !result.confirmationId ||
        !posted ||
        posted.get("project_id") !== projectId ||
        handled.value === result.confirmationId
      )
        return;
      handled.value = result.confirmationId;
      for (const field of Object.keys(defaults)) {
        if (draft[field] === (posted.get(field) ?? ""))
          draft[field] = defaults[field]!;
      }
    });
    const fields: FieldDefinition[] =
      kind === "milestone"
        ? [
            {
              name: "title",
              label: "Hito",
              required: true,
              minimum: 3,
              maximum: 160,
            },
            {
              name: "description",
              label: "Resultado esperado",
              type: "textarea",
              maximum: 1000,
            },
            { name: "target_date", label: "Fecha objetivo", type: "date" },
          ]
        : kind === "task"
          ? [
              {
                name: "milestone_id",
                label: "Hito",
                type: "select",
                options: [
                  { value: "", label: "Sin hito", ui: true },
                  ...milestones.map((item) => ({
                    value: item.id,
                    label: item.title,
                  })),
                ],
              },
              {
                name: "title",
                label: "Tarea",
                required: true,
                minimum: 3,
                maximum: 180,
              },
              {
                name: "description",
                label: "Detalle",
                type: "textarea",
                maximum: 1000,
              },
              {
                name: "skills_needed",
                label: "Habilidades o recursos",
                maximum: 300,
              },
              {
                name: "assigned_organization_id",
                label: "Organización responsable",
                type: "select",
                options: [
                  { value: "", label: "Sin asignar", ui: true },
                  ...organizations.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ],
              },
              { name: "due_date", label: "Vencimiento", type: "date" },
            ]
          : [
              {
                name: "kind",
                label: "Tipo",
                required: true,
                type: "select",
                options: [
                  ["time", "Tiempo"],
                  ["materials", "Materiales"],
                  ["skills", "Habilidades"],
                  ["logistics", "Logística"],
                  ["other", "Otro"],
                ].map(([value, label]) => ({
                  value: value!,
                  label: label!,
                  ui: true,
                })),
              },
              { name: "quantity", label: "Cantidad", type: "number" },
              { name: "unit", label: "Unidad", maximum: 40 },
              {
                name: "description",
                label: "¿Qué podés aportar?",
                required: true,
                type: "textarea",
                minimum: 5,
                maximum: 1000,
              },
            ];
    return (
      <Form<CreateAction["value"], never>
        action={action}
        class="mt-4 space-y-3"
      >
        <input type="hidden" name="project_id" value={projectId} />
        {kind === "milestone" && (
          <input type="hidden" name="sort_order" value={sortOrder ?? 0} />
        )}
        <PublicationError
          value={feedback.value}
          title="No se guardó todavía"
          fieldIdPrefix={prefix}
        />
        {feedback.value && "saved" in feedback.value && (
          <p role="status" class="text-sm text-success">
            {translate(
              locale,
              kind === "milestone"
                ? "El hito se creó."
                : kind === "task"
                  ? "La tarea se creó."
                  : "Tu aporte se registró.",
            )}
          </p>
        )}
        {fields.map((field) => {
          const error = feedback.value?.fieldErrors?.[field.name];
          const controlId = `${prefix}${field.name}`;
          return (
            <Field
              key={field.name}
              name={controlId}
              label={field.label}
              required={field.required}
              error={error}
            >
              {field.type === "select" ? (
                <Select
                  id={controlId}
                  name={field.name}
                  value={draft[field.name]}
                  onChange$={(_, control) => {
                    draft[field.name] = control.value;
                  }}
                  required={field.required}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${controlId}-error` : undefined}
                >
                  {field.options?.map((option) => (
                    <option
                      key={option.value || "none"}
                      value={option.value}
                      selected={draft[field.name] === option.value}
                    >
                      {option.ui
                        ? translate(locale, option.label)
                        : option.label}
                    </option>
                  ))}
                </Select>
              ) : field.type === "textarea" ? (
                <Textarea
                  id={controlId}
                  name={field.name}
                  value={draft[field.name]}
                  onInput$={(_, control) => {
                    draft[field.name] = control.value;
                  }}
                  required={field.required}
                  minLength={field.minimum}
                  maxLength={field.maximum}
                  rows={3}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${controlId}-error` : undefined}
                />
              ) : (
                <Input
                  id={controlId}
                  name={field.name}
                  type={field.type ?? "text"}
                  value={draft[field.name]}
                  onInput$={(_, control) => {
                    draft[field.name] = control.value;
                  }}
                  required={field.required}
                  minLength={field.minimum}
                  maxLength={field.maximum}
                  min={field.type === "number" ? "0" : undefined}
                  step={field.type === "number" ? "any" : undefined}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${controlId}-error` : undefined}
                />
              )}
            </Field>
          );
        })}
        {kind === "contribution" && (
          <p class="rounded-xl border border-subtle bg-inset px-3 py-2 text-xs leading-5 text-ink-muted">
            {translate(
              locale,
              "La descripción, cantidad, unidad, estado y fecha serán públicos. Tu cuenta se conserva aparte para gestionar el aporte, pero no aparece en el listado; no escribas datos de contacto privados.",
            )}
          </p>
        )}
        <SubmitButton pending={action.isRunning}>
          {translate(
            locale,
            kind === "milestone"
              ? "Crear hito"
              : kind === "task"
                ? "Crear tarea"
                : "Ofrecer aporte",
          )}
        </SubmitButton>
      </Form>
    );
  },
);
