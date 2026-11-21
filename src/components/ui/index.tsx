import {
  component$,
  createContextId,
  Slot,
  useContext,
  useContextProvider,
  useId,
  useSignal,
  useVisibleTask$,
  type ClassList,
  type QRL,
  type QwikIntrinsicElements,
} from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { prefersReducedMotion } from "~/lib/accessibility-preferences";
import { triggerHapticFeedback } from "~/lib/haptics";
import { useLocale, translate } from "~/lib/i18n";
import { initials } from "~/lib/text";
import { safeAvatarUrl } from "~/lib/url";

import { cx } from "./cx";
import { DialogFrame } from "./Dialog";
import { Icon } from "./Icon";
import { Illustration, type IllustrationName } from "./Illustration";

export { cx };
export { Chip, type ChipVariant } from "./Chip";
export { Icon, type IconName } from "./Icon";
export { Illustration, type IllustrationName } from "./Illustration";
export { MetaLine } from "./MetaLine";
export { CHIP_ROW, CHIP_ROW_BLEED } from "./chip-row";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type Variant = "primary" | "success" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

// Radio 12 px (D124): un control de 40–48 px con radio 16 parecía píldora.
// Las tarjetas conservan 16; los chips son redondos. Sin `hover:scale`: el
// botón que crece al pasar el mouse vibra; alcanza con color y sombra.
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium select-none touch-manipulation " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100";

const BUTTON_VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-soft hover:bg-brand-700 dark:bg-brand-600 dark:hover:bg-brand-700",
  success:
    "bg-success-700 text-white shadow-soft hover:bg-success-900 dark:bg-success-700 dark:hover:bg-success-900",
  secondary:
    "bg-surface text-ink-strong border border-control hover:border-brand-500 hover:bg-muted",
  ghost: "text-ink-muted hover:bg-muted hover:text-ink-strong",
  danger: "bg-danger-600 text-white hover:bg-danger-700",
};

const BUTTON_SIZES: Record<Size, string> = {
  // `sm` mide 32 px: área tocable mínima de 44 px para el dedo.
  sm: "h-8 px-3 text-sm touch-target min-h-[44px] min-w-[44px]",
  md: "h-10 px-4 text-sm touch-target min-h-[48px]",
  lg: "h-12 px-6 text-base min-h-[48px]",
};

export function buttonClass(
  variant: Variant = "primary",
  size: Size = "md",
  extra?: ClassList,
) {
  return cx(
    BUTTON_BASE,
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    extra as string,
  );
}

type ButtonProps = QwikIntrinsicElements["button"] & {
  variant?: Variant;
  size?: Size;
};

/**
 * `type` por defecto es "button" y no el "submit" del HTML.
 *
 * Un `<button>` sin type adentro de un `<form>` envía el formulario. Acá todos
 * los envíos pasan por `SubmitButton`, así que un `Button` sin type es siempre
 * un control auxiliar —"Agregar opción", "Cancelar", "Cambiar monto"— y
 * heredar "submit" significaba mandar el formulario a medio llenar al primer
 * click. Hoy todos los llamadores lo pasan a mano; esto hace que el olvido
 * deje de ser un envío accidental.
 */
export const Button = component$<ButtonProps>(
  ({
    variant = "primary",
    size = "md",
    class: cls,
    type = "button",
    ...rest
  }) => {
    return (
      <button type={type} class={buttonClass(variant, size, cls)} {...rest}>
        <Slot />
      </button>
    );
  },
);

/**
 * Botón de envío que refleja que el envío está en curso.
 *
 * Sin esto un formulario lento no da ninguna señal: la gente vuelve a tocar el
 * botón y manda el mismo reclamo dos veces. Se inhabilita mientras corre (lo
 * que además corta el doble submit en el cliente), muestra el spinner y avisa
 * por `aria-busy` a quien no lo ve. La etiqueta no cambia: sustituirla mueve el
 * ancho del botón justo debajo del dedo que lo acaba de tocar.
 */
export const SubmitButton = component$<
  Omit<ButtonProps, "type"> & { pending: boolean }
