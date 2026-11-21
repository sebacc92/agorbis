import { component$, Slot, type ClassList, type QRL } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

/**
 * Un solo chip para toda la interfaz (D123).
 *
 * Había al menos tres píldoras distintas (filtros de comunidad, filtros de
 * tipo, "acción directa") con alturas, radios y estados seleccionados
 * propios. Acá hay un componente con tres variantes y un único estado
 * seleccionado. Si lleva `href` es un enlace; si no, un botón o un texto.
 */
export type ChipVariant = "filter" | "action" | "badge";

const BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium transition-colors select-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2";

const SIZE: Record<ChipVariant, string> = {
  filter: "min-h-9 px-3.5 text-xs",
  action: "min-h-10 px-4 text-sm",
  badge: "min-h-6 px-2.5 text-2xs font-semibold tracking-wide",
};

const OFF =
  "border-subtle bg-surface text-ink-muted hover:border-strong hover:text-ink-strong";
const ON =
  "border-brand-600 bg-brand-600 text-white shadow-xs dark:border-brand-500 dark:bg-brand-500";

type ChipProps = {
  variant?: ChipVariant;
  selected?: boolean;
  href?: string;
  icon?: IconName;
  /** Clases del estado seleccionado para un tipo de contenido. */
  selectedClass?: string;
  /** Clases del estado normal (por ejemplo, el badge de un tipo). */
  toneClass?: string;
  class?: ClassList;
  onClick$?: QRL<() => void>;
  type?: "button" | "submit";
  /**
   * Para un chip que envía un formulario GET (los filtros de /buscar): el
   * navegador manda `name=value` y el chip anuncia con `aria-pressed` cuál es
   * el filtro vigente, igual que un chip con `onClick$`.
   */
  name?: string;
  value?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export const Chip = component$<ChipProps>(
  ({
    variant = "filter",
    selected = false,
    href,
    icon,
    selectedClass,
    toneClass,
    class: cls,
    onClick$,
    type = "button",
    name,
    value,
    ariaLabel,
    disabled,
  }) => {
    const className = cx(
      BASE,
      SIZE[variant],
      selected ? (selectedClass ?? ON) : (toneClass ?? OFF),
      cls as string,
    );
    const body = (
      <>
        {icon && <Icon name={icon} class="text-[1.1em]" />}
        <Slot />
      </>
    );
    if (href) {
      return (
        // El router corre `onClick$` antes de su propia navegación, así que un
        // chip-enlace puede sumar, por ejemplo, la vibración al tocarlo.
        <Link
          href={href}
          class={className}
          aria-current={selected ? "page" : undefined}
          aria-label={ariaLabel}
          onClick$={onClick$}
        >
          {body}
        </Link>
      );
    }
    if (variant === "badge" && !onClick$) {
      return (
        <span class={className} aria-label={ariaLabel}>
          {body}
        </span>
      );
    }
    return (
      <button
        type={type}
        name={name}
        value={value}
        class={className}
        aria-pressed={onClick$ || name ? selected : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick$={onClick$}
      >
        {body}
      </button>
    );
  },
);
