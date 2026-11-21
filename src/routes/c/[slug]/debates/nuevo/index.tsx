import { PublicationError } from "~/components/forms/PublicationError";
import { PublishedNotice } from "~/components/forms/PublishedNotice";
import { $, component$, useSignal } from "@qwik.dev/core";
import { Form, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  CircularCharCounter,
  ConfirmPanel,
  DraftStatusBar,
  FormShell,
} from "~/components/forms/FormShell";
import {
  buttonClass,
  Card,
  EmptyState,
  Input,
  showToast,
  SubmitButton,
  Textarea,
  triggerHapticFeedback,
} from "~/components/ui";
import { routes } from "~/lib/community";
import { draftKey, useDraft } from "~/components/forms/useDraft";
import { postedText } from "~/components/forms/posted-fields";
import { CONTENT_TYPES } from "~/lib/quota";
import {
  APP_NAME,
  CHILD_LEVEL_LABEL,
  MAX_DEBATE_COLUMNS,
} from "~/lib/constants";
import { loadCreateContext, useCreateDebate } from "~/lib/content-actions";
import { formatNumber } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "~/routes/layout";
import { loadDebateColumns } from "~/lib/debate-form";

export const useDebateContext = routeLoader$(async (ev) => {
  const ctx = await loadCreateContext(ev, "debate");

  return { ...ctx, ...(await loadDebateColumns(ev, ctx.community.id)) };
});

