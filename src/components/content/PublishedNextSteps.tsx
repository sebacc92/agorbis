import { component$ } from "@qwik.dev/core";
import { useLocale, translate } from "~/lib/i18n";
import { ShareButton } from "./ShareButton";

export type PublishedKind = "poll" | "debate" | "claim" | "project";

const TITLES: Record<PublishedKind, string> = {
  poll: "Tu encuesta ya está publicada",
  debate: "Tu debate ya está publicado",
  claim: "Tu reclamo ya está publicado",
  project: "Tu proyecto ya está publicado",
};

/**
 * Primera visita de la autoría al detalle, recién publicado.
 *
 * Después de publicar se llegaba a la ficha sin más: no se sabía qué pasaba
 * ahora, que difundirla es lo que la hace crecer ni cómo deshacerla. Cada
 * frase describe lo que hace la base: el plazo de respuesta de 0026, el
 * cierre y el mínimo de cinco de D68, y los avisos de cambio de estado y de
 * respuesta institucional, que van a la autoría de cualquier publicación.
 *
 * La página la muestra sólo a la autoría: el parámetro de la URL se puede
 * compartir, y a otra persona le diría algo que no es cierto.
 */
export const PublishedNextSteps = component$<{
  kind: PublishedKind;
  title: string;
  /** Ruta canónica de la publicación, para compartirla sin el parámetro. */
  url: string;
  communityName: string;
  /** Encuestas: cierre ya formateado por la página, con su zona horaria. */
  closesLabel?: string;
  /** Reclamos: días de respuesta del nivel, o `null` si no tiene plazo. */
  responseDays?: number | null;
}>(({ kind, title, url, communityName, closesLabel, responseDays }) => {
  const locale = useLocale();

  const next =
    kind === "claim"
      ? [
          responseDays
            ? translate(
                locale,
                "Las instituciones de {{community}} tienen {{count}} días para acusar recibo. Si nadie lo hace, el reclamo puede subir de nivel con suficientes apoyos.",
                { community: communityName, count: responseDays },
              )
            : translate(
                locale,
                "En este nivel no hay un plazo de respuesta institucional.",
              ),
          translate(
            locale,
            "Compartilo con quienes también están afectados: pueden sumar su apoyo.",
          ),
        ]
      : kind === "poll"
        ? [
            closesLabel
              ? translate(
                  locale,
                  "Cierra el {{date}}. Hasta entonces nadie ve conteos; al cierre se publican los resultados si participaron al menos 5 personas.",
                  { date: closesLabel },
                )
              : translate(
                  locale,
                  "Hasta el cierre nadie ve conteos; al cierre se publican los resultados si participaron al menos 5 personas.",
                ),
            translate(
              locale,
              "Compartila para que participe más gente de {{community}}.",
              { community: communityName },
            ),
          ]
        : kind === "debate"
          ? [
              translate(
                locale,
                "Cada comunidad comenta en su propia columna, así se ve qué piensa cada territorio.",
              ),
              translate(
                locale,
                "Compartilo para sumar voces de distintas comunidades.",
              ),
            ]
          : [
              translate(
                locale,
                "Ahora puede recibir compromisos de dinero, tiempo o materiales. Nadie transfiere dinero a través de Agorbis.",
              ),
              translate(
                locale,
                "Compartilo para sumar personas que se comprometan.",
              ),
            ];

  return (
    <section
      aria-labelledby="publicado-titulo"
      class="mb-6 rounded-2xl border border-success-500/40 bg-success-50/40 p-5 shadow-soft dark:bg-success-950/20"
    >
      <h2 id="publicado-titulo" class="text-lg font-semibold text-ink-strong">
        <span aria-hidden="true">✓ </span>
        {translate(locale, TITLES[kind])}
      </h2>
      <p class="mt-1 text-sm font-medium text-ink-strong">
        {translate(locale, "Qué sigue:")}
      </p>
      <ul class="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
        {next.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>
          {translate(
            locale,
            "Te avisamos cuando cambie de estado o responda una institución.",
          )}
        </li>
        <li>
          {translate(
            locale,
            "Si te equivocaste, podés dar de baja la publicación desde la Zona del autor, al final de la página.",
          )}
        </li>
      </ul>
      <ShareButton
        title={title}
        url={url}
        kind={kind}
        communityName={communityName}
        class="mt-4"
      />
    </section>
  );
});
