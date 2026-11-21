import { PublicationError } from "~/components/forms/PublicationError";
import { PublishedNotice } from "~/components/forms/PublishedNotice";
import { ACTION_PENDING_ATTRIBUTE } from "~/lib/action-guard";
import { showToast } from "~/components/ui/Toast";
import { $, component$, useSignal, useTask$ } from "@qwik.dev/core";
import { Form, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  DraftStatusBar,
  CharCounter,
  ConfirmPanel,
  FormShell,
} from "~/components/forms/FormShell";
import {
  Alert,
  buttonClass,
  Button,
  Card,
  Field,
  Input,
  Select,
  SubmitButton,
  Textarea,
  cx,
  triggerHapticFeedback,
  Icon,
} from "~/components/ui";
import { routes } from "~/lib/community";
import { isUuid } from "~/lib/http";
import { draftKey, useDraft } from "~/components/forms/useDraft";
import { postedText } from "~/components/forms/posted-fields";
import { useWizardFocus } from "~/components/forms/wizard-focus";
import {
  PROJECT_FIELD_STEPS,
  projectStepErrors,
} from "~/components/forms/project-validation";
import { CONTENT_TYPES } from "~/lib/quota";
import { APP_NAME, PLEDGE_DISCLAIMER } from "~/lib/constants";
import { loadCreateContext, useCreateProject } from "~/lib/content-actions";
import { formatMoney } from "~/lib/format";
import {
  parseProjectBudgetInput,
  projectBudgetExample,
  projectBudgetInputMessage,
} from "~/lib/project-budget-input";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";

const CURRENCIES = ["ARS", "USD", "EUR", "BRL", "CLP", "UYU", "MXN"];

const STEPS = [
  { key: 1, label: "Qué", hint: "La idea en una frase" },
  { key: 2, label: "Cómo", hint: "El plan, etapa por etapa" },
  { key: 3, label: "Cuánto", hint: "Presupuesto y tiempos" },
] as const;

export const useProjectContext = routeLoader$(async (ev) => {
  const context = await loadCreateContext(ev, "project");
  const claimId = ev.url.searchParams.get("desde_reclamo");
  // Un valor que no es UUID terminaba en un 500 con el texto del visitante en
  // los logs; no hay reclamo que buscar.
  if (!claimId || !isUuid(claimId)) return { ...context, sourceClaim: null };

  const viewer = await getViewer(ev);
  const db = supabase(ev);
  const claim = await single(
    ev,
    "c-c-proyectos-nuevo/claim",
    db
      .from("claims")
      .select("id, title, description, author_id, community_id")
      .eq("id", claimId)
      .eq("community_id", context.community.id)
      .maybeSingle(),
  );

  const canConvert =
    !!claim && (viewer.isModerator || claim.author_id === viewer.userId);
  return { ...context, sourceClaim: canConvert ? claim : null };
});

