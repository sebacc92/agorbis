import { component$ } from "@qwik.dev/core";
import { Badge, Card, Chip, Icon, cx } from "~/components/ui";
import { LEVEL_NAMES } from "~/lib/constants";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import {
  CONTENT_TYPES,
  CONTENT_TYPE_ORDER,
  nextRenewalLabel,
  type QuotaEntry,
  type QuotaSummary,
} from "~/lib/quota";
import { useLocale, translate } from "~/lib/i18n";
import { routes } from "~/lib/community";

/**
 * La grilla completa de cuotas: una fila por comunidad de la cadena. Es la
 * respuesta a "¿qué puedo publicar y dónde?" en una sola mirada.
 *
 * Antes cada celda repetía "1/1 Crear": dieciséis enlaces iguales que había
 * que leer uno por uno. Ahora cada tipo es un indicador chico (ícono en su
 * color, fracción y barra) y la fila tiene un solo "Publicar acá" (D124).
 */
export const QuotaGrid = component$<{ summary: QuotaSummary }>(
  ({ summary }) => {
    const locale = useLocale();
    // Agrupamos por comunidad manteniendo el orden por nivel que ya trae el RPC.
    const communities: {
      slug: string;
      name: string;
      emoji: string | null;
      level: number;
    }[] = [];
    for (const entry of summary.entries) {
      if (!communities.some((c) => c.slug === entry.communitySlug)) {
        communities.push({
          slug: entry.communitySlug,
          name: entry.communityName,
          emoji: entry.communityEmoji,
          level: entry.level,
        });
      }
    }

    const cell = (slug: string, type: string) =>
      summary.entries.find(
        (e) => e.communitySlug === slug && e.contentType === type,
      );
    const available = (entry: QuotaEntry | undefined) =>
      !!entry && (entry.remaining === null || entry.remaining > 0);

    // Sin este caso aparte, un fallo de la consulta caía en el mensaje de
    // abajo y le decía "elegí dónde vivís" a alguien que ya lo había elegido.
    if (summary.unavailable) {
      return (
        <p class="rounded-xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
          {translate(
            locale,
            "No pudimos consultar tu cupo en este momento. Probá recargar la página.",
          )}
        </p>
      );
    }

    if (communities.length === 0) {
      return (
        <p class="rounded-xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
          {translate(
            locale,
            "Elegí dónde vivís para tener cupo de publicación.",
          )}
        </p>
      );
    }

    return (
      <Card class="overflow-hidden">
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-subtle px-5 py-4">
          <div>
            <h2 class="text-display-xs">
              {translate(locale, "Tu cupo de publicación")}
            </h2>
            <p class="mt-0.5 text-sm text-ink-muted">
              {translate(
                locale,
                "Por mes calendario y por nivel. No se acumula de un mes al siguiente.",
              )}
            </p>
          </div>
          {summary.unlimited ? (
            <Badge tone="brand">
              {translate(locale, "Sin límite (moderación)")}
            </Badge>
          ) : (
            <Badge tone="neutral">
              {translate(locale, "Se renueva el {{date}}", {
                date: nextRenewalLabel(locale),
              })}
            </Badge>
          )}
        </div>

        {/* La tabla mide 34rem como mínimo: en un teléfono siempre desborda.
            Un contenedor con scroll que no es focalizable no se puede mover con
            el teclado, así que las columnas cortadas quedaban inalcanzables sin
            mouse ni dedo. */}
        <div
          role="region"
          aria-label={translate(locale, "Tabla de cupo, desplazable")}
          tabIndex={0}
          class="relative overflow-x-auto scrollbar-slim focus-visible:outline-2"
        >
          <table class="w-full min-w-[34rem] text-sm">
            <caption class="sr-only">
              {translate(
                locale,
                "Cupo mensual restante por comunidad y tipo de contenido",
              )}
            </caption>
            <thead>
              <tr class="border-b border-subtle text-left">
                <th
                  scope="col"
                  class="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint"
                >
                  {translate(locale, "Comunidad")}
                </th>
                {CONTENT_TYPE_ORDER.map((type) => (
                  <th
                    key={type}
                    scope="col"
                    class="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint"
                  >
                    <span
                      class={cx(
                        "inline-flex items-center gap-1",
                        CONTENT_KIND_TONES[type].text,
                      )}
                    >
                      <Icon name={CONTENT_KINDS[type].icon} class="text-sm" />
                      {translate(locale, CONTENT_TYPES[type].plural)}
                    </span>
                  </th>
                ))}
                <th scope="col" class="px-5 py-2.5">
                  <span class="sr-only">{translate(locale, "Publicar")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {communities.map((community) => {
                // Un solo enlace por fila: al primer tipo con cupo, en el orden
                // de la tabla; sin cupo en ninguno, a la portada de la comunidad.
                const firstOpen = CONTENT_TYPE_ORDER.find((type) =>
                  available(cell(community.slug, type)),
                );
                const publishHref = firstOpen
                  ? `${routes.community(community.slug)}/${CONTENT_TYPES[firstOpen].newPath}`
                  : routes.community(community.slug);
                return (
                  <tr
                    key={community.slug}
                    class="border-b border-subtle last:border-0"
                  >
                    <th scope="row" class="px-5 py-3 text-left font-normal">
                      <span class="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          class="size-2 shrink-0 rounded-full"
                          style={{
                            background: `var(--level-${community.level})`,
                          }}
                        />
                        <span class="font-display font-semibold text-ink-strong">
                          {community.name}
                        </span>
                        <span class="hidden text-xs text-ink-faint sm:inline">
                          {translate(
                            locale,
                            LEVEL_NAMES[community.level] ?? "Comunidad",
                          )}
                        </span>
                      </span>
                    </th>

                    {CONTENT_TYPE_ORDER.map((type) => {
                      const entry = cell(community.slug, type);
                      const unlimited = entry?.remaining === null;
                      const remaining = entry?.remaining ?? 0;
                      const limit = entry?.monthlyLimit ?? 0;
                      const share =
                        limit > 0 ? Math.round((remaining / limit) * 100) : 0;
                      const tone = CONTENT_KIND_TONES[type];

                      return (
                        // Se lee "te quedan tres de cinco", no "tres barra
                        // cinco": el dibujo cambia, lo que se anuncia no.
                        <td key={type} class="px-3 py-3 text-center">
                          {unlimited ? (
                            <span class={cx("text-xs", tone.text)}>
                              <span aria-hidden="true">∞</span>
                              <span class="sr-only">
                                {translate(locale, "Sin límite")}
                              </span>
                            </span>
                          ) : (
                            <span class="inline-flex min-w-12 flex-col items-center gap-1">
                              <span
                                class={cx(
                                  "tabular-nums",
                                  remaining === 0
                                    ? "text-ink-faint"
                                    : remaining <= 1
                                      ? "font-semibold text-warn"
                                      : "font-semibold text-ink-strong",
                                )}
                              >
                                <span aria-hidden="true">
                                  {remaining}
                                  <span class="text-xs font-normal text-ink-faint">
                                    /{limit}
                                  </span>
                                </span>
                                <span class="sr-only">
                                  {translate(
                                    locale,
                                    "Te quedan {{remaining}} de {{limit}}",
                                    { remaining, limit },
                                  )}
                                </span>
                              </span>
                              <span
                                aria-hidden="true"
                                class="block h-1 w-full overflow-hidden rounded-full bg-inset"
                              >
                                <span
                                  class={cx(
                                    "block h-full rounded-full",
                                    tone.selected.split(" ")[0],
                                  )}
                                  style={{ width: `${share}%` }}
                                />
                              </span>
                            </span>
                          )}
                        </td>
                      );
                    })}

                    <td class="px-5 py-3 text-right">
                      <Chip
                        variant="action"
                        href={publishHref}
                        icon="plus"
                        ariaLabel={translate(
                          locale,
                          firstOpen
                            ? "Publicar en {{community}}"
                            : "Ver {{community}}",
                          { community: community.name },
                        )}
                        class={cx(!firstOpen && "opacity-70")}
                      >
                        {translate(locale, firstOpen ? "Publicar acá" : "Ver")}
                      </Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p class="border-t border-subtle px-5 py-3 text-xs text-ink-muted">
          {translate(
            locale,
            "Cuanto más arriba en la jerarquía, más chico es el cupo: una encuesta global la ven millones de personas. Si borrás algo tuyo dentro de las 24 horas, el cupo vuelve.",
          )}
        </p>
      </Card>
    );
  },
);
