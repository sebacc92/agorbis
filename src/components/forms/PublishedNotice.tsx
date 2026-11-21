import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Señal visible y anunciada entre la confirmación de la base y la ficha.
 *
 * Sin esto, tras una carga completa el botón volvía a habilitarse sin ningún
 * aviso y la gente tocaba de nuevo. Dice "Publicado" porque `publicationResult`
 * sólo devuelve `published` después de la escritura (D74). El contenedor con
 * `role="status"` se dibuja siempre, vacío, y se llena al publicar: una región
 * viva que aparece ya con texto no la anuncian todos los lectores. El enlace es
 * la salida si la navegación tarda o falla: el botón ya quedó bloqueado y el
 * borrador borrado, así que la persona necesita cómo llegar a lo publicado.
 */
export const PublishedNotice = component$<{ href: string | null }>(
  ({ href }) => {
    const locale = useLocale();
    return (
      <p
        role="status"
        aria-live="polite"
        class={
          href
            ? "mt-3 rounded-2xl border border-success-500/30 bg-success-50/40 px-4 py-3 text-sm text-success-900 dark:bg-success-950/20 dark:text-success-200"
            : undefined
        }
      >
        {href && (
          <>
            {translate(locale, "Publicado. Abriendo la publicación…")}{" "}
            <Link
              href={href}
              class="font-semibold underline underline-offset-2"
            >
              {translate(locale, "Abrir la publicación")}
            </Link>
          </>
        )}
      </p>
    );
  },
);
