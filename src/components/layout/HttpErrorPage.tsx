import { component$, Slot } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { ButtonLink, Illustration } from "~/components/ui";
import { translate, useLocale } from "~/lib/i18n";

export const HttpErrorPage = component$<{ status: number }>(({ status }) => {
  const locale = useLocale();
  const forbidden = status === 401 || status === 403;
  const notFound = status === 404;
  const serverError = status >= 500;
  const title = forbidden
    ? "No tenés acceso a esta sección"
    : notFound
      ? "Esta página no existe"
      : serverError
        ? "No pudimos cargar esta página"
        : "No pudimos completar la solicitud";
  const description = forbidden
    ? "Si creés que deberías poder entrar, verificá tu sesión o volvé a una sección pública."
    : notFound
      ? "Puede que el enlace esté viejo, que el contenido se haya movido o que ya no esté disponible."
      : serverError
        ? "El problema quedó del lado del sistema. Probá otra vez en unos minutos; no hace falta reenviar datos sensibles."
        : "Revisá la dirección o volvé a intentar desde la página anterior.";

  return (
    <div class="container-reading flex flex-col items-center py-16 text-center sm:py-24">
      {/* Ilustración de línea propia en lugar del emoji (D123). */}
      <Illustration
        name={
          forbidden
            ? "locked"
            : notFound
              ? "compass"
              : serverError
                ? "tools"
                : "empty"
        }
        class="size-28 sm:size-32"
      />
      <p
        class="mt-4 font-display text-sm font-semibold tabular-nums text-ink-faint"
        aria-hidden="true"
      >
        {status}
      </p>
      <h1 class="mt-2 text-display-lg sm:text-display-xl">
        {translate(locale, title)}
      </h1>
      <p class="mt-3 max-w-xl text-ink-muted">
        {translate(locale, description)}
      </p>
      {/* Lo propio de cada página (el buscador de "no existe") va entre la
          explicación y las salidas comunes. */}
      <Slot />
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        {serverError && (
          <a
            href=""
            class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-brand-600 px-5 text-sm font-medium text-white shadow-soft hover:bg-brand-700"
          >
            {translate(locale, "Intentar de nuevo")}
          </a>
        )}
        {forbidden && (
          <ButtonLink href="/ingresar" variant="secondary">
            {translate(locale, "Revisar mi sesión")}
          </ButtonLink>
        )}
        <ButtonLink href="/explorar" variant="secondary">
          {translate(locale, "Explorar comunidades")}
        </ButtonLink>
        <Link
          href="/"
          class="min-h-11 px-3 py-3 text-sm font-medium text-brand hover:underline"
        >
          {translate(locale, "Volver al inicio")}
        </Link>
      </div>
    </div>
  );
});