>(({ pending, class: cls, disabled, ...rest }) => {
  const locale = useLocale();
  return (
    <Button
      type="submit"
      {...rest}
      // Después del spread: un `disabled` propio del llamador se suma al
      // bloqueo por envío en curso, nunca lo pisa.
      disabled={pending || disabled}
      aria-busy={pending}
      class={cls}
    >
      {pending && (
        <>
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0 animate-spin"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" class="opacity-25" />
            <path stroke-linecap="round" d="M21 12a9 9 0 00-9-9" />
          </svg>
          <span class="sr-only">{translate(locale, "Enviando…")}</span>
        </>
      )}
      <Slot />
    </Button>
  );
});

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  size?: Size;
  class?: ClassList;
  "aria-label"?: string;
  /** Para salir del sitio: acompañar con `ExternalLinkHint`. */
  target?: "_blank";
  rel?: string;
};

export const ButtonLink = component$<ButtonLinkProps>(
  ({ href, variant = "primary", size = "md", class: cls, ...rest }) => (
    <Link href={href} class={buttonClass(variant, size, cls)} {...rest}>
      <Slot />
    </Link>
  ),
);

/**
 * Marca de "esto sale del sitio en una pestaña nueva".
 *
 * Las fuentes, la evidencia y los sitios oficiales se abren con
 * `target="_blank"` y nada lo anunciaba: en un teléfono parece que la app se
 * colgó, con lector de pantalla el contexto cambia sin aviso (WCAG 3.2.5) y
 * el botón de "atrás" deja de servir para volver. Va adentro del `<a>`, así
 * que el texto entra en el nombre accesible del enlace.
 */
export const ExternalLinkHint = component$(() => {
  const locale = useLocale();
  return (
    <>
      <Icon name="share" class="ml-1 text-[0.85em] text-ink-faint" />
      <span class="sr-only">
        {" "}
        {translate(locale, "(se abre en una pestaña nueva)")}
      </span>
    </>
  );
});

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
/**
 * El `as` existe para que una tarjeta que sí es una sección del documento se
 * anuncie como tal. Antes se declaraba y se ignoraba: los dos llamadores que
 * pasaban `as="section"` recibían un `<div>`, y el árbol de accesibilidad
 * perdía la agrupación que el código creía estar pidiendo.
 */
export const Card = component$<{
  class?: ClassList;
  as?: "div" | "article" | "section";
  /**
   * Dos niveles de superficie (D123): la tarjeta de contenido es plana, con
   * borde y sin sombra; la elevación aparece sólo al pasar sobre lo que es
   * clicable. Antes todas llevaban la misma sombra y nada destacaba.
   */
  interactive?: boolean;
  /** Franja izquierda con el color de un tipo de contenido (`border-l-…`). */
  accent?: string;
}>(({ class: cls, as: Tag = "div", interactive = false, accent }) => (
  <Tag
    class={cx(
      // Tailwind 4 eleva con la propiedad `translate`, no con `transform`:
      // con `transform` en la transición la tarjeta saltaba de golpe y
      // `transform-none` no la frenaba con "reducir movimiento" (MetricTile).
      "rounded-2xl border border-subtle bg-surface transition-[border-color,box-shadow,translate] duration-200 ease-out",
      interactive &&
        "hover:-translate-y-0.5 hover:border-strong hover:shadow-lift motion-reduce:hover:translate-none",
      accent && cx("border-l-4", accent),
      cls as string,
    )}
  >
    <Slot />
  </Tag>
));

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------
type Tone = "neutral" | "brand" | "success" | "warn" | "danger";

const BADGE_TONES: Record<Tone, string> = {
  neutral:
    "bg-inset text-ink-muted border border-subtle/80 dark:bg-muted/70 dark:text-ink-strong dark:border-subtle",
  brand:
    "bg-brand-50 text-brand-700 border border-brand-500/20 dark:bg-brand-950/70 dark:text-brand-200 dark:border-brand-400/40",
  success:
    "bg-success-50 text-success-700 border border-success-500/20 dark:bg-success-900/60 dark:text-success-300 dark:border-success-500/30",
  warn: "bg-warn-400/15 text-warn border border-warn-500/25 dark:bg-warn-500/20 dark:text-warn-300 dark:border-warn-400/30",
  danger:
    "bg-danger-500/12 text-danger border border-danger-500/25 dark:bg-danger-500/20 dark:text-danger-300 dark:border-danger-400/30",
};

export const Badge = component$<{
  tone?: Tone;
  class?: ClassList;
  pulse?: boolean;
}>(({ tone = "neutral", class: cls, pulse = false }) => (
  <span
    class={cx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold tracking-wide whitespace-nowrap",
      BADGE_TONES[tone],
      cls as string,
    )}
  >
    {pulse && (
      <span class="relative flex size-2 shrink-0" aria-hidden="true">
        <span class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 bg-current" />
        <span class="relative inline-flex size-2 rounded-full bg-current" />
      </span>
    )}
    <Slot />
  </span>
));

