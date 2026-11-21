import { component$ } from "@qwik.dev/core";
import { PollResults, type PollResultRow } from "./PollResults";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Panel estático de resultados finales.
 *
 * La base sólo devuelve filas después del cierre y con cinco participantes o
 * más. No se refresca mientras la ronda está abierta: consultar cambios
 * sucesivos permitiría inferir la preferencia recién agregada.
 */
export const LiveResults = component$<{
  initialResults: PollResultRow[];
  initialTotal: number;
  initialVoters: number;
  question?: string;
  communityName?: string;
}>(
  ({
    initialResults,
    initialTotal,
    initialVoters,
    question,
    communityName,
  }) => {
    const locale = useLocale();

    return (
      <div>
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-ink-strong">
            {translate(locale, "Resultados")}
          </h2>
          <span class="rounded-full bg-brand-50 px-2 py-0.5 text-2xs font-semibold text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
            {initialTotal}{" "}
            {translate(locale, initialTotal === 1 ? "voto" : "votos")}
          </span>
        </div>

        <PollResults
          results={initialResults}
          totalVotes={initialTotal}
          totalVoters={initialVoters}
          question={question}
          communityName={communityName}
        />
      </div>
    );
  },
);
