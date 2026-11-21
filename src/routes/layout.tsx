import {
  component$,
  Slot,
  useContextProvider,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { isServer } from "@qwik.dev/core/build";
import {
  Link,
  routeLoader$,
  useDocumentHead,
  useLocation,
} from "@qwik.dev/router";
import { Header, Logo } from "~/components/layout/Header";
import { RecoveringErrorBoundary } from "~/components/layout/RecoveringErrorBoundary";
import { BottomNav } from "~/components/layout/BottomNav";
import { AuthHeader } from "~/components/layout/AuthHeader";
import { GlobalShortcuts } from "~/components/layout/GlobalShortcuts";
import { AccessibilityToggle } from "~/components/ui/AccessibilityToggle";
import { Icon, ToastContainer } from "~/components/ui";
import { CommandPalette } from "~/components/ui/CommandPalette";
import { APP_NAME, APP_TAGLINE } from "~/lib/constants";
import { LocaleContext, resolveLocale, translate } from "~/lib/i18n";
import { LEGAL_ROUTES, readParticipationStatus } from "~/lib/legal";
import { getViewer, supabase } from "~/lib/session";
import { supportFooterLinks } from "~/lib/support";
import { TimeZoneContext, timeZoneOf } from "~/lib/timezone";

/** Enlaces del pie, agrupados por para qué sirve cada uno. */
const FOOTER_SECTIONS = [
  {
    id: "explorar",
    title: "Explorar",
    links: [
      { href: "/explorar", label: "Explorar comunidades" },
      { href: "/c/earth", label: "Comunidad global" },
      { href: "/buscar", label: "Buscar" },
    ],
  },
  {
    id: "entender",
    title: "Entender",
    links: [
      { href: "/manual", label: "Cómo funciona" },
      { href: "/instituciones", label: "Instituciones" },
      // Vacío mientras no haya un enlace de donación válido (D128).
      ...supportFooterLinks(),
    ],
  },
  {
    id: "legal",
    title: "Legal y convivencia",
    links: [
      { href: LEGAL_ROUTES.privacy, label: "Privacidad" },
      { href: LEGAL_ROUTES.dataDeletion, label: "Eliminar cuenta y datos" },
      {
        href: LEGAL_ROUTES.internationalTransfers,
        label: "Transferencias internacionales",
      },
      { href: LEGAL_ROUTES.subprocessors, label: "Subencargados" },
      { href: LEGAL_ROUTES.terms, label: "Términos" },
      { href: LEGAL_ROUTES.communityRules, label: "Normas comunitarias" },
      { href: LEGAL_ROUTES.moderation, label: "Moderación y apelaciones" },
    ],
  },
] as const;

/**
 * Sesión del visitante, resuelta una vez por request y disponible en cualquier
 * ruta hija vía `useViewer()`.
 */
export const useViewer = routeLoader$(async (ev) => {
  const viewer = await getViewer(ev);
  if (!viewer.userId) return { ...viewer, participation: null };

  // Una respuesta personalizada nunca debe quedar en un CDN ni en el cache
  // compartido del navegador. Las anónimas conservan su política existente.
  ev.headers.set("Cache-Control", "private, no-store");
  const participation = await readParticipationStatus(supabase(ev));
  return { ...viewer, participation };
});
export const useLocaleLoader = routeLoader$((ev) => resolveLocale(ev.locale()));
export const useLaunchMode = routeLoader$((ev) =>
  ev.env.get("AGORBIS_LAUNCH_MODE"),
);

/**
 * Zona horaria del visitante, resuelta una vez por navegación.
 *
 * La pone el navegador en una cookie desde el script de `root.tsx`. En la
 * primera pintura de la primera visita todavía no existe y se cae a UTC, que
 * es lo que se venía mostrando; de la segunda en adelante, la zona real.
 */
export const useTimeZoneLoader = routeLoader$((ev) => timeZoneOf(ev));

export default component$(() => {
  const viewer = useViewer();
  const locale = useLocaleLoader();
  const launchMode = useLaunchMode();
  const timeZone = useTimeZoneLoader();
  const loc = useLocation();
  const documentHead = useDocumentHead();
  const readOnlyPreview = launchMode.value === "public-read-only";
  const pathname = loc.url.pathname.replace(/\/$/, "");
  const accountFlow = [
    "/registro",
    "/ingresar",
    "/recuperar",
    "/reenviar-confirmacion",
    "/auth/confirm",
    "/consentimiento",
    "/onboarding",
  ].includes(pathname);
  // Una acción también enciende `isNavigating` sin cambiar la URL. Se compara al
  // terminar porque al empezar puede ser tarde: tras una carga completa la tarea
  // recién corre con la respuesta, y una acción que redirige ya cambió la URL. La
  // búsqueda cuenta: tras un filtro, quien usa lector de pantalla tiene que oír que
  // terminó, no quedarse con "Cargando página…".
  const settledUrl = useSignal(pathname + loc.url.search);
  const arrivedElsewhere = useSignal(true);
  useTask$(({ track }) => {
    const navigating = track(() => loc.isNavigating);
    if (isServer || navigating) return;
    const current = loc.url.pathname.replace(/\/$/, "") + loc.url.search;
    arrivedElsewhere.value = current !== settledUrl.value;
    settledUrl.value = current;
  });
  useContextProvider(LocaleContext, locale.value);
  useContextProvider(TimeZoneContext, timeZone.value);

  const footerSections = [
    ...FOOTER_SECTIONS,
    viewer.value.userId
      ? {
          id: "cuenta",
          title: "Cuenta",
          links: [
            { href: "/inicio", label: "Mi inicio" },
            { href: "/perfil", label: "Mi perfil" },
          ],
        }
      : {
          id: "participar",
          title: "Participar",
          links: [
            { href: "/registro", label: "Crear cuenta" },
            {
              href: "/comunidades/solicitar",
              label: "Solicitar una comunidad",
            },
          ],
        },
  ];

  return (
    <div
      class="flex min-h-dvh flex-col"
      data-agorbis-launch-mode={launchMode.value || undefined}
    >
      {/* Cada navegación es un ida y vuelta al servidor: sin esto, entre el
          click y la página nueva no pasa absolutamente nada en pantalla y en
          una conexión lenta la gente vuelve a tocar el mismo enlace. La barra
          avanza rápido y frena antes del final, porque no sabemos cuánto
          falta; desaparece sola cuando llega la ruta nueva. */}
      {loc.isNavigating && (
        <>
          <div
            aria-hidden="true"
            class="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden"
          >
            <div class="animate-route-progress h-full w-full origin-left bg-brand-600 dark:bg-brand-400" />
          </div>
          {/* Además de la barra, un velo tenue sobre el contenido viejo.
              La barra sola medía 2 px pegados al borde superior: en un
              teléfono, con el pulgar tapando media pantalla y la página
              anterior todavía entera a la vista, era fácil creer que el toque
              no había registrado y volver a tocar. Esto atenúa lo que ya no
              es válido sin ocultarlo, así que se sigue leyendo mientras
              carga.

              `pointer-events-none`: es una señal, no un bloqueo. Tocar el
              mismo enlace otra vez no hace daño y bloquear la página por una
              navegación que puede tardar es peor. */}
          <div
            aria-hidden="true"
            class="animate-fade-in pointer-events-none fixed inset-0 z-40 bg-app/35"
          />
        </>
      )}
      {/* La barra es puramente visual; el anuncio va por separado para quien
          navega con lector de pantalla.

          Al terminar se anuncia el título de la página nueva. Antes volvía a
          cadena vacía: se avisaba que algo estaba cargando y nunca qué había
          llegado, que es justo el dato que un lector de pantalla no obtiene
          solo —Qwik Router no recarga el documento, así que el título cambia
          sin que se anuncie nada—. En la primera carga la región ya existe con
          su contenido y no hay cambio que anunciar, así que no interrumpe.

          Sólo si cambió la URL. Tras Revisar decía "Nuevo reclamo" con la
          confirmación en pantalla: de lo que pasa en la misma URL avisa el foco
          o el mensaje de quien lo hizo (WCAG 4.1.3). */}
      <span role="status" aria-live="polite" class="sr-only">
        {loc.isNavigating
          ? translate(locale.value, "Cargando página…")
          : arrivedElsewhere.value
            ? documentHead.title
            : ""}
      </span>

      {accountFlow ? (
        <AuthHeader signedIn={!!viewer.value.userId} />
      ) : (
        <Header viewer={viewer.value} />
      )}

      {readOnlyPreview && (
        <aside
          class="border-b border-brand-500/30 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:bg-brand-950/40 dark:text-brand-200"
          role="status"
        >
          <p class="container-content text-center font-medium">
            {translate(
              locale.value,
              "Vista previa pública de sólo lectura. El registro y toda participación están temporalmente deshabilitados.",
            )}
          </p>
        </aside>
      )}

      {/* En /consentimiento la persona ya está resolviendo esto: el aviso
          repetía el título de la página con un botón a sí misma (D110). */}
      {viewer.value.participation &&
        !viewer.value.participation.canParticipate &&
        (viewer.value.participation.isSuspended ||
          !loc.url.pathname.startsWith("/consentimiento")) && (
          <aside
            class="border-b border-warn-500/30 bg-warn-100 px-4 py-3 text-sm text-warn-700 dark:bg-warn-950/30 dark:text-warn-400"
            aria-live="polite"
          >
            <div class="container-content flex flex-wrap items-center justify-between gap-3">
              <p>
                {translate(
                  locale.value,
                  viewer.value.participation.isSuspended
                    ? "Tu cuenta está suspendida. Podés seguir leyendo y administrar tus datos."
                    : // `can_participate()` (0044) también es falso con una baja
                      // en curso, y `my_legal_status` no lo distingue: afirmar
                      // que falta aceptar podía ser falso. Distinguirlo requiere
                      // exponer la baja en esa RPC (migración pendiente).
                      "Por ahora tu cuenta no puede participar. Si te falta aceptar los documentos vigentes, podés hacerlo desde acá.",
                )}
              </p>
              <Link
                href={
                  viewer.value.participation.isSuspended
                    ? "/perfil/apelacion"
                    : "/consentimiento"
                }
                class="inline-flex min-h-11 items-center rounded-xl border border-current px-3 font-semibold hover:underline"
              >
                {translate(
                  locale.value,
                  viewer.value.participation.isSuspended
                    ? "Ver suspensión y apelar"
                    : "Revisar documentos",
                )}
              </Link>
            </div>
          </aside>
        )}

      {/* `tabindex="-1"`: sin esto "Saltar al contenido" mueve el scroll pero
          no el foco en Safari ni en varios lectores de pantalla, y el siguiente
          Tab vuelve al principio del header. */}
      <main
        id="contenido"
        tabIndex={-1}
        class={
          accountFlow
            ? "flex-1 focus:outline-none"
            : "flex-1 pb-[var(--bottom-nav-height)] focus:outline-none"
        }
      >
        {/* Si una ruta explota al renderizar, sin esto Qwik descarta el árbol
            entero y queda una pantalla en blanco: ni header, ni pie, ni forma
            de irse a otro lado. Acá el error queda contenido en el `<main>` y
            el resto del cascarón sigue navegable.

            Cubre errores de render. Los `ev.error(403|404|500)` que lanzan los
            loaders son respuestas HTTP y las dibuja Qwik Router por su cuenta;
            eso es otro mecanismo y sigue sin página propia.

            Se recupera solo cuando el error vino de una navegación interna que
            terminó en otra URL (una redirección del servidor a mitad del dibujo,
            D115): el del router dejaba "Se rompió algo" para siempre. */}
        <RecoveringErrorBoundary>
          <Slot />
        </RecoveringErrorBoundary>
      </main>

      {accountFlow ? (
        <footer class="mt-6 border-t border-subtle">
          <div class="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 sm:px-6">
            <p class="text-sm text-ink-muted">
              {APP_NAME} · {translate(locale.value, APP_TAGLINE)}.
            </p>
            <nav
              aria-label={translate(locale.value, "Legal y ayuda")}
              class="flex flex-wrap gap-x-5"
            >
              {[
                ...FOOTER_SECTIONS[2].links,
                { href: "/manual", label: "Cómo funciona" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center text-xs text-ink-muted underline-offset-4 decoration-subtle transition-colors hover:text-brand hover:underline hover:decoration-brand-500"
                >
                  {translate(locale.value, link.label)}
                  {/* Abren otra pestaña para no perder el formulario. El
                      aviso visible va una vez, debajo; acá queda el texto
                      para lectores de pantalla (WCAG 3.2.5). Un ícono por
                      enlace eran ocho seguidos. */}
                  <span class="sr-only">
                    {" "}
                    {translate(locale.value, "(se abre en una pestaña nueva)")}
                  </span>
                </Link>
              ))}
            </nav>
            <p class="flex items-center gap-1.5 text-xs text-ink-faint">
              <Icon name="share" class="text-[0.95em]" />
              {translate(locale.value, "Se abren en una pestaña nueva.")}
            </p>
            <div class="pt-2">
              <AccessibilityToggle />
            </div>
          </div>
        </footer>
      ) : (
        <footer class="mt-16 border-t border-subtle bg-muted/50">
          <div class="container-content pt-8 pb-[calc(2rem+var(--bottom-nav-height)+var(--claim-actions-height,0px))]">
            {/* Pie compacto (D124): la marca con su frase y, a la derecha, los
              grupos de navegación en línea. Las cuatro columnas con quince
              enlaces eran un muro antes del final en el teléfono; los mismos
              enlaces caben en la mitad de alto. */}
            <div class="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div class="max-w-sm">
                <Logo />
                <p class="mt-2 text-sm text-ink-muted">
                  {translate(locale.value, APP_TAGLINE)}.
                </p>
              </div>

              <div class="flex flex-col gap-4 sm:flex-row sm:gap-10">
                {footerSections
                  .filter((section) => section.id !== "legal")
                  .map((section) => (
                    <nav key={section.id} aria-labelledby={`pie-${section.id}`}>
                      <h2
                        id={`pie-${section.id}`}
                        class="text-xs font-semibold uppercase tracking-wide text-ink-faint"
                      >
                        {translate(locale.value, section.title)}
                      </h2>
                      <ul class="mt-1 flex flex-wrap gap-x-4 text-sm sm:flex-col sm:gap-x-0">
                        {section.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              class="inline-flex min-h-9 items-center rounded-lg text-ink-muted underline-offset-4 decoration-subtle transition-colors hover:text-brand hover:underline hover:decoration-brand-500"
                            >
                              {translate(locale.value, link.label)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  ))}
              </div>
            </div>

            {/* Los legales en una sola línea que envuelve en el teléfono. Sin
              "·" entre enlaces: el punto vivía dentro de cada <li> y en el
              teléfono había renglones que empezaban con un punto suelto. El
              espacio separa igual, como en el pie de las pantallas de acceso. */}
            {footerSections
              .filter((section) => section.id === "legal")
              .map((section) => (
                <nav
                  key={section.id}
                  aria-labelledby={`pie-${section.id}`}
                  class="mt-6 border-t border-subtle pt-4"
                >
                  <h2 id={`pie-${section.id}`} class="sr-only">
                    {translate(locale.value, section.title)}
                  </h2>
                  <ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {section.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          class="inline-flex min-h-9 items-center rounded-lg underline-offset-4 decoration-subtle transition-colors hover:text-brand hover:underline hover:decoration-brand-500"
                        >
                          {translate(locale.value, link.label)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}

            <div class="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-faint">
              <p class="max-w-2xl">
                {APP_NAME} ·{" "}
                {translate(
                  locale.value,
                  "Proyecto abierto. Los reclamos y proyectos publicados acá son de sus autores; la plataforma da visibilidad, no garantiza resultados.",
                )}
              </p>
              <div class="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                <AccessibilityToggle />
                <div class="flex items-center gap-1.5">
                  <span>{translate(locale.value, "Atajos de teclado:")}</span>
                  <kbd class="inline-block select-none rounded border border-subtle bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink-strong shadow-2xs">
                    ?
                  </kbd>
                </div>
              </div>
            </div>
          </div>
        </footer>
      )}
      <GlobalShortcuts />
      <ToastContainer />
      {/* Los atajos de la paleta apuntan a la comunidad de residencia (la
          última de la cadena); sin residencia, a rutas generales. */}
      <CommandPalette
        homeSlug={viewer.value.residenceChain.at(-1)?.slug ?? null}
        signedIn={!!viewer.value.userId}
      />
      {!accountFlow && <BottomNav viewer={viewer.value} />}
    </div>
  );
});
