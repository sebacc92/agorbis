import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Una cifra con la anatomía única de D123: ícono y rótulo arriba, en el color
 * de lo que significan; el número grande y neutro; una nota chica abajo.
 *
 * Rendición y victorias pintaban cada número de un color (violeta, verde,
 * ámbar crudo, negro) y el cero salía en verde o en ámbar grande, como algo
 * que celebrar. Acá el color queda en el rótulo y el vacío se dice en
 * palabras atenuadas, igual que en la portada de la comunidad.
 *
 * Los textos llegan ya traducidos: `check-i18n` sólo ve los literales de
 * `translate(locale, "…")` en quien llama, no las props de este componente.
 * Adentro van sólo `span`: con `href` la ficha entera es un `<a>`, que no
 * admite bloques.
 */
export const MetricTile = component$<{
  icon: IconName;
  label: string;
  /** La cifra ya formateada; `null` cuando no hay nada que contar. */
  value: string | null;
  /** Qué decir en lugar del cero ("Todavía ninguno"). */
  emptyText?: string;
  note?: string;
  /** Color del ícono y del rótulo; el número siempre va neutro. */
  tone?: string;
  /** Con destino, la ficha entera lleva al listado filtrado. */
  href?: string;
}>(({ icon, label, value, emptyText, note, tone, href }) => {
  const body = (
    <>
      <span class={cx("flex items-center gap-2", tone ?? "text-ink-muted")}>
        <Icon name={icon} class="text-base" />
        <span class="text-xs font-semibold uppercase tracking-wider">
          {label}
        </span>
        {href && <Icon name="chevron-right" class="ml-auto text-ink-faint" />}
      </span>
      {value === null ? (
        <span class="mt-2 block text-sm text-ink-muted">{emptyText}</span>
      ) : (
        <span class="mt-2 block font-display text-display-md tabular-nums text-ink-strong">
          {value}
        </span>
      )}
      {note && <span class="mt-1 block text-xs text-ink-muted">{note}</span>}
    </>
  );
  const tile = "block rounded-2xl border border-subtle bg-surface p-4";

  return href ? (
    // Elevación sólo en lo clicable (D123), con la duración corta del
    // sistema y sin desplazamiento si la persona pidió reducir movimiento.
    // Tailwind 4 desplaza con la propiedad `translate` y no con `transform`:
    // con `transform` en la transición la ficha saltaba de golpe, y
    // `transform-none` no la frenaba con "reducir movimiento".
    <Link
      href={href}
      class={cx(
        tile,
        "transition-[border-color,box-shadow,translate] duration-150 ease-out hover:-translate-y-0.5 hover:border-strong hover:shadow-lift",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "motion-reduce:transition-none motion-reduce:hover:translate-none",
      )}
    >
      {body}
    </Link>
  ) : (
    <div class={tile}>{body}</div>
  );
});
