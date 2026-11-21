import { component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { Icon } from "~/components/ui";
import { useLocale, translate, type Locale } from "~/lib/i18n";
import {
  MANUAL_DETAIL_FAQ,
  MANUAL_ESSENTIAL_FAQ,
  MANUAL_FAQ_CATEGORIES,
  MANUAL_QUERY_MAX_LENGTH,
  categoryAnchor,
  cleanManualQuery,
  filterManualFaq,
  type ManualFaqItem,
} from "~/lib/manual-faq";

const MANUAL_PATH = "/manual/";
/** Las secciones quedan debajo del encabezado y, hasta `lg`, de la franja del menú. */
const ANCHOR_OFFSET = "scroll-mt-36 lg:scroll-mt-24";

/** Arma la URL del manual conservando la búsqueda; funciona sin JavaScript. */
function manualHref(query: string, openAll: boolean, hash: string): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (openAll) params.set("abrir", "todas");
  const search = params.toString();
  return `${MANUAL_PATH}${search ? `?${search}` : ""}#${hash}`;
}

/**
 * Una pregunta con su respuesta.
 *
 * Es un `<details>` y no un acordeón con estado: abre y cierra sin JavaScript
 * y el navegador lo encuentra con su propio buscador. El `id` es el ancla
 * pública de la respuesta; el enlace del final existe para poder copiarla.
 */
const FaqEntry = ({
  item,
  locale,
  open,
}: {
  item: ManualFaqItem;
  locale: Locale;
  open: boolean;
}) => (
  <details
    id={item.id}
    open={open}
    class={`group rounded-2xl border border-subtle bg-surface shadow-soft open:border-brand-500/50 ${ANCHOR_OFFSET}`}
  >
    <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-3 font-semibold text-ink-strong marker:hidden hover:bg-muted/60">
      <span>{translate(locale, item.question)}</span>
      <span
        aria-hidden="true"
        class="text-xl font-normal text-brand transition-transform group-open:rotate-45 motion-reduce:transition-none"
      >
        +
      </span>
    </summary>
    <div class="space-y-3 px-5 pb-5 text-sm leading-relaxed text-ink-muted">
      {item.answer.map((paragraph) => (
        <p key={paragraph}>{translate(locale, paragraph)}</p>
      ))}
      <p class="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1">
        {item.link && (
          <Link
            href={item.link.href}
            class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
          >
            {translate(locale, item.link.label)} →
          </Link>
        )}
        <a
          href={`#${item.id}`}
          class="inline-flex min-h-11 items-center text-xs text-ink-faint hover:text-brand hover:underline"
        >
          {translate(locale, "Enlace a esta respuesta")}
        </a>
      </p>
    </div>
  </details>
);

/**
 * Preguntas del manual: las esenciales primero y el detalle agrupado por tema.
 *
 * El buscador filtra mientras se escribe y también es un formulario GET: sin
 * JavaScript la búsqueda viaja en `?q=` y el servidor entrega la lista ya
 * filtrada, con una URL que se puede compartir. "Abrir todas" es un enlace con
 * `?abrir=todas` por lo mismo, y es lo que permite imprimir las respuestas.
 */
