import { $, component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Button, Card, Icon, triggerHapticFeedback } from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import { playCivicSound } from "~/lib/audio-feedback";
import type { CategoryIcon } from "~/lib/constants";
import { pluralize } from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";
import { currentPageUrl, shareNativeOrWhatsApp } from "~/lib/share";
import { routes } from "~/lib/community";

export interface HonorVictory {
  id: string;
  title: string;
  /** Ícono propio de la categoría (D125); sin categoría, el trofeo. */
  categoryIcon?: CategoryIcon;
  categoryLabel?: string;
  supportCount: number;
  solvedAt: string;
}

export const VictoriesHonorRoll = component$<{
  communityName: string;
  communitySlug: string;
  victories: HonorVictory[];
}>(({ communityName, victories }) => {
  const locale = useLocale();
  // El botón "Agradecer" guardaba el gesto sólo en este navegador y avisaba
  // que el agradecimiento "fue enviado a los vecinos": se retiró. Queda la
  // difusión, que sí sale del dispositivo porque la hace la persona.
  const handleShareVictory = $((victoryId: string, victoryTitle: string) => {
    playCivicSound("click");
    triggerHapticFeedback("light");
    const claimUrl = new URL(routes.claim(victoryId), currentPageUrl()).href;
    const text = translate(
      locale,
      '🏆 Reclamo resuelto en {{community}}: "{{title}}". Conocé su seguimiento: {{url}}',
      {
        community: communityName,
        title: victoryTitle,
        url: claimUrl,
      },
    );

    const channel = shareNativeOrWhatsApp({
      title: victoryTitle,
      text,
      url: claimUrl,
    });
    if (channel === "whatsapp") {
      showToast(translate(locale, "Enlace listo para compartir"), "success");
    }
  });

  if (victories.length === 0) return null;

  // Tarjeta plana: no es clicable, así que no se eleva al pasar (D123). Sin
  // el borde doble, el degradé ámbar ni la insignia "Impacto Comunitario",
  // que la portada ya había retirado por sonar a folleto.
  return (
    <Card class="mt-6 p-5 sm:p-6">
      <div class="flex items-start gap-3 border-b border-subtle pb-4">
        <Icon name="trophy" class="mt-0.5 text-xl text-success" />
        <div class="min-w-0">
          <h3 class="font-display text-display-xs text-ink-strong">
            {translate(locale, "Victorias para compartir")}
          </h3>
          <p class="mt-0.5 text-xs text-ink-muted">
            {translate(
              locale,
              "Reclamos marcados como resueltos en {{community}}",
              { community: communityName },
            )}
          </p>
        </div>
      </div>

      <ul class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {victories.slice(0, 6).map((v) => (
          <li
            key={v.id}
            class="flex flex-col rounded-2xl border border-subtle bg-surface p-4"
          >
            {/* Meta como en la tarjeta de reclamo: categoría con su ícono
                propio (D125) y la fecha a la derecha. */}
            <div class="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
              <span class="inline-flex items-center gap-1">
                <Icon name={v.categoryIcon ?? "trophy"} class="text-sm" />
                {translate(locale, v.categoryLabel ?? "Victoria")}
              </span>
              <span class="ml-auto tabular-nums text-ink-faint">
                {v.solvedAt}
              </span>
            </div>

            <h4
              dir="auto"
              class="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-ink-strong"
            >
              <Link
                href={routes.claim(v.id)}
                class="inline-flex min-h-11 items-center rounded-lg hover:text-brand hover:underline"
              >
                {v.title}
              </Link>
            </h4>

            <div class="mt-auto flex items-center justify-between gap-2 border-t border-subtle pt-3">
              <span class="inline-flex items-center gap-1 text-xs text-ink-muted">
                <Icon name="users" />
                {pluralize(v.supportCount, "apoyo", "apoyos", locale)}
              </span>
              {/* Difusión: el botón fantasma con ícono de toda la interfaz
                  (D124), sin el emoji ni el salto al pasar el mouse. */}
              <Button
                variant="ghost"
                size="sm"
                aria-label={translate(locale, "Compartir victoria: {{title}}", {
                  title: v.title,
                })}
                onClick$={() => handleShareVictory(v.id, v.title)}
              >
                <Icon name="share" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
});
