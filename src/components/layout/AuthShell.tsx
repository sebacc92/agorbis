import { component$, Slot } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import {
  SignupProgress,
  type SignupStep,
} from "~/components/auth/SignupProgress";
import { useLocale, translate } from "~/lib/i18n";

const BENEFITS = [
  {
    title: "Proponé mejoras",
    description: "Compartí ideas para el lugar donde vivís.",
    path: "M12 5v14M5 12h14",
  },
  {
    title: "Participá en las decisiones",
    description: "Sumá tu voz a las conversaciones de tu comunidad.",
    path: "M8 10h8M8 14h5M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a9 9 0 0 1 18 0Z",
  },
  {
    title: "Seguí lo que pasa cerca",
    description: "Encontrá iniciativas y novedades de tu comunidad.",
    path: "M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  },
] as const;

/** Un mismo marco para acceder, recuperar la cuenta y completar el alta. */
export const AuthShell = component$<{
  title: string;
  subtitle?: string;
  welcome?: boolean;
  /** Paso del alta: suma el progreso y usa la columna libre en desktop. */
  progress?: SignupStep;
  /** Contenido a todo el ancho de la columna (listas, dos columnas). */
  wide?: boolean;
}>(({ title, subtitle, welcome = false, progress, wide = false }) => {
  const locale = useLocale();
  const withProgress = progress !== undefined;
  return (
    <div
      class={
        welcome
          ? "mx-auto grid w-full max-w-7xl items-start gap-8 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_480px] lg:gap-16 lg:py-16"
          : withProgress
            ? "mx-auto grid w-full max-w-7xl items-start gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 lg:py-14"
            : "mx-auto w-full max-w-[528px] px-4 py-8 sm:px-6 sm:py-12"
      }
    >
      {withProgress && !welcome && (
        <aside class="lg:sticky lg:top-24 lg:pt-1">
          <SignupProgress current={progress} />
        </aside>
      )}
      {welcome && (
        <aside
          class="hidden lg:block lg:pt-9"
          aria-label={translate(locale, "Participá en Agorbis")}
        >
          <p class="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-brand">
            <span class="size-2 rounded-full bg-brand-600" aria-hidden="true" />
            {translate(locale, "El cambio empieza cerca")}
          </p>
          <h2 class="max-w-lg text-3xl leading-tight font-semibold tracking-tight text-ink-strong sm:text-4xl lg:text-5xl lg:leading-[1.12]">
            {translate(locale, "Tu comunidad también se construye con vos.")}
          </h2>
          <p class="mt-4 max-w-md text-base leading-7 text-ink-muted lg:mt-5 lg:text-lg">
            {translate(
              locale,
              "Sumate para proponer mejoras, participar en decisiones y seguir lo que pasa donde vivís.",
            )}
          </p>
          <ul class="mt-9 hidden space-y-6 lg:block">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title} class="flex items-start gap-4">
                <span class="grid size-11 shrink-0 place-items-center rounded-2xl border border-brand-200/60 bg-brand-50 text-brand dark:border-brand-800 dark:bg-brand-950/40">
                  <svg
                    class="size-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d={benefit.path} />
                  </svg>
                </span>
                <div>
                  <p class="font-semibold text-ink-strong">
                    {translate(locale, benefit.title)}
                  </p>
                  <p class="mt-1 max-w-xs text-sm leading-6 text-ink-muted">
                    {translate(locale, benefit.description)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/explorar"
            class="mt-7 hidden min-h-11 items-center gap-2 text-sm font-semibold text-brand hover:underline lg:inline-flex"
          >
            {translate(locale, "Explorá las comunidades")}
            <span aria-hidden="true">→</span>
          </Link>
        </aside>
      )}
      <section
        class={
          withProgress && !wide
            ? "w-full max-w-[560px] min-w-0"
            : "w-full min-w-0"
        }
        aria-labelledby="auth-heading"
      >
        {/* Con la bienvenida a un lado no hay columna para el recorrido:
            la línea compacta igual dice "Paso 1 de 5" desde el arranque. */}
        {withProgress && welcome && (
          <div class="mb-5">
            <SignupProgress current={progress} compact />
          </div>
        )}
        <div class="mb-6">
          <h1
            id="auth-heading"
            class="text-2xl font-semibold tracking-tight text-ink-strong"
            tabIndex={-1}
          >
            {translate(locale, title)}
          </h1>
          {subtitle && (
            <p class="mt-2 text-sm leading-6 text-ink-muted">
              {translate(locale, subtitle)}
            </p>
          )}
        </div>
        <Slot />
      </section>
    </div>
  );
});