// ---------------------------------------------------------------------------
// Campos de formulario
// ---------------------------------------------------------------------------
const FIELD_BASE =
  "min-h-11 w-full rounded-xl border border-control bg-surface px-3.5 py-2.5 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 " +
  "disabled:opacity-60 aria-[invalid=true]:border-danger-500";

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
  error?: string | string[];
  required?: boolean;
  class?: ClassList;
};

/**
 * Qué texto de apoyo existe realmente en el DOM. Sólo `Field` lo sabe —el
 * control vive en su slot y no puede verlo—, así que lo publica por contexto.
 *
 * Antes cada control apuntaba `aria-describedby` a `${name}-hint` de forma
 * incondicional: en los campos sin hint eso era una referencia colgada, y al
 * marcar el campo inválido se perdía el hint en vez de sumarse el error.
 */
interface FieldState {
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContextId<FieldState>("agorbis.field");
const NO_FIELD: FieldState = { invalid: false };

/** Envoltorio con label, hint y error. El control va en el slot. */
export const Field = component$<FieldProps>(
  ({ label, name, hint, error, required, class: cls }) => {
    const locale = useLocale();
    const message = Array.isArray(error) ? error[0] : error;

    // Con error y hint a la vez se describen los dos, en ese orden: primero
    // qué salió mal, después la regla que hay que cumplir.
    const ids = [
      message ? `${name}-error` : null,
      hint ? `${name}-hint` : null,
    ].filter(Boolean);

    useContextProvider(FieldContext, {
      describedBy: ids.length > 0 ? ids.join(" ") : undefined,
      invalid: !!message,
    });

    return (
      <div class={cx("space-y-1.5", cls as string)}>
        <label for={name} class="block text-sm font-medium text-ink-strong">
          {translate(locale, label)}
          {required && (
            <span class="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <Slot />
        {message && (
          <p
            id={`${name}-error`}
            role="alert"
            class="flex items-center gap-1.5 text-xs font-semibold text-danger animate-fade-in"
          >
            <span aria-hidden="true">⚠️</span>
            <span>{translate(locale, message)}</span>
          </p>
        )}
        {hint && (
          <p id={`${name}-hint`} class="text-xs text-ink-faint">
            {translate(locale, hint)}
          </p>
        )}
      </div>
    );
  },
);

/**
 * Resuelve estado inválido y descripción del control. El `invalid` explícito
 * sigue mandando para los pocos controles que viven fuera de un `Field`; si no
 * se pasa, se hereda del `Field` y deja de poder quedar desincronizado.
 */
const useFieldState = (invalid: boolean | undefined) => {
  const field = useContext(FieldContext, NO_FIELD);
  return {
    invalid: invalid ?? field.invalid,
    describedBy: field.describedBy,
  };
};

type InputProps = QwikIntrinsicElements["input"] & {
  name: string;
  invalid?: boolean;
};

export const Input = component$<InputProps>(
  ({
    class: cls,
    invalid,
    name,
    dir = "auto",
    type,
    enterKeyHint,
    autoCapitalize,
    autoCorrect,
    spellcheck,
    ...rest
  }) => {
    const field = useFieldState(invalid);
    const resolvedAutoCapitalize =
      autoCapitalize ??
      (type === "email" || type === "password" || type === "url"
        ? "none"
        : "sentences");
    const resolvedAutoCorrect =
      autoCorrect ??
      (type === "email" || type === "password" || type === "url"
        ? "off"
        : "on");
    const resolvedSpellcheck =
      spellcheck ??
      (type === "email" || type === "password" || type === "url"
        ? false
        : true);
    return (
      <input
        id={name}
        name={name}
        dir={dir}
        type={type}
        autoCapitalize={resolvedAutoCapitalize}
        autoCorrect={resolvedAutoCorrect}
        spellcheck={resolvedSpellcheck}
        /* En un teclado táctil la tecla de acción decide qué se espera del
           campo. Un buscador con "Enter" genérico —o peor, con "Siguiente",
           que salta al campo de al lado— hace que la gente busque el botón en
           pantalla en vez de mandar desde el teclado. */
        enterKeyHint={
          enterKeyHint ?? (type === "search" ? "search" : undefined)
        }
        /* Un `type="number"` enfocado se lleva la rueda del mouse: al scrollear
           la página con el puntero encima, el navegador cambia el valor en vez
           de mover el documento. En esta app esos campos son montos —lo que
           alguien compromete a un proyecto, lo que pide una propuesta de
           presupuesto—, así que el gesto de bajar para leer el resto del
           formulario reescribía la cifra sin que nadie lo notara. Al soltar el
           foco la rueda vuelve a scrollear y el valor queda como estaba. */
        onWheel$={
          type === "number"
            ? (_, el) => {
                if (document.activeElement === el) el.blur();
              }
            : undefined
        }
        aria-invalid={field.invalid ? "true" : undefined}
        aria-describedby={field.describedBy}
        class={cx(FIELD_BASE, cls as string)}
        {...rest}
      />
    );
  },
);

/** Campo de contraseña con revelado explícito y operable con teclado. */
export const PasswordInput = component$<Omit<InputProps, "type">>(
  ({ class: cls, name, ...rest }) => {
    const visible = useSignal(false);
    const locale = useLocale();
    const action = visible.value ? "Ocultar contraseña" : "Mostrar contraseña";

    return (
      <div class="relative">
        <Input
          {...rest}
          name={name}
          type={visible.value ? "text" : "password"}
          class={cx("pr-24", cls as string)}
        />
        <button
          type="button"
          aria-label={translate(locale, action)}
          aria-pressed={visible.value}
          class="touch-target absolute right-1.5 top-1/2 min-h-8 -translate-y-1/2 rounded-xl px-2.5 text-xs font-semibold text-brand transition-all hover:bg-muted active:scale-90"
          onClick$={() => {
            triggerHapticFeedback("selection");
            visible.value = !visible.value;
          }}
        >
          {translate(locale, visible.value ? "Ocultar" : "Mostrar")}
        </button>
        <span class="sr-only" aria-live="polite">
          {visible.value
            ? translate(locale, "Contraseña visible")
            : translate(locale, "Contraseña oculta")}
        </span>
      </div>
    );
  },
);

type TextareaProps = QwikIntrinsicElements["textarea"] & {
  name: string;
  invalid?: boolean;
};

export const Textarea = component$<TextareaProps>(
  ({
    class: cls,
    invalid,
    name,
    dir = "auto",
    autoCapitalize = "sentences",
    autoCorrect = "on",
    spellcheck = true,
    ...rest
  }) => {
    const field = useFieldState(invalid);
    return (
      <textarea
        id={name}
        name={name}
        dir={dir}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        spellcheck={spellcheck}
        aria-invalid={field.invalid ? "true" : undefined}
        aria-describedby={field.describedBy}
        class={cx(
          FIELD_BASE,
          "min-h-28 resize-y leading-relaxed",
          cls as string,
        )}
        {...rest}
      />
    );
  },
);

type SelectProps = QwikIntrinsicElements["select"] & {
  name: string;
  invalid?: boolean;
};

export const Select = component$<SelectProps>(
  ({ class: cls, invalid, name, ...rest }) => {
    const field = useFieldState(invalid);
    return (
      <select
        id={name}
        name={name}
        aria-invalid={field.invalid ? "true" : undefined}
        aria-describedby={field.describedBy}
        class={cx(
          FIELD_BASE,
          "select-chevron appearance-none pr-9",
          cls as string,
        )}
        {...rest}
      >
        <Slot />
      </select>
    );
  },
);

// ---------------------------------------------------------------------------
// Avisos inline (errores y confirmaciones de actions)
// ---------------------------------------------------------------------------
export const Alert = component$<{
  tone?: "danger" | "success" | "brand" | "warn";
  class?: ClassList;
}>(({ tone = "danger", class: cls }) => {
  const tones = {
    danger: "border-danger-500/30 bg-danger-500/8 text-danger",
    success: "border-success-500/30 bg-success-500/8 text-success",
    brand: "border-brand-500/30 bg-brand-500/8 text-brand",
    warn: "border-warn-400/40 bg-warn-400/10 text-warn",
  } as const;
  const box = useSignal<HTMLDivElement>();

  /**
   * Los errores de formulario se dibujan arriba de todo y el botón que los
   * dispara suele estar al final: en el formulario de una encuesta, el envío
   * fallaba y la pantalla no cambiaba en nada visible. Si el aviso quedó fuera
   * de la vista se lo trae y se le pasa el foco, así el siguiente Tab arranca
   * en el problema y no al principio del documento.
   *
   * Sólo para `danger` y sólo si no se ve: un aviso que ya está en pantalla no
   * necesita mover nada.
   */
  // eslint-disable-next-line qwik/no-use-visible-task -- depende de la posición real en pantalla
  useVisibleTask$(
    () => {
      if (tone !== "danger") return;
      const el = box.value;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;

      el.scrollIntoView({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      el.focus({ preventScroll: true });
    },
    // Con la estrategia por defecto (cuando entra en pantalla) la tarea
    // corría justo cuando el aviso ya se veía, y nunca hacía nada: el caso
    // que importa es el aviso fuera de la vista.
    { strategy: "document-ready" },
  );

  return (
    <div
      ref={box}
      role={tone === "danger" ? "alert" : "status"}
      tabIndex={tone === "danger" ? -1 : undefined}
      class={cx(
        "rounded-xl border px-4 py-3 text-sm focus:outline-none",
        tones[tone],
        cls as string,
      )}
    >
      <Slot />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Estado vacío: ilustración simple + explicación + CTA
// ---------------------------------------------------------------------------
export const EmptyState = component$<{
  /** Ilustración de línea propia (D123). Manda sobre `emoji`. */
  illustration?: IllustrationName;
  /** Compatibilidad: quien todavía no eligió ilustración muestra el emoji. */
  emoji?: string;
  title: string;
  description?: string;
  headingLevel?: "h2" | "h3";
}>(
  ({
    illustration,
    emoji,
    title,
    description,
    headingLevel: Heading = "h3",
  }) => {
    const locale = useLocale();
    const art = illustration ?? ILLUSTRATION_FOR_EMOJI[emoji ?? ""] ?? "empty";
    return (
      <div class="mx-auto flex max-w-2xl flex-col items-center rounded-3xl border border-subtle bg-surface p-8 text-center sm:p-12">
        <Illustration name={art} class="mb-5 size-24 sm:size-28" />
        <Heading class="text-lg font-semibold tracking-tight text-ink-strong">
          {translate(locale, title)}
        </Heading>
        {description && (
          <p class="mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
            {translate(locale, description)}
          </p>
        )}
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3 empty:hidden">
          <Slot />
        </div>
      </div>
    );
  },
);

/* Los estados vacíos existentes nombran un emoji; cada uno cae en la
   ilustración que le corresponde hasta que su llamada elija una. */
const ILLUSTRATION_FOR_EMOJI: Record<string, IllustrationName> = {
  "🔎": "search",
  "🔍": "search",
  "🌱": "sprout",
  "✅": "done",
  "📭": "empty",
  "🧭": "compass",
  "🏛️": "empty",
  "🚧": "tools",
  "🗳️": "empty",
  "🗂️": "empty",
  "🔔": "empty",
  "📨": "empty",
  "📍": "compass",
  "📋": "empty",
  "💬": "empty",
  "👥": "people",
  "🧹": "done",
  "🧑‍🤝‍🧑": "people",
};

// ---------------------------------------------------------------------------
// Barra de progreso accesible
// ---------------------------------------------------------------------------
export const ProgressBar = component$<{
  value: number;
  max: number;
  label: string;
  tone?: "brand" | "data";
  /**
   * Qué representa el progreso, ya formateado — "12 de 30 apoyos",
   * "$400.000 de $1.000.000". Sin esto el lector de pantalla sólo dice el
   * número de `aria-valuenow`, que es un porcentaje sin unidad: "40" a secas,
   * cuando lo que importa es de qué son ese 40%.
   */
  valueText?: string;
}>(({ value, max, label, tone = "data", valueText }) => {
  const locale = useLocale();
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText ?? `${Math.round(pct)}%`}
      aria-label={translate(locale, label)}
      class="h-2.5 w-full overflow-hidden rounded-full bg-inset"
    >
      <div
        class={cx(
          "h-full origin-left rounded-full animate-bar-grow",
          tone === "data" ? "bg-data-500" : "bg-brand-600",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
export const Avatar = component$<{
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  /**
   * El avatar está sobre la línea de flotación y hay que cargarlo ya.
   *
   * `loading="lazy"` es lo correcto para los avatares de una lista de
   * comentarios, que es de lejos el uso más común, pero el del header está
   * visible en todas las páginas desde el primer pintado: diferirlo sólo
   * conseguía que la foto apareciera de golpe un instante después del resto
   * del encabezado. El tamaño intrínseco acompaña al pedido, para que el hueco
   * ya esté reservado y la aparición no empuje nada.
   */
  priority?: boolean;
}>(({ src, name, size = "md", priority = false }) => {
  const sizes = {
    sm: "size-7 text-2xs",
    md: "size-9 text-xs",
    lg: "size-16 text-lg",
  };
  /** Los píxeles reales de cada variante, para pedir la imagen a ese tamaño. */
  const pixels = { sm: 28, md: 36, lg: 64 };
  const letters = initials(name);
  const safeSrc = safeAvatarUrl(src);
  const failedSrc = useSignal<string | null>(null);
  const avatarImage = useSignal<HTMLImageElement>();

  // eslint-disable-next-line qwik/no-use-visible-task -- una imagen puede fallar antes de que el navegador reanude su handler
  useVisibleTask$(({ track }) => {
    const image = track(() => avatarImage.value);
    if (image?.complete && image.naturalWidth === 0)
      failedSrc.value = image.getAttribute("src");
  });

  return safeSrc && failedSrc.value !== safeSrc ? (
    <img
      ref={avatarImage}
      key={safeSrc}
      src={safeSrc}
      onError$={(_, image) => {
        failedSrc.value = image.getAttribute("src");
      }}
      alt=""
      /* El tamaño declarado acompaña al que se pide, así el hueco reservado
         coincide con lo que llega. Antes eran 64 fijos para las tres
         variantes. */
      width={pixels[size] * 2}
      height={pixels[size] * 2}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      class={cx(
        "shrink-0 rounded-full object-cover transition-transform duration-150 active:scale-95 touch-manipulation",
        sizes[size],
      )}
    />
  ) : (
    <span
      aria-hidden="true"
      class={cx(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 transition-transform duration-150 active:scale-95 touch-manipulation",
        "dark:bg-brand-900 dark:text-brand-200",
        sizes[size],
      )}
    >
      {letters}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Modal / Diálogo accesible
// ---------------------------------------------------------------------------
export const Modal = component$<{
  open: boolean;
  onClose$: QRL<() => void>;
  title: string;
}>(({ open, onClose$, title }) => {
  const locale = useLocale();
  // El título visible es el nombre accesible del diálogo: antes el `<dialog>`
  // no tenía etiqueta y el lector anunciaba sólo "diálogo".
  const titleId = useId();

  return (
    <DialogFrame
      open={open}
      onClose$={onClose$}
      labelledBy={titleId}
      class="z-50 w-full max-w-lg rounded-3xl border border-strong bg-surface text-ink p-6 shadow-2xl sm:p-7 max-sm:fixed max-sm:bottom-0 max-sm:inset-x-0 max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:p-5 max-sm:animate-bottom-sheet sm:animate-scale-pop"
    >
      <div
        aria-hidden="true"
        class="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-strong/60 sm:hidden"
      />
      <div class="flex items-center justify-between gap-4 border-b border-subtle pb-4">
        <h2 id={titleId} class="text-base font-semibold text-ink-strong">
          {title}
        </h2>
        <div class="flex items-center gap-2">
          <kbd
            aria-hidden="true"
            class="hidden sm:inline-block rounded-md border border-subtle bg-muted/60 px-1.5 py-0.5 text-3xs font-semibold text-ink-faint shadow-2xs"
          >
            {"ESC"}
          </kbd>
          <button
            type="button"
            onClick$={onClose$}
            aria-label={translate(locale, "Cerrar")}
            class="grid size-9 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong touch-target active:scale-95"
          >
            <Icon name="x" class="text-base" />
          </button>
        </div>
      </div>
      <div class="mt-4 max-h-[75vh] overflow-y-auto">
        <Slot />
      </div>
    </DialogFrame>
  );
});

// Los esqueletos de carga (`Skeleton`, `SkeletonCard`, `SkeletonClaimCard`)
// que había acá no los usaba ninguna ruta: se retiraron. Las rutas cargan con
// `routeLoader$` y llegan ya con datos; si alguna vez hace falta un estado de
// carga, conviene diseñarlo con la ruta que lo necesite.

export { ToastContainer, showToast } from "./Toast";
export { triggerCivicConfetti } from "./ConfettiCelebration";
export { triggerHapticFeedback } from "~/lib/haptics";
export { PullToRefresh } from "./PullToRefresh";
export { DialogFrame } from "./Dialog";
// `CommandPalette` y `CivicCalendarButton` no se reexportan acá: son
// funciones (buscan en la base, arman eventos de calendario), no primitivas,
// y al pasar por el barrel arrastraban sus dependencias a las 160 rutas y
// componentes que sólo quieren un `Button`. Se importan desde su archivo.