const ProjectForm = component$(() => {
  const ctx = useProjectContext();
  const create = useCreateProject();
  const locale = useLocale();

  const { community, chain, summary, quota, sourceClaim, draftOwnerId } =
    ctx.value;

  // Sin scripts, el CSS muestra los tres pasos y conserva el envío nativo.
  const step = useSignal(1);
  const stepAnnouncement = useSignal("");

  const localErrors = useSignal<Record<string, string>>({});
  const form = useSignal<HTMLFormElement>();
  const focusRequest = useWizardFocus(form);
  /** Pasos que quedaron con algún error después de enviar. */
  const failedSteps = new Set(
    Object.keys({ ...create.value?.fieldErrors, ...localErrors.value })
      .map((field) => PROJECT_FIELD_STEPS[field])
      .filter((value): value is number => value !== undefined),
  );

  /**
   * Volver al paso donde está el problema.
   *
   * Los pasos que no se están viendo siguen en el DOM con `hidden`, así que un
   * error en el título —paso 1— se dibujaba dentro de un contenedor invisible
   * mientras la persona miraba el paso 3: el envío fallaba, arriba aparecía un
   * aviso genérico y el campo que lo causó no estaba en pantalla. Se salta al
   * primero que falló, que es donde se puede arreglar.
   */
  useTask$(({ track }) => {
    track(() => create.value);
    const first = Math.min(
      ...Object.keys(create.value?.fieldErrors ?? {})
        .map((name) => PROJECT_FIELD_STEPS[name])
        .filter(Number.isFinite),
    );
    if (Number.isFinite(first)) step.value = first;
  });
  const title = useSignal(
    postedText(
      create.formData,
      "title",
      sourceClaim
        ? translate(locale, "Solución para: {{title}}", {
            title: sourceClaim.title,
          }).slice(0, 150)
        : "",
    ),
  );
  const summaryText = useSignal(
    postedText(
      create.formData,
      "summary",
      sourceClaim
        ? translate(
            locale,
            "Proyecto para resolver el reclamo “{{title}}” con un plan verificable.",
            {
              title: sourceClaim.title,
            },
          )
        : "",
    ),
  );
  const plan = useSignal(
    postedText(
      create.formData,
      "plan",
      sourceClaim
        ? translate(
            locale,
            "Problema de origen:\n{{description}}\n\nPlan de acción:\n1. Relevar responsables y alcance.\n2. Definir tareas, recursos e hitos.\n3. Ejecutar y publicar avances.",
            { description: sourceClaim.description },
          )
        : "",
    ),
  );
  const budget = useSignal(
    postedText(
      create.formData,
      "edit_budget_amount",
      postedText(create.formData, "budget_amount"),
    ),
  );
  // El texto y su notación viajan juntos: cambiar de idioma no cambia el importe.
  const budgetLocale = useSignal<"es" | "en">(
    postedText(
      create.formData,
      "edit_budget_locale",
      postedText(create.formData, "budget_locale", locale),
    ) === "en"
      ? "en"
      : "es",
  );
  const budgetTouched = useSignal(false);
  const currency = useSignal(postedText(create.formData, "currency", "ARS"));
  const resourcesNeeded = useSignal(
    postedText(create.formData, "resources_needed"),
  );
  const timeEstimate = useSignal(postedText(create.formData, "time_estimate"));
  // `Select` es un componente: el listener debe cruzar ese límite como QRL.
  const handleCurrencyChange = $((_: Event, el: HTMLSelectElement) => {
    currency.value = el.value;
  });

  /**
   * El plan de un proyecto admite 5.000 caracteres: es el formulario más largo
   * de la app y el que más caro sale perder.
   *
   * Los proyectos originados en reclamos tienen borradores separados para no
   * mezclar el plan de un reclamo con el de otro.
   */
  const draft = draftKey(
    sourceClaim ? `project-${sourceClaim.id}` : "project",
    community.slug,
    draftOwnerId,
  );
  const draftStorage = useDraft(
    draft,
    {
      title,
      summaryText,
      plan,
      budget,
      budgetLocale,
      currency,
      resourcesNeeded,
      timeEstimate,
    },
    create,
  );

  const discardDraft$ = $(async () => {
    await draftStorage.reset();
    triggerHapticFeedback("selection");
    showToast(translate(locale, "Borrador descartado"), "info");
  });

  const goToStep = $((target: number) => {
    if (target > step.value) {
      const errors = projectStepErrors(
        { title: title.value, summary: summaryText.value, plan: plan.value },
        target - 1,
      );
      localErrors.value = errors;
      const first = Object.keys(errors)[0];
      if (first) {
        step.value = PROJECT_FIELD_STEPS[first];
        stepAnnouncement.value = translate(
          locale,
          "Paso {{current}} de {{total}}: {{name}}",
          {
            current: step.value,
            total: 3,
            name: translate(locale, STEPS[step.value - 1].label),
          },
        );
        focusRequest.value = { step: step.value, field: first };
        return false;
      }
    }
    step.value = Math.min(target, 3);
    if (target <= 3) {
      stepAnnouncement.value = translate(
        locale,
        "Paso {{current}} de {{total}}: {{name}}",
        {
          current: step.value,
          total: 3,
          name: translate(locale, STEPS[step.value - 1].label),
        },
      );
      focusRequest.value = { step: step.value };
    }
    return true;
  });

  const submitProject = $(
    async (_event: SubmitEvent, element: HTMLFormElement) => {
      // `isRunning` se enciende en el mismo tick del envío: alcanza para frenar
      // un segundo toque antes de que Qwik vuelva a pintar el botón apagado.
      if (create.isRunning) return;
      // Este formulario envía a mano (`create.submit(FormData)`), así que el
      // guardián de envíos (D114) no recibe `submitcompleted`: si acá se decide
      // no enviar, hay que soltar la marca o el próximo toque quedaría mudo.
      const releasePending = () =>
        element.removeAttribute(ACTION_PENDING_ATTRIBUTE);
      // La validación nativa no puede enfocar los required de los pasos ocultos.
      if (!(await goToStep(4))) return releasePending();
      const parsed = parseProjectBudgetInput(budget.value, budgetLocale.value);
      budgetTouched.value = true;
      if (!parsed.valid) {
        localErrors.value = {
          ...localErrors.value,
          budget_amount: projectBudgetInputMessage(parsed.reason),
        };
        focusRequest.value = { step: 3, field: "budget_amount" };
        return releasePending();
      }
      await draftStorage.persist();
      const data = new FormData(element);
      data.set("budget_amount", parsed.canonical);
      data.set("budget_locale", "en");
      await create.submit(data);
    },
  );

  const preview =
    create.value &&
    "preview" in create.value &&
    create.value.preview &&
    create.value.preview.community_slug === community.slug &&
    (create.value.preview.source_claim_id ?? "") === (sourceClaim?.id ?? "") &&
    !draftStorage.editing.value
      ? create.value.preview
      : null;

  const parsedBudget = parseProjectBudgetInput(
    budget.value,
    budgetLocale.value,
  );
  const budgetExample = projectBudgetExample(budgetLocale.value);
  const budgetError =
    budgetTouched.value && !parsedBudget.valid
      ? translate(locale, projectBudgetInputMessage(parsedBudget.reason), {
          example: budgetExample,
        })
      : create.value?.fieldErrors?.budget_amount
        ? translate(locale, create.value.fieldErrors.budget_amount)
        : "";

  if (preview) {
    return (
      <FormShell
        draftStatus={draftStorage.status.value}
        beforeNavigate$={draftStorage.beforeNavigate}
        revealOnMount
        type="project"
        community={community}
        chain={chain}
        summary={summary}
        title={translate(locale, "Confirmá tu proyecto")}
        subtitle={translate(
          locale,
          "Así lo va a ver el resto. Todavía no se publicó.",
        )}
      >
        <Card class="p-5 sm:p-6">
          <ConfirmPanel
            type="project"
            communityName={community.name}
            remaining={quota?.remaining ?? null}
          />

          <h2 dir="auto" class="mt-5 text-xl font-semibold tracking-tight">
            {preview.title}
          </h2>
          <p dir="auto" class="ugc-text mt-2 text-ink-muted">
            {preview.summary}
          </p>

          <div class="mt-5">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {translate(locale, "Cómo se llevaría a cabo")}
            </h3>
            <p
              dir="auto"
              class="ugc-text mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink"
            >
              {preview.plan}
            </p>
          </div>

          <dl class="mt-5 grid gap-3 sm:grid-cols-2">
            {preview.budget_amount && (
              <div class="rounded-2xl bg-muted p-3.5">
                <dt class="text-xs uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Presupuesto")}
                </dt>
                <dd class="mt-1 text-lg font-semibold tabular-nums text-ink-strong">
                  {formatMoney(
                    Number(preview.budget_amount),
                    preview.currency,
                    locale,
                  )}
                </dd>
              </div>
            )}
            {preview.time_estimate && (
              <div class="rounded-2xl bg-muted p-3.5">
                <dt class="text-xs uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Tiempo estimado")}
                </dt>
                <dd
                  dir="auto"
                  class="mt-1 text-lg font-semibold text-ink-strong"
                >
                  {preview.time_estimate}
                </dd>
              </div>
            )}
            {preview.resources_needed && (
              <div class="rounded-2xl bg-muted p-3.5 sm:col-span-2">
                <dt class="text-xs uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Recursos necesarios")}
                </dt>
                <dd
                  dir="auto"
                  class="ugc-text mt-1 whitespace-pre-line text-sm text-ink-muted"
                >
                  {preview.resources_needed}
                </dd>
              </div>
            )}
          </dl>

          <Form
            action={create}
            onSubmit$={draftStorage.persist}
            class="mt-6 flex flex-wrap gap-2"
          >
            <input type="hidden" name="community_slug" value={community.slug} />
            <input
              type="hidden"
              name="source_claim_id"
              value={sourceClaim?.id ?? ""}
            />
            <input type="hidden" name="title" value={preview.title} />
            <input type="hidden" name="summary" value={preview.summary} />
            <input type="hidden" name="plan" value={preview.plan} />
            <input
              type="hidden"
              name="budget_amount"
              value={preview.budget_amount ?? ""}
            />
            <input type="hidden" name="budget_locale" value="en" />
            <input
              type="hidden"
              name="edit_budget_amount"
              value={preview.budget_input}
            />
            <input
              type="hidden"
              name="edit_budget_locale"
              value={preview.budget_locale}
            />
            <input type="hidden" name="currency" value={preview.currency} />
            <input
              type="hidden"
              name="resources_needed"
              value={preview.resources_needed ?? ""}
            />
            <input
              type="hidden"
              name="time_estimate"
              value={preview.time_estimate ?? ""}
            />
            <input type="hidden" name="confirm" value="si" />
            {/* Publicado el proyecto, el borrador ya cumplió. */}
            <SubmitButton
              size="lg"
              pending={create.isRunning || draftStorage.published.value}
            >
              {translate(locale, "Publicar proyecto")}
            </SubmitButton>
            {/* La revisión es estado de la acción, no otra entrada del historial. */}
            <a
              data-requires-script
              href={routes.newContent(
                community.slug,
                CONTENT_TYPES["project"].newPath,
              )}
              class={buttonClass("secondary", "lg")}
              preventdefault:click
              onClick$={draftStorage.edit}
            >
              {translate(locale, "Volver a editar")}
            </a>
            <div data-without-script>
              <button
                type="submit"
                name="edit"
                value="si"
                class={buttonClass("secondary", "lg")}
              >
                {translate(locale, "Volver a editar")}
              </button>
            </div>
          </Form>

          <PublicationError value={create.value} />
        </Card>
      </FormShell>
    );
  }

  return (
    <FormShell
      draftStatus={draftStorage.status.value}
      beforeNavigate$={draftStorage.beforeNavigate}
      revealOnMount={draftStorage.editing.value}
      type="project"
      community={community}
      chain={chain}
      summary={summary}
      title={translate(locale, "Nuevo proyecto")}
      subtitle={translate(
        locale,
        "Un plan verificable vale más que una idea linda.",
      )}
    >
      {/* Progreso del wizard */}
      <ol
        data-requires-script
        class="mb-4 flex gap-2"
        aria-label={translate(locale, "Pasos del formulario")}
      >
        {STEPS.map((s) => (
          <li key={s.key} class="flex-1">
            <button
              type="button"
              onClick$={() => goToStep(s.key)}
              aria-current={step.value === s.key ? "step" : undefined}
              class="flex min-h-11 w-full flex-col justify-center text-left"
            >
              <span
                aria-hidden="true"
                class={cx(
                  "block h-1.5 rounded-full transition-colors",
                  failedSteps.has(s.key)
                    ? "bg-danger-500"
                    : step.value >= s.key
                      ? "bg-brand-600 dark:bg-brand-400"
                      : "bg-inset",
                )}
              />
              <span
                class={cx(
                  "mt-1.5 block text-xs",
                  failedSteps.has(s.key)
                    ? "font-semibold text-danger"
                    : step.value === s.key
                      ? "font-semibold text-ink-strong"
                      : "text-ink-faint",
                )}
              >
                {translate(locale, s.label)}
                {/* Con tres pasos y un solo aviso arriba, no se sabía en cuál
                    estaba el problema sin recorrerlos. */}
                {failedSteps.has(s.key) && (
                  <>
                    {" "}
                    <span aria-hidden="true">⚠</span>
                    <span class="sr-only">
                      {" "}
                      {translate(locale, "(tiene un error)")}
                    </span>
                  </>
                )}
              </span>
              <span class="hidden text-2xs text-ink-faint sm:block">
                {translate(locale, s.hint)}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="sr-only"
        data-requires-script
      >
        {stepAnnouncement.value}
      </p>

      <Card class="p-5 sm:p-6">
        <form
          data-native-form
          ref={form}
          method="post"
          action={create.actionPath}
          preventdefault:submit
          noValidate
          onSubmit$={submitProject}
          class="space-y-6"
        >
          <input type="hidden" name="community_slug" value={community.slug} />
          <input
            type="hidden"
            name="budget_locale"
            value={budgetLocale.value}
          />
          <input
            type="hidden"
            name="source_claim_id"
            value={sourceClaim?.id ?? ""}
          />

          <PublicationError value={create.value} />
          <PublishedNotice href={draftStorage.publishedTo.value} />

          <DraftStatusBar
            status={draftStorage.status.value}
            hasContent={!!(title.value || summaryText.value || plan.value)}
            onDiscard$={discardDraft$}
            restored={draftStorage.restored.value}
          />
          {sourceClaim && (
            <Alert tone="brand">
              {translate(locale, "Este proyecto quedará vinculado al reclamo")}{" "}
              “<bdi dir="auto">{sourceClaim.title}</bdi>”.
            </Alert>
          )}

          {/* ------------------------------------------------- Paso 1 · Qué */}
          <div
            data-native-form-step
            data-wizard-step="1"
            class={cx("space-y-6", step.value !== 1 && "hidden")}
          >
            <h2 data-wizard-heading tabIndex={-1} class="text-lg font-semibold">
              {translate(locale, "Qué")}
            </h2>
            <div>
              <div class="flex items-baseline justify-between gap-2">
                <label
                  for="title"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Título")}{" "}
                  <span class="text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <CharCounter value={title.value} max={150} id="title-count" />
              </div>
              <Input
                name="title"
                required
                maxLength={150}
                class="mt-1.5"
                placeholder={translate(
                  locale,
                  "Red de bicicleteros techados en las escuelas del oeste",
                )}
                invalid={
                  !!(
                    localErrors.value.title || create.value?.fieldErrors?.title
                  )
                }
                aria-describedby={
                  localErrors.value.title || create.value?.fieldErrors?.title
                    ? "title-error title-count"
                    : "title-count"
                }
                value={title.value}
                onInput$={(_, el) => (title.value = el.value)}
              />
              {(localErrors.value.title ||
                create.value?.fieldErrors?.title) && (
                <p
                  id="title-error"
                  role="alert"
                  class="mt-1 text-xs text-danger"
                >
                  {translate(
                    locale,
                    localErrors.value.title ||
                      (Array.isArray(create.value?.fieldErrors?.title)
                        ? (create.value.fieldErrors.title[0] ?? "")
                        : (create.value?.fieldErrors?.title ?? "")),
                  )}
                </p>
              )}
            </div>

            <div>
              <div class="flex items-baseline justify-between gap-2">
                <label
                  for="summary"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Resumen")}{" "}
                  <span class="text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <CharCounter
                  value={summaryText.value}
                  max={300}
                  id="summary-count"
                />
              </div>
              <p class="mt-0.5 text-xs text-ink-faint">
                {translate(
                  locale,
                  "Una o dos frases. Es lo único que se lee en el listado.",
                )}
              </p>
              <Textarea
                name="summary"
                required
                rows={2}
                maxLength={300}
                class="mt-1.5 min-h-16"
                invalid={
                  !!(
                    localErrors.value.summary ||
                    create.value?.fieldErrors?.summary
                  )
                }
                value={summaryText.value}
                onInput$={(_, el) => (summaryText.value = el.value)}
              />
              {(localErrors.value.summary ||
                create.value?.fieldErrors?.summary) && (
                <p role="alert" class="mt-1 text-xs text-danger">
                  {translate(
                    locale,
                    localErrors.value.summary ||
                      create.value?.fieldErrors?.summary ||
                      "",
                  )}
                </p>
              )}
            </div>

            <Button
              data-requires-script
              type="button"
              class="w-full"
              onClick$={() => goToStep(2)}
            >
              {translate(locale, "Seguir con el plan")}{" "}
              <Icon name="arrow-right" class="text-[1.1em]" />
            </Button>
          </div>

          {/* ------------------------------------------------- Paso 2 · Cómo */}
          <div
            data-native-form-step
            data-wizard-step="2"
            class={cx("space-y-6", step.value !== 2 && "hidden")}
          >
            <h2 data-wizard-heading tabIndex={-1} class="text-lg font-semibold">
              {translate(locale, "Cómo")}
            </h2>
            <div>
              <div class="flex items-baseline justify-between gap-2">
                <label
                  for="plan"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Plan")}{" "}
                  <span class="text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <CharCounter value={plan.value} max={5000} id="plan-count" />
              </div>
              <p class="mt-0.5 text-xs text-ink-faint">
                {translate(
                  locale,
                  "Etapas, quién hace qué y en qué orden. Si algo puede fallar, decilo: da más credibilidad, no menos.",
                )}
              </p>
              <Textarea
                name="plan"
                required
                rows={12}
                maxLength={5000}
                class="mt-1.5"
                invalid={
                  !!(localErrors.value.plan || create.value?.fieldErrors?.plan)
                }
                value={plan.value}
                onInput$={(_, el) => (plan.value = el.value)}
              />
              {(localErrors.value.plan || create.value?.fieldErrors?.plan) && (
                <p role="alert" class="mt-1 text-xs text-danger">
                  {translate(
                    locale,
                    localErrors.value.plan ||
                      create.value?.fieldErrors?.plan ||
                      "",
                  )}
                </p>
              )}
            </div>

            <div data-requires-script class="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick$={() => goToStep(1)}
              >
                {translate(locale, "← Volver")}
              </Button>
              <Button type="button" class="flex-1" onClick$={() => goToStep(3)}>
                {translate(locale, "Seguir con el presupuesto")}{" "}
                <Icon name="arrow-right" class="text-[1.1em]" />
              </Button>
            </div>
          </div>

          {/* ----------------------------------------------- Paso 3 · Cuánto */}
          <div
            data-native-form-step
            data-wizard-step="3"
            class={cx("space-y-6", step.value !== 3 && "hidden")}
          >
            <h2 data-wizard-heading tabIndex={-1} class="text-lg font-semibold">
              {translate(locale, "Cuánto")}
            </h2>
            {/* El aviso va acá, en el paso donde se habla de plata, y no sólo al final. */}
            <div class="rounded-2xl border border-warn-400/40 bg-warn-400/10 px-4 py-3">
              <p class="text-sm font-medium text-warn">
                <span aria-hidden="true">⚠️</span>{" "}
                {translate(locale, PLEDGE_DISCLAIMER)}
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {translate(
                  locale,
                  "El presupuesto es una estimación pública: sirve para mostrar cuánto falta.",
                )}
              </p>
            </div>

            <div class="grid gap-4 sm:grid-cols-3">
              <div class="sm:col-span-2">
                <label
                  for="budget_amount"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Presupuesto")}
                </label>
                <Input
                  name="budget_amount"
                  type="text"
                  inputMode="decimal"
                  class="mt-1.5"
                  placeholder={budgetExample}
                  aria-describedby={`budget-hint${budgetError ? " budget-error" : ""}`}
                  invalid={!!budgetError}
                  value={budget.value}
                  onInput$={(_, el) => {
                    if (!budget.value.trim() || !el.value.trim())
                      budgetLocale.value = locale;
                    budget.value = el.value;
                  }}
                  onBlur$={() => (budgetTouched.value = true)}
                />
                <p id="budget-hint" class="mt-1 text-xs text-ink-faint">
                  {translate(
                    locale,
                    "Opcional. Dejalo vacío si todavía no lo estimaste.",
                  )}{" "}
                  {translate(locale, "Ejemplo: {{example}}.", {
                    example: budgetExample,
                  })}
                </p>
                {parsedBudget.valid && parsedBudget.amount !== null && (
                  <p
                    class="mt-1 text-xs font-medium text-ink-muted"
                    data-budget-preview
                  >
                    {formatMoney(parsedBudget.amount, currency.value, locale)}
                  </p>
                )}
                {budgetError && (
                  <p
                    id="budget-error"
                    role="alert"
                    class="mt-1 text-xs text-danger"
                  >
                    {budgetError}
                  </p>
                )}
              </div>

              <Field label="Moneda" name="currency">
                <Select
                  name="currency"
                  value={currency.value}
                  onChange$={handleCurrencyChange}
                >
                  {CURRENCIES.map((code) => (
                    <option
                      key={code}
                      value={code}
                      selected={currency.value === code}
                    >
                      {code}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field
              label="Recursos necesarios"
              name="resources_needed"
              hint="Opcional. Gente, permisos, materiales, convenios."
            >
              <Textarea
                name="resources_needed"
                value={resourcesNeeded.value}
                onInput$={(_, el) => (resourcesNeeded.value = el.value)}
                rows={3}
                maxLength={1000}
                class="min-h-20"
              />
            </Field>

            <Field
              label="Tiempo estimado"
              name="time_estimate"
              hint="Opcional. Ej: “9 meses”."
            >
              <Input
                name="time_estimate"
                value={timeEstimate.value}
                onInput$={(_, el) => (timeEstimate.value = el.value)}
                maxLength={120}
                placeholder={translate(locale, "9 meses")}
              />
            </Field>

            <div class="flex gap-2 border-t border-subtle pt-5">
              <Button
                data-requires-script
                type="button"
                variant="secondary"
                onClick$={() => goToStep(2)}
              >
                {translate(locale, "← Volver")}
              </Button>
              <SubmitButton
                size="lg"
                class="flex-1"
                pending={create.isRunning || draftStorage.published.value}
              >
                {translate(locale, "Revisar antes de publicar")}
              </SubmitButton>
            </div>
          </div>
        </form>
      </Card>
    </FormShell>
  );
});

export default component$(() => {
  const { community, draftOwnerId, sourceClaim } = useProjectContext().value;
  return (
    <ProjectForm
      key={`${draftOwnerId}:${community.slug}:${sourceClaim?.id ?? ""}`}
    />
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  return {
    title: `${translate(locale, "Nuevo proyecto")} · ${APP_NAME}`,
    meta: [{ name: "robots", content: "noindex" }],
  };
};
