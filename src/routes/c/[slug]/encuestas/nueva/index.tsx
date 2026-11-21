import { PublicationError } from "~/components/forms/PublicationError";
import { PublishedNotice } from "~/components/forms/PublishedNotice";
import { showToast } from "~/components/ui/Toast";
import { $, component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Form, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  DraftStatusBar,
  CharCounter,
  ConfirmPanel,
  FormShell,
} from "~/components/forms/FormShell";
import {
  buttonClass,
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Select,
  SubmitButton,
  Textarea,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { routes } from "~/lib/community";
import {
  CATEGORY_CHOICE,
  CATEGORY_CHOICE_CHECK,
  CATEGORY_CHOICE_OFF,
  CATEGORY_CHOICE_ON,
} from "~/components/forms/category-choice";
import { draftKey, useDraft } from "~/components/forms/useDraft";
import { postedText, postedTexts } from "~/components/forms/posted-fields";
import { CONTENT_TYPES } from "~/lib/quota";
import {
  APP_NAME,
  POLL_CATEGORIES,
  POLL_CATEGORY_BY_KEY,
  POLL_TYPE_LABEL,
} from "~/lib/constants";
import { loadCreateContext, useCreatePoll } from "~/lib/content-actions";
import { formatInstant, formatNumber } from "~/lib/format";
import type { PollCategory } from "~/lib/database.types.helpers";
import { useLocale, translate } from "~/lib/i18n";
import { MAX_POLL_OPTIONS } from "~/lib/constants";
import { focusWhenRendered } from "~/lib/focus-when-rendered";
import { useLocaleLoader } from "~/routes/layout";
import { timeZoneOf } from "~/lib/timezone";
import {
  publicationDateTime,
  publicationTimeZones,
} from "~/lib/publication-time";
import { changePollOptionMode } from "~/components/forms/poll-options";

const MAX_OPTIONS = MAX_POLL_OPTIONS;

const dateInDays = (days: number, zone: string) =>
  publicationDateTime(new Date(Date.now() + days * 86400_000), zone);

/**
 * Presets de cierre: casi nadie quiere elegir una fecha exacta.
 *
 * `id` está separado de `days` porque "sin límite" no tiene días, y usar el
 * valor como clave de render daba una clave vacía. Qwik trata una clave falsy
 * como "sin clave" y agrega un nodo nuevo en cada re-render en vez de
 * reutilizar el existente: por eso se multiplicaban los chips.
 */
const CLOSE_PRESETS = [
  { id: "1-semana", label: "1 semana", days: 7 },
  { id: "1-mes", label: "1 mes", days: 30 },
  { id: "3-meses", label: "3 meses", days: 90 },
] as const;

const TYPE_OPTIONS = [
  {
    value: "single",
    title: "Una sola respuesta",
    hint: "Cada persona elige una opción de la lista.",
  },
  {
    value: "multiple",
    title: "Varias respuestas",
    hint: "Se pueden marcar varias opciones a la vez.",
  },
  {
    value: "binary",
    title: "Sí o no",
    hint: "Dos botones grandes. Ideal para una postura, sin grises.",
  },
] as const;

/**
 * Cómo se responde cada tipo, dibujado con formas del sistema: un círculo
 * elegido entre tres, dos casillas marcadas de tres, o un sí y un no. Antes
 * eran glifos tipográficos y emojis, que cada sistema dibuja distinto y no
 * toman el color del texto (D123).
 */
const PollTypeMarks = component$<{ type: "single" | "multiple" | "binary" }>(
  ({ type }) => {
    if (type === "binary") {
      return (
        <>
          <span class="grid size-5 place-items-center rounded-md border-2 border-current text-xs text-ink-faint">
            <Icon name="check" />
          </span>
          <span class="grid size-5 place-items-center rounded-md border-2 border-current text-xs text-ink-faint">
            <Icon name="x" />
          </span>
        </>
      );
    }
    const chosen =
      type === "single" ? [true, false, false] : [true, true, false];
    return (
      <>
        {chosen.map((on, i) => (
          <span
            key={`mark-${i}`}
            class={cx(
              "grid size-4 place-items-center border-2 border-current text-ink-faint",
              type === "single" ? "rounded-full" : "rounded-sm",
            )}
          >
            {on && (
              <span
                class={cx(
                  "block size-2 bg-current",
                  type === "single" ? "rounded-full" : "rounded-[1px]",
                )}
              />
            )}
          </span>
        ))}
      </>
    );
  },
);

export const usePollContext = routeLoader$(async (ev) => {
  const context = await loadCreateContext(ev, "poll");
  const defaultTimeZone = timeZoneOf(ev);
  return {
    ...context,
    defaultTimeZone,
    timeZones: publicationTimeZones(defaultTimeZone),
  };
});

const PollForm = component$(() => {
  const locale = useLocale();
  const ctx = usePollContext();
  const create = useCreatePoll();

  const { community, chain, summary, quota, draftOwnerId } = ctx.value;

  const type = useSignal(
    TYPE_OPTIONS.find(
      (option) => option.value === postedText(create.formData, "type"),
    )?.value ?? "single",
  );
  const category = useSignal<PollCategory>(
    POLL_CATEGORIES.find(
      (option) => option.key === postedText(create.formData, "category"),
    )?.key ?? "comunidad",
  );

  // Las etiquetas son estado explícito y no valores del DOM. Con inputs no
  // controlados, al pasar a "binaria" se escribían "Sí"/"No" y al volver a otro
  // tipo quedaban pegados: `value={undefined}` no limpia un input que ya tiene
  // contenido. Acá el cambio de tipo reescribe la lista de forma deliberada.
  const postedOptions = postedTexts(create.formData, "options[]", ["", "", ""]);
  while (postedOptions.length < 3) postedOptions.push("");
  const options = useSignal(postedOptions);
  // Recuerda si "Sí"/"No" los puso el formulario o los tipeó la persona, para
  // no borrarle algo que escribió.
  const binaryPrefilled = useSignal(false);
  const listOptions = useSignal<string[]>([]);
  const binaryOptions = useSignal<string[]>([]);
  const question = useSignal(postedText(create.formData, "question"));
  const description = useSignal(postedText(create.formData, "description"));
  /**
   * El tope de selección pasa a ser estado y no un input suelto porque depende
   * de otro campo: quien ponía "hasta 5" y después borraba opciones hasta
   * quedarse con tres enviaba un formulario que el servidor rechazaba entero
   * ("el máximo no puede superar la cantidad de opciones"), perdiendo el paso
   * de confirmación. Ahora el número se recorta solo al quitar opciones.
   */
  const maxChoices = useSignal(postedText(create.formData, "max_choices"));

  const closePreset = useSignal(
    postedText(
      create.formData,
      "close_preset",
      create.formData ? "custom" : "1-mes",
    ),
  );
  // La fecha efectiva vive en un signal —igual que las opciones (D46)— para que
  // elegir un chip y escribir una fecha exacta no compitan por el mismo input.
  const timeZone = useSignal(
    postedText(create.formData, "time_zone", ctx.value.defaultTimeZone),
  );
  const closesAt = useSignal(
    postedText(create.formData, "closes_at", dateInDays(30, timeZone.value)),
  );

  /**
   * Piso del selector de fecha exacta: una encuesta que cierra ayer la rechaza
   * el servidor recién al enviar el formulario entero. Arranca vacío a
   * propósito, por el mismo motivo de reloj que se explica abajo: un `min`
   * calculado en UTC le bloquearía a alguien en Buenos Aires las próximas tres
   * horas, que son perfectamente elegibles.
   */
  const minClosesAt = useSignal("");

  const draft = draftKey("poll", community.slug, draftOwnerId);
  const draftStorage = useDraft(
    draft,
    {
      question,
      description,
      options,
      type,
      category,
      binaryPrefilled,
      listOptions,
      binaryOptions,
      timeZone,
      maxChoices,
      closePreset,
      closesAt,
    },
    create,
  );

  const discardDraft$ = $(async () => {
    await draftStorage.reset();
    triggerHapticFeedback("selection");
    showToast(translate(locale, "Borrador descartado"), "info");
  });

  // El servidor ya conoce la zona explícita. Sólo se actualiza el mínimo
  // contra el reloj actual; no se sustituye por la zona del navegador.
  // eslint-disable-next-line qwik/no-use-visible-task -- refresca el mínimo con el reloj actual al cambiar la zona
  useVisibleTask$(({ track }) => {
    const selectedZone = track(() => timeZone.value);
    minClosesAt.value = dateInDays(0, selectedZone);
  });

  const preview =
    create.value &&
    "preview" in create.value &&
    create.value.preview &&
    create.value.preview.community_slug === community.slug &&
    !draftStorage.editing.value
      ? create.value.preview
      : null;
  const visibleOptions = type.value === "binary" ? 2 : options.value.length;
  const binaryYes = translate(locale, "Sí");
  const binaryNo = translate(locale, "No");

  const changeType = $((next: "single" | "multiple" | "binary") => {
    const changed = changePollOptionMode(
      type.value,
      next,
      options.value,
      listOptions.value,
      binaryOptions.value,
      [binaryYes, binaryNo],
    );
    options.value = changed.options;
    listOptions.value = changed.listOptions;
    binaryOptions.value = changed.binaryOptions;
    type.value = next;
  });

  /**
   * Reescribe la lista de opciones y mantiene coherente lo que depende de ella.
   * Todos los caminos que cambian la cantidad —agregar, quitar la última,
   * quitar una del medio— pasan por acá para que el tope no quede apuntando a
   * una opción que ya no existe.
   */
  const setOptions = $((next: string[]) => {
    options.value = next;
    const limit = Number(maxChoices.value);
    if (Number.isFinite(limit) && limit > next.length) {
      maxChoices.value = String(next.length);
    }
  });

  /**
   * Opciones repetidas. El servidor ya las rechaza, pero recién después de
   * enviar: escribir "Colectivos" dos veces en una lista de ocho es fácil y
   * enterarse al final cuesta todo el formulario. Se compara sin acentos ni
   * mayúsculas porque "Salud" y "salud " son la misma opción para quien vota.
   */
  const normalized = options.value.slice(0, visibleOptions).map((label) =>
    label
      .trim()
      .toLocaleLowerCase(locale)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, ""),
  );
  const duplicated = normalized.some(
    (label, i) => label !== "" && normalized.indexOf(label) !== i,
  );

  const pickPreset = $((preset: (typeof CLOSE_PRESETS)[number]) => {
    closePreset.value = preset.id;
    closesAt.value = dateInDays(preset.days, timeZone.value);
  });

  // ---------------------------------------------------------------- Confirmación
  if (preview) {
    const opts = Array.isArray(preview.options)
      ? preview.options
      : [preview.options];
    return (
      <FormShell
        draftStatus={draftStorage.status.value}
        beforeNavigate$={draftStorage.beforeNavigate}
        revealOnMount
        type="poll"
        community={community}
        chain={chain}
        summary={summary}
        title={translate(locale, "Confirmá tu encuesta")}
        subtitle={translate(
          locale,
          "Así la va a ver el resto. Todavía no se publicó.",
        )}
      >
        <Card class="p-5 sm:p-6">
          <ConfirmPanel
            type="poll"
            communityName={community.name}
            remaining={quota?.remaining ?? null}
          />

          <div class="mt-5">
            <Badge tone="brand">
              {translate(locale, POLL_TYPE_LABEL[preview.type])}
            </Badge>
            <Badge tone="neutral">
              <Icon name={POLL_CATEGORY_BY_KEY[preview.category].icon} />
              {translate(locale, POLL_CATEGORY_BY_KEY[preview.category].label)}
            </Badge>
            <h2 dir="auto" class="mt-2 text-xl font-semibold tracking-tight">
              {preview.question}
            </h2>
            {preview.description && (
              <p
                dir="auto"
                class="ugc-text mt-2 whitespace-pre-line text-sm text-ink-muted"
              >
                {preview.description}
              </p>
            )}

            <ul class="mt-4 space-y-2">
              {opts.map((label, i) => (
                <li
                  key={`preview-${i}`}
                  dir="auto"
                  class="flex items-center gap-3 rounded-2xl border border-subtle bg-muted/50 px-4 py-2.5 text-sm"
                >
                  <span aria-hidden="true" class="text-ink-faint">
                    {preview.type === "binary" ? (
                      <Icon name={i === 0 ? "check" : "x"} />
                    ) : (
                      <span
                        class={cx(
                          "block size-3.5 border-2 border-current",
                          preview.type === "multiple"
                            ? "rounded-sm"
                            : "rounded-full",
                        )}
                      />
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ul>

            <p class="mt-4 text-xs text-ink-faint">
              {translate(locale, "Cierra el {{date}}", {
                date: `${formatInstant(preview.closes_at_utc, locale, preview.time_zone)} · ${preview.time_zone}`,
              })}
              {" · "}
              {translate(
                locale,
                "Resultados al cierre con un mínimo de 5 participantes",
              )}
              {/* El tope de selección se decide arriba y no aparecía en la
                  revisión, que es la única pantalla donde se repasa todo junto
                  antes de publicar algo que ya no se puede editar. */}
              {preview.type === "multiple" && preview.max_choices && (
                <>
                  {" · "}
                  {translate(locale, "Hasta {{count}} opciones", {
                    count: formatNumber(Number(preview.max_choices), locale),
                  })}
                </>
              )}
            </p>
          </div>

          {/* Se reenvía todo con `confirm=si`. Sin JS funciona igual. */}
          <Form
            action={create}
            onSubmit$={draftStorage.persist}
            class="mt-6 flex flex-wrap gap-2"
          >
            <input type="hidden" name="community_slug" value={community.slug} />
            <input type="hidden" name="question" value={preview.question} />
            <input
              type="hidden"
              name="description"
              value={preview.description ?? ""}
            />
            <input type="hidden" name="type" value={preview.type} />
            <input type="hidden" name="category" value={preview.category} />
            <input
              type="hidden"
              name="results_visibility"
              value="after_close"
            />
            <input
              type="hidden"
              name="closes_at"
              value={preview.closes_at ?? ""}
            />
            <input type="hidden" name="time_zone" value={preview.time_zone} />
            <input
              type="hidden"
              name="max_choices"
              value={preview.max_choices ?? ""}
            />
            {opts.map((label, i) => (
              <input
                key={`h-${i}`}
                type="hidden"
                name="options[]"
                value={label}
              />
            ))}
            <input type="hidden" name="confirm" value="si" />
            <SubmitButton
              size="lg"
              pending={create.isRunning || draftStorage.published.value}
            >
              {translate(locale, "Publicar encuesta")}
            </SubmitButton>
            {/* La revisión es estado de la acción, no otra entrada del historial. */}
            <a
              data-requires-script
              href={routes.newContent(
                community.slug,
                CONTENT_TYPES["poll"].newPath,
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

  // --------------------------------------------------------------------- Edición
  return (
    <FormShell
      draftStatus={draftStorage.status.value}
      beforeNavigate$={draftStorage.beforeNavigate}
      revealOnMount={draftStorage.editing.value}
      type="poll"
      community={community}
      chain={chain}
      summary={summary}
      title={translate(locale, "Nueva encuesta")}
      numbered
      subtitle={translate(
        locale,
        "Una buena pregunta es específica y no admite dos lecturas.",
      )}
    >
      <Card class="p-5 sm:p-6">
        <Form
          data-native-form
          action={create}
          onSubmit$={draftStorage.persist}
          class="space-y-6"
        >
          <input type="hidden" name="community_slug" value={community.slug} />

          <PublicationError value={create.value} />
          <PublishedNotice href={draftStorage.publishedTo.value} />

          <DraftStatusBar
            status={draftStorage.status.value}
            hasContent={!!(question.value || description.value)}
            onDiscard$={discardDraft$}
            restored={draftStorage.restored.value}
          />

          {/* ------------------------------------------------------- Pregunta */}
          {/* `data-form-section`: Pregunta y Contexto no son `fieldset`, y sin
              la marca la numeración de D124 arrancaba en Categoría. */}
          <div data-form-section>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="question"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Pregunta")}{" "}
                <span class="text-danger" aria-hidden="true">
                  *
                </span>
              </label>
              <CharCounter
                value={question.value}
                max={300}
                id="question-count"
              />
            </div>
            <Input
              name="question"
              required
              maxLength={300}
              class="mt-1.5"
              placeholder={translate(
                locale,
                "¿Cuál debería ser la prioridad de la inversión pública en 2026?",
              )}
              invalid={!!create.value?.fieldErrors?.question}
              aria-describedby={
                create.value?.fieldErrors?.question
                  ? "question-error question-count"
                  : "question-count"
              }
              value={question.value}
              onInput$={(_, el) => (question.value = el.value)}
            />
            {create.value?.fieldErrors?.question && (
              <p
                id="question-error"
                role="alert"
                class="mt-1 text-xs text-danger"
              >
                {translate(locale, create.value.fieldErrors.question)}
              </p>
            )}
          </div>

          {/* -------------------------------------------------------- Contexto */}
          <div data-form-section>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="description"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Contexto")}
              </label>
              <CharCounter
                value={description.value}
                max={1000}
                id="description-count"
              />
            </div>
            <Textarea
              name="description"
              rows={3}
              maxLength={1000}
              class="mt-1.5 min-h-20"
              placeholder={translate(
                locale,
                "Aclará supuestos, o qué significa cada opción.",
              )}
              value={description.value}
              onInput$={(_, el) => (description.value = el.value)}
            />
          </div>

          <fieldset>
            <legend class="mb-1 text-sm font-medium text-ink-strong">
              {translate(locale, "Categoría")}
            </legend>
            <p class="mb-2 text-xs text-ink-muted">
              {translate(
                locale,
                "Ayuda a encontrar la encuesta sin cambiar a qué comunidad pertenece.",
              )}
            </p>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {POLL_CATEGORIES.map((option) => (
                <label
                  key={option.key}
                  class={cx(
                    CATEGORY_CHOICE,
                    category.value === option.key
                      ? CATEGORY_CHOICE_ON
                      : CATEGORY_CHOICE_OFF,
                  )}
                >
                  <input
                    type="radio"
                    name="category"
                    value={option.key}
                    checked={category.value === option.key}
                    class="sr-only"
                    onChange$={() => (category.value = option.key)}
                  />
                  {/* Ícono propio de la categoría en vez del emoji (D125). */}
                  <span aria-hidden="true" class="relative shrink-0">
                    <Icon name={option.icon} class="text-base" />
                    {category.value === option.key && (
                      <span data-requires-script class={CATEGORY_CHOICE_CHECK}>
                        <Icon name="check" stroke={2.5} />
                      </span>
                    )}
                  </span>
                  {translate(locale, option.label)}
                </label>
              ))}
            </div>
          </fieldset>

          {/* ------------------------------------------------------------ Tipo */}
          <fieldset>
            <legend class="mb-2 text-sm font-medium text-ink-strong">
              {translate(locale, "Tipo de encuesta")}
            </legend>
            <div class="grid gap-2 sm:grid-cols-3">
              {TYPE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  class={cx(
                    "choice-control relative cursor-pointer rounded-2xl border p-3.5 transition-colors",
                    type.value === option.value
                      ? "border-brand-600 bg-brand-50 dark:bg-brand-950/50"
                      : "border-subtle hover:border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="type"
                    value={option.value}
                    checked={type.value === option.value}
                    class="sr-only"
                    onChange$={() => changeType(option.value)}
                  />
                  {type.value === option.value && (
                    <span
                      data-requires-script
                      aria-hidden="true"
                      class="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-brand-700 text-xs text-white shadow-sm"
                    >
                      <Icon name="check" stroke={2.5} />
                    </span>
                  )}
                  <span
                    class="flex items-center gap-1.5 text-lg"
                    aria-hidden="true"
                  >
                    <PollTypeMarks type={option.value} />
                  </span>
                  <span class="mt-2 block text-sm font-medium text-ink-strong">
                    {translate(locale, option.title)}
                  </span>
                  <span class="mt-0.5 block text-xs text-ink-muted">
                    {translate(locale, option.hint)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <p data-requires-script class="text-xs text-ink-muted">
            {translate(
              locale,
              "Las opciones que escribiste se conservan al cambiar de tipo.",
            )}
          </p>
          {/* -------------------------------------------------------- Opciones */}
          <fieldset class="space-y-2">
            <legend class="mb-1 text-sm font-medium text-ink-strong">
              {translate(locale, "Opciones")}
              {type.value === "binary" && (
                <span class="ml-1 font-normal text-ink-faint">
                  {translate(locale, "(exactamente dos)")}
                </span>
              )}
            </legend>

            {options.value.map((label, i) => (
              <div
                data-native-form-step
                key={`opcion-${i}`}
                class={cx(
                  "flex items-center gap-2",
                  i >= visibleOptions && "hidden",
                )}
              >
                <span
                  aria-hidden="true"
                  class="w-5 shrink-0 text-center text-xs tabular-nums text-ink-faint"
                >
                  {formatNumber(i + 1, locale)}
                </span>
                <Input
                  name="options[]"
                  id={`opcion-${i}`}
                  required={i < 2}
                  maxLength={120}
                  aria-label={translate(locale, "Opción {{number}}", {
                    number: formatNumber(i + 1, locale),
                  })}
                  class="flex-1"
                  value={label}
                  onInput$={(_, el) => {
                    const next = [...options.value];
                    next[i] = el.value;
                    options.value = next;
                    // Si la persona edita una sugerencia, deja de ser nuestra.
                    if (i < 2) binaryPrefilled.value = false;
                  }}
                  placeholder={
                    type.value === "binary"
                      ? i === 0
                        ? translate(locale, "Sí, estoy de acuerdo")
                        : translate(locale, "No, no estoy de acuerdo")
                      : translate(locale, "Opción {{number}}", {
                          number: formatNumber(i + 1, locale),
                        })
                  }
                />
                {/* Sólo se podía "quitar la última". Para sacar la segunda de
                    seis había que copiar hacia arriba el texto de las cuatro
                    siguientes y recién entonces borrar el final. */}
                {type.value !== "binary" && options.value.length > 2 && (
                  <Button
                    data-requires-script
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={translate(
                      locale,
                      "Quitar la opción {{number}}",
                      {
                        number: formatNumber(i + 1, locale),
                      },
                    )}
                    onClick$={() =>
                      setOptions(options.value.filter((_, at) => at !== i))
                    }
                  >
                    <span aria-hidden="true">✕</span>
                  </Button>
                )}
              </div>
            ))}

            {/* Vive fuera de la lista y no junto a un campo concreto: la
                repetición es una propiedad del conjunto, no de una fila. */}
            {duplicated && (
              <p
                aria-live="polite"
                class="flex items-start gap-1.5 text-xs text-warn"
              >
                <span aria-hidden="true">⚠</span>
                {translate(
                  locale,
                  "Hay dos opciones iguales. Quien vota no va a poder distinguirlas.",
                )}
              </p>
            )}

            {type.value !== "binary" && (
              <div data-requires-script class="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={options.value.length >= MAX_OPTIONS}
                  onClick$={async () => {
                    if (options.value.length >= MAX_OPTIONS) return;
                    const index = options.value.length;
                    await setOptions([...options.value, ""]);
                    // El campo recién creado todavía no existe en el DOM en
                    // este tick, y puede tardar más de un frame si hay que
                    // bajar el chunk del componente. Sin esto había que ir a
                    // buscarlo con el mouse después de cada "Agregar opción",
                    // que es exactamente el botón que se toca varias veces.
                    focusWhenRendered(() =>
                      document.getElementById(`opcion-${index}`),
                    );
                  }}
                >
                  + {translate(locale, "Agregar opción")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={options.value.length <= 2}
                  onClick$={() => {
                    if (options.value.length > 2)
                      setOptions(options.value.slice(0, -1));
                  }}
                >
                  − {translate(locale, "Quitar la última")}
                </Button>
                <span class="self-center text-xs text-ink-faint">
                  {translate(locale, "{{visible}} de {{total}}", {
                    visible: formatNumber(visibleOptions, locale),
                    total: formatNumber(MAX_OPTIONS, locale),
                  })}
                </span>
              </div>
            )}
          </fieldset>

          <div data-without-script>
            <p class="text-xs text-ink-muted">
              {translate(
                locale,
                "Sin JavaScript podés cargar hasta 3 opciones. Para una encuesta de sí o no, completá sólo dos.",
              )}
            </p>
          </div>

          {/* Máximo de selecciones, sólo para múltiple */}
          <div
            data-native-poll-limit
            class={type.value !== "multiple" ? "hidden" : undefined}
          >
            <Field
              label={translate(
                locale,
                "Máximo de opciones que se pueden elegir",
              )}
              name="max_choices"
              hint={translate(locale, "Opcional. Vacío = sin tope.")}
            >
              <Input
                name="max_choices"
                type="text"
                inputMode="numeric"
                value={maxChoices.value}
                onInput$={(_, el) => (maxChoices.value = el.value)}
                placeholder={translate(locale, "Hasta {{count}}", {
                  count: formatNumber(visibleOptions, locale),
                })}
              />
            </Field>
          </div>

          {/* ----------------------------------------------------------- Cierre */}
          <fieldset>
            <legend class="mb-2 text-sm font-medium text-ink-strong">
              {translate(locale, "Fecha de cierre")}
            </legend>
            <div data-requires-script class="flex flex-wrap gap-2">
              {CLOSE_PRESETS.map((preset) => (
                <label
                  key={preset.id}
                  class={cx(
                    "choice-control inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-2xl border px-3.5 text-sm transition-colors",
                    closePreset.value === preset.id
                      ? "border-brand-600 bg-brand-50 font-medium text-brand dark:bg-brand-950/50"
                      : "border-subtle text-ink-muted hover:border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="close_preset"
                    value={preset.id}
                    checked={closePreset.value === preset.id}
                    class="sr-only"
                    onChange$={() => pickPreset(preset)}
                  />
                  <span
                    aria-hidden="true"
                    class={cx(
                      "grid w-3 place-items-center",
                      closePreset.value === preset.id ? "visible" : "invisible",
                    )}
                  >
                    <Icon name="check" stroke={2.5} class="text-xs" />
                  </span>
                  {translate(locale, preset.label)}
                </label>
              ))}
            </div>

            <div class="mt-3">
              <label for="time_zone" class="block text-xs text-ink-muted">
                {translate(locale, "Zona horaria del cierre")}
              </label>
              <Select
                name="time_zone"
                value={timeZone.value}
                aria-describedby="poll-time-zone-help"
                class="mt-1"
                onChange$={(_, el) => {
                  timeZone.value = el.value;
                  const preset = CLOSE_PRESETS.find(
                    (item) => item.id === closePreset.value,
                  );
                  if (preset)
                    closesAt.value = dateInDays(preset.days, el.value);
                }}
              >
                {ctx.value.timeZones.map((zone) => (
                  <option
                    key={zone}
                    value={zone}
                    selected={timeZone.value === zone}
                  >
                    {zone.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              <p id="poll-time-zone-help" class="mt-1 text-xs text-ink-muted">
                {translate(
                  locale,
                  "La fecha y la hora se interpretan en esta zona. Podés cambiarla antes de publicar.",
                )}
              </p>
            </div>
            <div class="mt-3">
              <label for="closes_at" class="block text-xs text-ink-muted">
                {translate(locale, "O una fecha exacta")}
              </label>
              <Input
                name="closes_at"
                type="datetime-local"
                class="mt-1"
                min={minClosesAt.value || undefined}
                value={closesAt.value}
                onInput$={(_, el) => {
                  closesAt.value = el.value;
                  closePreset.value = el.value ? "custom" : "";
                }}
              />
            </div>
          </fieldset>

          {/* ------------------------------------------------------ Visibilidad */}
          <div class="rounded-2xl border border-subtle bg-muted/40 p-4">
            <input
              type="hidden"
              name="results_visibility"
              value="after_close"
            />
            <p class="text-sm font-medium text-ink-strong">
              {translate(locale, "Cuándo se ven los resultados")}
            </p>
            <p class="mt-1 text-xs text-ink-muted">
              {translate(
                locale,
                "Se publican sólo al cerrar y si participaron al menos 5 personas. Así una variación del recuento no revela qué acaba de elegir alguien.",
              )}
            </p>
          </div>

          <div class="border-t border-subtle pt-5">
            <SubmitButton
              size="lg"
              class="w-full"
              pending={create.isRunning || draftStorage.published.value}
            >
              {translate(locale, "Revisar antes de publicar")}
            </SubmitButton>
          </div>
        </Form>
      </Card>
    </FormShell>
  );
});

export default component$(() => {
  const { community, draftOwnerId } = usePollContext().value;
  return <PollForm key={`${draftOwnerId}:${community.slug}`} />;
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Nueva encuesta")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
