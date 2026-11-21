import { component$ } from "@qwik.dev/core";
import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { HttpErrorPage } from "~/components/layout/HttpErrorPage";
import { Button, Input } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "../layout";

/**
 * 404 propio. Se pone el status en un loader para que la respuesta sea
 * realmente un 404 y no un 200 con cara de error.
 */
export const useNotFound = routeLoader$((ev) => {
  ev.status(404);
  return { path: ev.url.pathname };
});

export default component$(() => {
  const data = useNotFound();
  const locale = useLocale();

  return (
    // La misma página que dibuja un 404 lanzado por un loader
    // (`HttpErrorPage`): había dos "Esta página no existe" con ilustración,
    // texto y botones distintos según por dónde se llegara. Acá se suman la
    // dirección pedida y el buscador.
    <HttpErrorPage status={404}>
      <p class="mt-3 max-w-xl text-sm text-ink-muted">
        {translate(locale, "No encontramos nada en")}{" "}
        <code class="max-w-full break-all rounded-lg bg-muted px-1.5 py-0.5 text-sm">
          {data.value.path}
        </code>
      </p>

      {/* Casi siempre se llega acá buscando algo concreto —una comunidad, un
          reclamo— y las dos únicas salidas eran "explorar" y "volver": había
          que empezar el recorrido de cero. Con el buscador, el nombre que ya
          se tenía en la cabeza alcanza. */}
      <form
        method="get"
        action="/buscar"
        class="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row"
      >
        <label for="q" class="sr-only">
          {translate(locale, "Buscar en Agorbis")}
        </label>
        <Input
          name="q"
          type="search"
          required
          minLength={2}
          maxLength={160}
          placeholder={translate(locale, "Ej: Córdoba, Lima, Madrid…")}
          class="text-start"
        />
        <Button type="submit" class="shrink-0">
          {translate(locale, "Buscar")}
        </Button>
      </form>
    </HttpErrorPage>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Página no encontrada")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
