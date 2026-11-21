import { component$, Slot } from "@qwik.dev/core";
import { CreateButton } from "./CreateButton";
import { EmptyState } from "~/components/ui";
import type { ContentType } from "~/lib/database.types.helpers";
import type { QuotaSummary } from "~/lib/quota";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Cabecera común de los cuatro listados: título, explicación y —lo que faltaba—
 * el botón de crear con el cupo, visible tanto con contenido como sin él.
 */
export const ListingHeader = component$<{
  type: ContentType;
  titleId: string;
  title: string;
  description: string;
  communitySlug: string;
  communityName: string;
  summary: QuotaSummary;
  isMember: boolean;
  isAuthenticated: boolean;
}>(
  ({
    type,
    titleId,
    title,
    description,
    communitySlug,
    communityName,
    summary,
    isMember,
    isAuthenticated,
  }) => {
    const locale = useLocale();
    return (
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0 max-w-xl">
          <h2 id={titleId} class="text-xl font-semibold tracking-tight">
            {translate(locale, title)}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(locale, description)}
          </p>
        </div>
        <div class="w-full sm:w-auto sm:shrink-0 [&_a]:w-full sm:[&_a]:w-auto">
          <CreateButton
            type={type}
            communitySlug={communitySlug}
            communityName={communityName}
            summary={summary}
            isMember={isMember}
            isAuthenticated={isAuthenticated}
            size="md"
          />
        </div>
      </div>
    );
  },
);

/**
 * Estado vacío con propósito: qué es esta sección, por qué vale la pena, y el
 * botón de crear con el cupo. "No hay contenido" no le sirve a nadie.
 */
export const EmptyListing = component$<{
  type: ContentType;
  emoji: string;
  title: string;
  why: string;
  communitySlug: string;
  communityName: string;
  summary: QuotaSummary;
  isMember: boolean;
  isAuthenticated: boolean;
}>(
  ({
    type,
    emoji,
    title,
    why,
    communitySlug,
    communityName,
    summary,
    isMember,
    isAuthenticated,
  }) => (
    <EmptyState emoji={emoji} title={title} description={why}>
      <CreateButton
        type={type}
        communitySlug={communitySlug}
        communityName={communityName}
        summary={summary}
        isMember={isMember}
        isAuthenticated={isAuthenticated}
        size="lg"
      />
      <Slot />
    </EmptyState>
  ),
);