const DebateForm = component$(() => {
  const locale = useLocale();
  const ctx = useDebateContext();
  const create = useCreateDebate();

  const {
    community,
    chain,
    summary,
    quota,
    columns,
    childCount,
    columnsFailed,
    draftOwnerId,
  } = ctx.value;
  /**
   * Hay más sub-comunidades que columnas posibles. La consulta ya recortaba
   * en silencio por orden alfabético, así que quien abría el debate no se
   * enteraba de que media provincia se quedaba sin voz hasta verlo publicado.
   */
  const trimmed = childCount > columns.length;
  const title = useSignal(postedText(create.formData, "title"));
  const body = useSignal(postedText(create.formData, "body"));

  /** El planteo de un debate admite 4.000 caracteres. */
  const draft = draftKey("debate", community.slug, draftOwnerId);
  const draftStorage = useDraft(draft, { title, body }, create);

  const discardDraft$ = $(async () => {
    await draftStorage.reset();
    triggerHapticFeedback("selection");
    showToast(translate(locale, "Borrador descartado"), "info");
  });

  const preview =
    create.value &&
    "preview" in create.value &&
    create.value.preview &&
    create.value.preview.community_slug === community.slug &&
    !draftStorage.editing.value
      ? create.value.preview
      : null;
  const childLabel = translate(
    locale,
    CHILD_LEVEL_LABEL[community.level] ?? "Sub-comunidades",
  ).toLocaleLowerCase(locale);

  // Un debate sin sub-comunidades no tendría columnas: es la grilla entera.
  // Se avisa antes de dejar escribir, en vez de fallar al enviar.
  if (columnsFailed || columns.length === 0) {
    return (
      <FormShell
        draftStatus={draftStorage.status.value}
        beforeNavigate$={draftStorage.beforeNavigate}
        type="debate"
        community={community}
        chain={chain}
        summary={summary}
        title={translate(locale, "Nuevo debate")}
        subtitle={translate(
          locale,
          "Los debates se organizan en columnas, una por sub-comunidad.",
        )}
      >
        <EmptyState
          emoji="🚧"
          title={translate(
            locale,
            columnsFailed
              ? "No pudimos cargar las subcomunidades del debate."
              : "{{community}} no tiene {{children}}",
            {
              community: community.name,
              children: childLabel,
            },
          )}
          description={translate(
            locale,
            columnsFailed
              ? "Volvé a intentarlo antes de escribir el debate."
              : "Un debate acá no tendría ninguna columna, así que no se puede crear. Probá en un nivel más general de tu cadena, donde sí haya {{children}}.",
            { children: childLabel },
          )}
        >
          {columnsFailed && (
            <a
              href={routes.newContent(
                community.slug,
                CONTENT_TYPES.debate.newPath,
              )}
              class={buttonClass("secondary", "md")}
            >
              {translate(locale, "Reintentar")}
            </a>
          )}
        </EmptyState>
      </FormShell>
    );
  }

  if (preview) {
    return (
      <FormShell
        draftStatus={draftStorage.status.value}
        beforeNavigate$={draftStorage.beforeNavigate}
        revealOnMount
        type="debate"
        community={community}
        chain={chain}
        summary={summary}
        title={translate(locale, "Confirmá tu debate")}
        subtitle={translate(
          locale,
          "Así lo va a ver el resto. Todavía no se publicó.",
        )}
      >
        <Card class="p-5 sm:p-6">
          <ConfirmPanel
            type="debate"
            communityName={community.name}
            remaining={quota?.remaining ?? null}
          />

          <h2 dir="auto" class="mt-5 text-xl font-semibold tracking-tight">
            {preview.title}
          </h2>
          <p
            dir="auto"
            class="ugc-text mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-muted"
          >
            {preview.body}
          </p>

          <div class="mt-5 rounded-2xl bg-muted p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {translate(locale, "Va a tener {{count}} columnas", {
                count: formatNumber(columns.length, locale),
              })}
            </p>
            {/* La revisión es la última pantalla antes de publicar algo que no
                se edita: si el recorte por tope deja sub-comunidades afuera,
                acá es donde todavía se puede decidir abrirlo en otro nivel. */}
            {trimmed && (
              <p class="mt-1.5 text-xs text-warn">
                <span aria-hidden="true">⚠</span>{" "}
                {translate(
                  locale,
                  "Quedan afuera {{count}} sub-comunidades por el tope de columnas.",
                  {
                    count: formatNumber(childCount - columns.length, locale),
                  },
                )}
              </p>
            )}
            <ul class="mt-2 flex flex-wrap gap-1.5">
              {columns.map((column) => (
                <li
                  key={column.id}
                  class="rounded-xl border border-subtle bg-surface px-2.5 py-1 text-xs text-ink-muted"
                >
                  <span aria-hidden="true">{column.emoji ?? "📍"}</span>{" "}
                  {column.name}
                </li>
              ))}
            </ul>
          </div>

          <Form
            action={create}
            onSubmit$={draftStorage.persist}
            class="mt-6 flex flex-wrap gap-2"
          >
            <input type="hidden" name="community_slug" value={community.slug} />
            <input type="hidden" name="title" value={preview.title} />
            <input type="hidden" name="body" value={preview.body} />
            <input type="hidden" name="confirm" value="si" />
            <SubmitButton
              size="lg"
              pending={create.isRunning || draftStorage.published.value}
            >
              {translate(locale, "Abrir debate")}
            </SubmitButton>
            {/* La revisión es estado de la acción, no otra entrada del historial. */}
            <a
              data-requires-script
              href={routes.newContent(
                community.slug,
                CONTENT_TYPES["debate"].newPath,
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
      type="debate"
      community={community}
      chain={chain}
      summary={summary}
      title={translate(locale, "Nuevo debate")}
      subtitle={translate(
        locale,
        "Una pregunta abierta rinde más que una afirmación cerrada.",
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
            hasContent={!!(title.value || body.value)}
            onDiscard$={discardDraft$}
            restored={draftStorage.restored.value}
          />

          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="title"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Pregunta o tema")}{" "}
                <span class="text-danger" aria-hidden="true">
                  *
                </span>
              </label>
              <CircularCharCounter
                value={title.value}
                max={200}
                id="title-count"
              />
            </div>
            <Input
              name="title"
              required
              maxLength={200}
              class="mt-1.5"
              placeholder={translate(
                locale,
                "¿Cómo conectamos de verdad al país?",
              )}
              invalid={!!create.value?.fieldErrors?.title}
              aria-describedby={
                create.value?.fieldErrors?.title
                  ? "title-error title-count"
                  : "title-count"
              }
              value={title.value}
              onInput$={(_, el) => (title.value = el.value)}
            />
            {create.value?.fieldErrors?.title && (
              <p id="title-error" role="alert" class="mt-1 text-xs text-danger">
                {translate(locale, create.value.fieldErrors.title)}
              </p>
            )}
          </div>

          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="body"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Planteo")}{" "}
                <span class="text-danger" aria-hidden="true">
                  *
                </span>
              </label>
              <CircularCharCounter
                value={body.value}
                max={4000}
                id="body-count"
              />
            </div>
            <Textarea
              name="body"
              required
              rows={8}
              maxLength={4000}
              class="mt-1.5"
              placeholder={translate(
                locale,
                "Poné el contexto y decí qué te gustaría escuchar desde cada sub-comunidad.",
              )}
              invalid={!!create.value?.fieldErrors?.body}
              value={body.value}
              onInput$={(_, el) => (body.value = el.value)}
            />
            {create.value?.fieldErrors?.body && (
              <p role="alert" class="mt-1 text-xs text-danger">
                {translate(locale, create.value.fieldErrors.body)}
              </p>
            )}
          </div>

          {/* Vista previa de la grilla: qué columnas va a tener. */}
          <div class="rounded-2xl bg-muted p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {translate(locale, "Columnas del debate")} ·{" "}
              {formatNumber(columns.length, locale)}
            </p>
            <p class="mt-1 text-xs text-ink-muted">
              {translate(
                locale,
                "Una por cada sub-comunidad de {{community}}. Cada persona escribe sólo en la columna donde vive.",
                { community: community.name },
              )}
            </p>
            {trimmed && (
              <p class="mt-2 flex items-start gap-1.5 rounded-xl bg-warn-400/10 px-3 py-2 text-xs text-warn">
                <span aria-hidden="true">⚠</span>
                {translate(
                  locale,
                  "{{community}} tiene {{total}} sub-comunidades y un debate admite hasta {{max}} columnas: van a entrar las primeras {{max}} por orden alfabético.",
                  {
                    community: community.name,
                    total: formatNumber(childCount, locale),
                    max: formatNumber(MAX_DEBATE_COLUMNS, locale),
                  },
                )}
              </p>
            )}
            <ul class="mt-2.5 flex flex-wrap gap-1.5">
              {columns.slice(0, 30).map((column) => (
                <li
                  key={column.id}
                  class="rounded-xl border border-subtle bg-surface px-2.5 py-1 text-xs text-ink-muted"
                >
                  <span aria-hidden="true">{column.emoji ?? "📍"}</span>{" "}
                  {column.name}
                </li>
              ))}
              {columns.length > 30 && (
                <li class="px-2.5 py-1 text-xs text-ink-faint">
                  {translate(locale, "y {{count}} más", {
                    count: formatNumber(columns.length - 30, locale),
                  })}
                </li>
              )}
            </ul>
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
  const { community, draftOwnerId } = useDebateContext().value;
  return <DebateForm key={`${draftOwnerId}:${community.slug}`} />;
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Nuevo debate")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
