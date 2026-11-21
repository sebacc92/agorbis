import { component$ } from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import { Alert, Badge, ButtonLink, Card, SubmitButton } from "~/components/ui";
import type { AiSummaryView } from "~/lib/ai-summary";
import { useGenerateAiSummary } from "~/lib/ai-summary-actions";
import type { ContentType } from "~/lib/database.types.helpers";
import { formatDate } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";

const CONTENT_PATH: Record<ContentType, string> = {
  poll: "encuestas",
  debate: "debates",
  claim: "reclamos",
  project: "proyectos",
};

export const AiSummaryCard = component$<{
  summary: AiSummaryView | null;
  /** Falso mientras OpenAI quede fuera del lanzamiento (`.env.example`). */
  enabled: boolean;
  contentType: ContentType;
  contentId: string;
  isAuthenticated: boolean;
}>(({ summary, enabled, contentType, contentId, isAuthenticated }) => {
  const locale = useLocale();
  const generate = useGenerateAiSummary();
  const actionValue = generate.value;
  const actionForThisContent =
    actionValue &&
    "contentType" in actionValue &&
    actionValue.contentType === contentType &&
    actionValue.contentId === contentId &&
    actionValue.locale === locale
      ? actionValue
      : null;
  const generatedSummary =
    actionForThisContent?.state === "ready"
      ? actionForThisContent.summary
      : null;
  const currentSummary = generatedSummary ?? summary;
  const message =
    actionForThisContent && "message" in actionForThisContent
      ? actionForThisContent.message
      : null;
  const signInPath = `/ingresar?next=${encodeURIComponent(
    `/${CONTENT_PATH[contentType]}/${contentId}`,
  )}`;

  // Sin generación configurada no hay nada que ofrecer: un botón "Generar
  // resumen" que termina en "no está configurada" es una promesa vacía (D74).
  // Un resumen ya generado se sigue mostrando.
  if (!enabled && !currentSummary) return null;

  return (
    <Card
      as="section"
      class="animate-fade-in border-brand-500/30 bg-brand-50/40 p-5 shadow-xs transition-all duration-200 hover:shadow-soft dark:bg-brand-950/20"
    >
      <div class="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" class="text-base">
          ✨
        </span>
        <h2 class="font-semibold text-ink-strong">
          {translate(locale, "Resumen de IA")}
        </h2>
        {currentSummary && (
          <Badge tone="brand">{translate(locale, "Generado por IA")}</Badge>
        )}
      </div>

      {currentSummary ? (
        <>
          <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
            {currentSummary.summary}
          </p>
          {currentSummary.keyPoints.length > 0 && (
            <ul class="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted marker:text-brand">
              {currentSummary.keyPoints.map((point, index) => (
                <li key={`${index}-${point.slice(0, 24)}`}>{point}</li>
              ))}
            </ul>
          )}
          <p class="mt-3 text-xs text-ink-faint tabular-nums">
            {translate(
              locale,
              "Síntesis automática en el idioma seleccionado · actualizada el {{date}}",
              {
                date: formatDate(currentSummary.generatedAt, locale),
              },
            )}
          </p>
          <p class="mt-2 text-xs text-ink-faint">
            {translate(
              locale,
              "Puede contener errores; verificá las fuentes y el contenido original.",
            )}
          </p>
        </>
      ) : (
        <div class="mt-3">
          <p class="text-sm text-ink-muted">
            {translate(
              locale,
              "Todavía no hay un resumen en el idioma seleccionado.",
            )}
          </p>
          <p class="mt-1 text-xs text-ink-faint">
            {translate(
              locale,
              "Se genera bajo demanda a partir del contenido visible, sin reemplazar el texto ciudadano.",
            )}
          </p>

          {message && <Alert class="mt-3">{translate(locale, message)}</Alert>}

          {!enabled ? null : isAuthenticated ? (
            <Form action={generate} class="mt-4">
              <input type="hidden" name="content_type" value={contentType} />
              <input type="hidden" name="content_id" value={contentId} />
              <SubmitButton
                size="sm"
                pending={generate.isRunning}
                class="active:scale-95 touch-manipulation cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
              >
                {translate(locale, "Generar resumen")}
              </SubmitButton>
            </Form>
          ) : (
            <ButtonLink
              href={signInPath}
              size="sm"
              class="mt-4 active:scale-95 touch-manipulation cursor-pointer transition-all duration-150 hover:-translate-y-0.5"
            >
              {translate(locale, "Ingresar para generar el resumen")}
            </ButtonLink>
          )}
        </div>
      )}
    </Card>
  );
});
