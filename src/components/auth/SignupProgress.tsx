import { component$ } from "@qwik.dev/core";
import { cx } from "~/components/ui";
import { translate, useLocale } from "~/lib/i18n";

/**
 * El alta completa, de punta a punta. Antes cada pantalla contaba sus propios
 * pasos (el onboarding decía 3 y los acuerdos ninguno) y la persona no sabía
 * cuánto faltaba (D110).
 */
export const SIGNUP_STEPS = [
  "Creá tu cuenta",
  "Confirmá tu correo",
  "Acuerdos",
  "Tu nombre",
  "Tu comunidad",
] as const;

export type SignupStep = 0 | 1 | 2 | 3 | 4;

export const SignupProgress = component$<{
  current: SignupStep;
  /** Sólo la línea con la barra, en cualquier ancho (registro con bienvenida). */
  compact?: boolean;
}>(({ current, compact = false }) => {
  const locale = useLocale();
  const total = SIGNUP_STEPS.length;
  return (
    <nav aria-label={translate(locale, "Progreso del registro")}>
      {/* Celular y tablet: una línea y una barra, sin robar alto. */}
      <div class={compact ? undefined : "lg:hidden"}>
        <p class="mb-2 text-xs font-medium text-ink-muted">
          {translate(locale, "Paso {{current}} de {{total}}", {
            current: current + 1,
            total,
          })}{" "}
          · {translate(locale, SIGNUP_STEPS[current])}
        </p>
        <div class="flex gap-1.5" aria-hidden="true">
          {SIGNUP_STEPS.map((step, index) => (
            <span
              key={step}
              class={cx(
                "h-1.5 flex-1 rounded-full",
                index <= current
                  ? "bg-brand-600 dark:bg-brand-400"
                  : "bg-inset",
              )}
            />
          ))}
        </div>
      </div>

      {/* Desktop: la columna libre muestra el recorrido entero. */}
      {!compact && (
        <ol class="hidden lg:block">
          {SIGNUP_STEPS.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li
                key={step}
                class="relative flex gap-3 pb-6 last:pb-0"
                aria-current={active ? "step" : undefined}
              >
                {index < total - 1 && (
                  <span
                    aria-hidden="true"
                    class={cx(
                      "absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 rounded-full",
                      done ? "bg-brand-500" : "bg-inset",
                    )}
                  />
                )}
                <span
                  aria-hidden="true"
                  class={cx(
                    "grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    done && "bg-brand-600 text-white dark:bg-brand-500",
                    active &&
                      "border-2 border-brand-600 bg-surface text-brand dark:border-brand-400",
                    !done && !active && "border border-subtle text-ink-faint",
                  )}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span class="pt-1">
                  <span
                    class={cx(
                      "block text-sm",
                      active
                        ? "font-semibold text-ink-strong"
                        : done
                          ? "text-ink"
                          : "text-ink-muted",
                    )}
                  >
                    {translate(locale, step)}
                  </span>
                  <span class="sr-only">
                    {translate(
                      locale,
                      done
                        ? "completado"
                        : active
                          ? "paso actual"
                          : "pendiente",
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
});