export const ManualFaq = component$(() => {
  const locale = useLocale();
  const loc = useLocation();
  const query = useSignal(cleanManualQuery(loc.url.searchParams.get("q")));
  const queryField = useSignal<HTMLInputElement>();
  const openAll = loc.url.searchParams.get("abrir") === "todas";

  // eslint-disable-next-line qwik/no-use-visible-task -- el fragmento de la URL y la impresión sólo existen en el navegador
  useVisibleTask$(
    ({ cleanup }) => {
      // La señal sola no alcanza: lo que la persona escribió vive en la
      // propiedad `value` del campo, no en su atributo.
      const clearQuery = () => {
        query.value = "";
        if (queryField.value) queryField.value.value = "";
      };
      const reveal = (target: HTMLElement) => {
        if (target instanceof HTMLDetailsElement) target.open = true;
        target.scrollIntoView({ block: "start" });
      };
      // Un enlace a `#borradores` llega a una respuesta cerrada: se abre. Si
      // la búsqueda la dejó afuera —o dejó oculto el tema que eligieron en el
      // menú—, se borra la búsqueda: el enlace manda sobre el filtro.
      const openTarget = (fragment?: string) => {
        const raw = fragment ?? window.location.hash.slice(1);
        let id = raw;
        try {
          id = decodeURIComponent(raw);
        } catch {
          // Un fragmento mal codificado se usa tal cual: no hay nada que abrir.
        }
        if (!id) return;
        const target = document.getElementById(id);
        if (target && !target.closest("[hidden]")) {
          if (target instanceof HTMLDetailsElement && !target.open) {
            reveal(target);
          }
          return;
        }
        const belongsHere =
          MANUAL_ESSENTIAL_FAQ.some((item) => item.id === id) ||
          MANUAL_DETAIL_FAQ.some((item) => item.id === id) ||
          MANUAL_FAQ_CATEGORIES.some(
            (category) => categoryAnchor(category.id) === id,
          );
        if (!belongsHere || !query.value) return;
        clearQuery();
        // El destino existe recién cuando la lista completa volvió a pintarse.
        window.setTimeout(() => {
          const restored = document.getElementById(id);
          if (restored) reveal(restored);
        }, 150);
      };
      // Una respuesta cerrada no se imprime: antes de imprimir se abren todas.
      const openForPrint = () => {
        for (const entry of document.querySelectorAll<HTMLDetailsElement>(
          "[data-manual-faq] details",
        )) {
          entry.open = true;
        }
      };

      const onHashChange = () => openTarget();
      // El router atiende los enlaces a un ancla de la misma página sin
      // disparar `hashchange`, así que el clic se escucha aparte. Va en el
      // turno siguiente: primero se mueve la página, después se abre.
      const onAnchorClick = (event: MouseEvent) => {
        const link =
          event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>('a[href^="#"]')
            : null;
        if (link) window.setTimeout(() => openTarget(link.hash.slice(1)), 0);
      };

      openTarget();
      window.addEventListener("hashchange", onHashChange);
      document.addEventListener("click", onAnchorClick);
      window.addEventListener("beforeprint", openForPrint);
      cleanup(() => {
        window.removeEventListener("hashchange", onHashChange);
        document.removeEventListener("click", onAnchorClick);
        window.removeEventListener("beforeprint", openForPrint);
      });
    },
    { strategy: "document-ready" },
  );

  const t = (text: string) => translate(locale, text);
  const search = cleanManualQuery(query.value);
  const essentials = filterManualFaq(MANUAL_ESSENTIAL_FAQ, search, t);
  const detail = filterManualFaq(MANUAL_DETAIL_FAQ, search, t);
  const found = essentials.length + detail.length;

  return (
    <div data-manual-faq>
      <section
        id="preguntas"
        class={`py-10 ${ANCHOR_OFFSET}`}
        aria-labelledby="faq-title"
      >
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "Preguntas frecuentes")}
        </p>
        <h2
          id="faq-title"
          class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {translate(locale, "Lo importante antes de participar")}
        </h2>

        <form
          role="search"
          method="get"
          action={`${MANUAL_PATH}#preguntas`}
          class="mt-6 max-w-3xl"
        >
          <label for="manual-query" class="sr-only">
            {translate(locale, "Buscar en las preguntas")}
          </label>
          <div class="relative flex items-center">
            <div class="pointer-events-none absolute left-4 flex items-center text-ink-muted">
              <Icon name="search" class="text-xl" />
            </div>
            <input
              ref={queryField}
              id="manual-query"
              name="q"
              type="search"
              maxLength={MANUAL_QUERY_MAX_LENGTH}
              value={query.value}
              onInput$={(_, el) => (query.value = el.value)}
              placeholder={translate(
                locale,
                "Por ejemplo: residencia, borrador, resultados",
              )}
              enterKeyHint="search"
              autoComplete="off"
              class="min-h-12 w-full rounded-2xl border border-control bg-surface pl-11 pr-28 text-base text-ink shadow-sm placeholder:text-ink-faint focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
            />
            <div class="absolute inset-y-0 right-1 flex items-center gap-1">
              {query.value && (
                <button
                  type="button"
                  aria-label={translate(locale, "Borrar búsqueda")}
                  onClick$={() => {
                    query.value = "";
                    // El texto escrito vive en la propiedad del campo.
                    if (queryField.value) queryField.value.value = "";
                    queryField.value?.focus();
                  }}
                  class="grid size-11 place-items-center rounded-xl text-ink-muted hover:bg-muted hover:text-ink-strong"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              )}
              <button
                type="submit"
                class="min-h-10 rounded-xl px-3 text-sm font-medium text-brand hover:bg-muted"
              >
                {translate(locale, "Buscar")}
              </button>
            </div>
          </div>
          {openAll && <input type="hidden" name="abrir" value="todas" />}
        </form>

        <div class="mt-4 flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p
            role="status"
            aria-label={translate(locale, "Resultados de la búsqueda")}
            class="text-sm text-ink-muted"
          >
            {search &&
              (found === 0
                ? translate(
                    locale,
                    "No encontramos respuestas para “{{query}}”. Probá con otra palabra o recorré los temas del menú.",
                    { query: search },
                  )
                : found === 1
                  ? translate(locale, "Una respuesta para “{{query}}”", {
                      query: search,
                    })
                  : translate(locale, "{{count}} respuestas para “{{query}}”", {
                      count: found,
                      query: search,
                    }))}
          </p>
          {/* Enlace común y no `Link`: con una navegación de página entera el
              atributo `open` de cada respuesta sale del servidor, sin pelearse
              con las que la persona ya abrió o cerró a mano. */}
          <a
            href={manualHref(search, !openAll, "preguntas")}
            class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
          >
            {openAll
              ? translate(locale, "Cerrar todas las respuestas")
              : translate(locale, "Abrir todas las respuestas")}
          </a>
        </div>

        <div class="mt-3 max-w-3xl space-y-3">
          {essentials.map((item) => (
            <FaqEntry
              key={item.id}
              item={item}
              locale={locale}
              open={openAll}
            />
          ))}
        </div>
      </section>

      <section
        id="detalle"
        class={`py-10 ${ANCHOR_OFFSET}`}
        aria-labelledby="detail-title"
      >
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "El detalle, por tema")}
        </p>
        <h2
          id="detail-title"
          class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {translate(locale, "Cada pantalla, en detalle")}
        </h2>
        <p class="mt-4 max-w-3xl leading-relaxed text-ink-muted">
          {translate(
            locale,
            "Respuestas puntuales sobre cada parte de Agorbis, agrupadas por tema. Usá el buscador o el menú para llegar a la tuya.",
          )}
        </p>
        {MANUAL_FAQ_CATEGORIES.map((category) => {
          const items = detail.filter((item) => item.category === category.id);
          const anchor = categoryAnchor(category.id);
          // Un tema sin resultados se oculta pero no se desmonta: el menú
          // lateral observa este elemento para saber qué se está leyendo, y
          // uno recreado al borrar la búsqueda ya no sería el observado.
          return (
            <section
              key={category.id}
              id={anchor}
              hidden={items.length === 0}
              class={`mt-9 max-w-3xl ${ANCHOR_OFFSET}`}
              aria-labelledby={`${anchor}-title`}
            >
              <h3 id={`${anchor}-title`} class="text-lg font-semibold">
                {translate(locale, category.label)}
              </h3>
              <div class="mt-3 space-y-3">
                {items.map((item) => (
                  <FaqEntry
                    key={item.id}
                    item={item}
                    locale={locale}
                    open={openAll}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </div>
  );
});
