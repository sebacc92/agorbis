import { component$ } from "@qwik.dev/core";
import { cx, Icon, type IconName } from "~/components/ui";
import type { CommunityRef } from "~/lib/community";
import { useLocale, translate } from "~/lib/i18n";

/**
 * La regla del producto, dibujada.
 *
 * "Elegís dónde vivís y pasás a ser miembro de toda tu cadena" es una frase que
 * hay que leer dos veces; anidada es evidente de un vistazo. Cada nivel
 * contiene literalmente al siguiente, con el matiz de `--level-N` que ya usa el
 * resto de la app, así que el color también enseña la jerarquía.
 *
 * Si el visitante ya eligió residencia se dibuja **su** cadena, con los nombres
 * reales. Si no, se dibujan los niveles en abstracto.
 */

/** Etiquetas cuando todavía no hay cadena propia: se le habla al visitante. */
const PLACEHOLDER = [
  "La Tierra",
  "Tu continente",
  "Tu país",
  "Tu provincia",
  "Tu ciudad",
];

/* Niveles en abstracto: íconos propios (D125). Cuando la cadena es real,
   cada comunidad conserva su emoji, que es identidad elegida. */
const PLACEHOLDER_ICON: IconName[] = [
  "globe",
  "map",
  "building",
  "home-group",
  "map-pin",
];

export const ChainDiagram = component$<{ chain: CommunityRef[] }>(
  ({ chain }) => {
    const locale = useLocale();
    const real = chain.length > 1;

    // Se topa en 5 anillos: con seis el más interno queda sin aire suficiente
    // para el texto, y el barrio se entiende igual desde la ciudad.
    const rings = real
      ? chain.slice(0, 5).map((c) => ({
          key: c.slug,
          label: c.name,
          emoji: c.emoji ?? null,
          icon: null as IconName | null,
          level: c.level,
        }))
      : PLACEHOLDER.map((label, i) => ({
          key: `nivel-${i}`,
          label: translate(locale, label),
          emoji: null as string | null,
          icon: PLACEHOLDER_ICON[i]!,
          level: i,
        }));

    // Se construye de adentro hacia afuera para poder anidar de verdad, en vez
    // de simular la anidación con márgenes.
    let node = (
      <div class="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-soft">
        <Icon name="check" stroke={2.5} />
        {translate(
          locale,
          real ? "Acá votás y comentás" : "Participás en todas",
        )}
      </div>
    );

    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]!;
      node = (
        <div
          class={cx(
            "rounded-2xl border p-1.5 sm:p-2.5",
            // El anillo externo apoya sobre la tarjeta; los internos se tiñen
            // apenas para que se vea la profundidad sin rayar el contraste.
            i === 0
              ? "bg-surface"
              : "bg-[color-mix(in_srgb,var(--ring)_5%,transparent)]",
          )}
          /* `style` como string y no como objeto: las propiedades
             personalizadas (`--ring`) dependen de cómo el framework serialice
             el objeto, y un `Object.assign` sobre `el.style` las descarta en
             silencio. La cadena siempre llega tal cual al atributo. */
          style={`--ring: var(--level-${ring.level}); border-color: var(--ring)`}
        >
          <p class="mb-1.5 flex items-center gap-1.5 px-0.5 text-3xs font-semibold sm:mb-2 sm:text-xs">
            {ring.icon ? (
              <span
                class="shrink-0 text-xs sm:text-sm"
                style="color: var(--ring)"
              >
                <Icon name={ring.icon} />
              </span>
            ) : (
              <span aria-hidden="true">{ring.emoji ?? "📍"}</span>
            )}
            <span
              class="truncate"
              style="color: color-mix(in srgb, var(--ring) 65%, var(--ink-strong))"
            >
              {ring.label}
            </span>
          </p>
          {node}
        </div>
      );
    }

    return (
      <figure class="mx-auto w-full max-w-sm xl:mx-0">
        <figcaption class="mb-3 text-center xl:text-left">
          <span class="block text-sm font-semibold text-ink-strong">
            {translate(locale, "Una ubicación, todos tus niveles")}
          </span>
          <span class="mt-0.5 block text-xs text-ink-muted">
            {translate(
              locale,
              real
                ? "Tu cadena personal de participación"
                : "De tu ciudad hasta la comunidad global",
            )}
          </span>
        </figcaption>
        {/* En teléfono la cadena usa pasos que pueden envolver. La versión
            anterior repartía cinco columnas iguales y obligaba a leer texto
            de 9 px truncado; estos chips conservan el orden y el nombre real. */}
        <div class="rounded-3xl border border-subtle bg-surface p-3 shadow-lift sm:hidden">
          <ol class="flex flex-wrap justify-center gap-2">
            {rings.map((ring, index) => (
              <li
                key={ring.key}
                class="flex max-w-full items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-muted"
                style={`border-color: color-mix(in srgb, var(--level-${ring.level}) 55%, var(--border-subtle))`}
              >
                <span
                  aria-hidden="true"
                  class="grid size-6 shrink-0 place-items-center rounded-full text-sm"
                  style={`background: color-mix(in srgb, var(--level-${ring.level}) 12%, var(--surface-card)); color: var(--level-${ring.level})`}
                >
                  {ring.icon ? <Icon name={ring.icon} /> : (ring.emoji ?? "📍")}
                </span>
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {ring.label}
                </span>
                {index < rings.length - 1 && (
                  <Icon name="chevron-right" class="ml-0.5 text-brand" />
                )}
              </li>
            ))}
          </ol>
          <p class="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-center text-xs font-semibold text-white">
            <Icon name="check" stroke={2.5} />
            {translate(
              locale,
              real ? "Acá votás y comentás" : "Participás en todas",
            )}
          </p>
        </div>

        <div class="hidden rounded-3xl border border-subtle bg-surface p-4 shadow-lift sm:block">
          {node}
        </div>
      </figure>
    );
  },
);
