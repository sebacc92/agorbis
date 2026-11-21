import {
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { Avatar, Icon, Modal, cx } from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { authEntryHref } from "~/lib/auth-navigation";
import { publicationEntryHref } from "~/lib/publication-entry";
import { routes } from "~/lib/community";
import { useLocale, translate } from "~/lib/i18n";
import type { Viewer } from "~/lib/session";
import { publicationCommunity } from "~/lib/publication-eligibility";

export interface BottomNavProps {
  viewer: Viewer;
}

/* Ícono y color salen de la tabla única de tipos (D123); acá sólo queda lo
   propio de este selector: la descripción y la ruta del formulario. */
const PUBLICATION_TYPES = [
  {
    title: "Encuesta",
    description: "Consultá las prioridades de tu comunidad.",
    path: "encuestas/nueva",
    type: "poll",
  },
  {
    title: "Debate",
    description: "Abrí una conversación para intercambiar ideas.",
    path: "debates/nuevo",
    type: "debate",
  },
  {
    title: "Reclamo",
    description: "Hacé visible un problema y reuní apoyo.",
    path: "reclamos/nuevo",
    type: "claim",
  },
  {
    title: "Proyecto",
    description: "Proponé un plan con etapas y recursos.",
    path: "proyectos/nuevo",
    type: "project",
  },
] as const;

/**
 * Con cinco accesos, "Mi comunidad" y "Notificaciones" ocupan casi todo su
 * lugar, y cuánto depende de la fuente del sistema: en 390 px entraban por
 * 2 px con Noto Sans, mientras que con DejaVu Sans (la del runner de la CI)
 * "Mi comunidad" pasaba a dos líneas y "Notificaciones" se salía 3 px sobre
 * el acceso vecino. El espaciado algo más apretado y el ancho fijo de
 * Publicar les dan margen real; con la letra ampliada, "Mi comunidad" sigue
 * pudiendo pasar a dos líneas centradas.
 */
const NAV_LABEL = "max-w-full text-center leading-tight tracking-tight";

export const BottomNav = component$<BottomNavProps>(({ viewer }) => {
  const loc = useLocation();
  const locale = useLocale();
  const nav = useSignal<HTMLElement>();
  const showPublish = useSignal(false);

  // Cerrar después de navegar: desmontar el Link en su propio clic impide
  // que el router termine de procesar la selección.
  useTask$(({ track }) => {
    track(() => loc.url.pathname);
    showPublish.value = false;
  });

  // La barra contextual del reclamo se apoya sobre la altura real de esta
  // navegación, incluyendo texto ampliado y el área segura del teléfono.
  // eslint-disable-next-line qwik/no-use-visible-task -- requiere medir el DOM
  useVisibleTask$(({ cleanup }) => {
    const element = nav.value;
    if (!element) return;
    const measure = () => {
      document.documentElement.style.setProperty(
        "--bottom-nav-height",
        `${element.getBoundingClientRect().height}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    cleanup(() => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--bottom-nav-height");
    });
  });

  const pathname = loc.url.pathname.replace(/\/$/, "") || "/";
  const home = viewer.residenceChain.at(-1);
  const homeHref = home ? routes.community(home.slug) : null;
  const homeActive =
    !!homeHref &&
    (pathname === homeHref || pathname.startsWith(`${homeHref}/`));
  const itemClass = (active: boolean, extra?: string) =>
    cx(
      "relative flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-2xs font-medium transition-all active:scale-95 touch-manipulation",
      // La activa se marca con el color y una raya arriba, no con negrita:
      // en negrita "Mi comunidad" no entraba en su lugar y pasaba a dos
      // líneas, y el color solo no alcanza para quien no lo distingue.
      "before:absolute before:top-0 before:h-0.5 before:w-6 before:rounded-full before:bg-current before:opacity-0 aria-[current=page]:before:opacity-100",
      active ? "text-brand" : "text-ink-muted hover:text-ink-strong",
      extra,
    );
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/inicio") return pathname === "/inicio" || pathname === "/";
    return pathname.startsWith(href);
  };

  // Si la visita es ajena, usa la residencia. Sin residencia, la ruta de
  // creación lleva primero al onboarding, antes de mostrar campos para editar.
  const communityMatch = pathname.match(/^\/c\/([^/]+)/);
  const destination = publicationCommunity(
    viewer.residenceChain,
    communityMatch?.[1],
  );
  const communitySlug = destination?.slug ?? communityMatch?.[1];
  const usesResidence =
    !!destination && destination.slug !== communityMatch?.[1];

  return (
    <>
      <nav
        ref={nav}
        aria-label={translate(locale, "Navegación principal inferior")}
        class="fixed inset-x-0 bottom-0 z-40 border-t border-subtle/80 bg-surface/90 px-1 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-lg md:hidden dark:shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
      >
        <div class="mx-auto flex max-w-md items-center justify-around">
          {/* Inicio */}
          <Link
            href={viewer.userId ? "/inicio" : "/"}
            aria-current={
              isActive(viewer.userId ? "/inicio" : "/") ? "page" : undefined
            }
            class={itemClass(isActive(viewer.userId ? "/inicio" : "/"))}
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6h-4v6H4a1 1 0 01-1-1v-9.5z" />
            </svg>
            <span class={NAV_LABEL}>{translate(locale, "Inicio")}</span>
          </Link>

          {/* Quien ya vive en una comunidad vuelve a ella todos los días y sólo
              la encontraba en el menú. Explorar sigue en el menú y en la
              cabecera; para quien todavía no eligió, sigue acá. */}
          {homeHref ? (
            <Link
              href={homeHref}
              aria-current={homeActive ? "page" : undefined}
              class={itemClass(homeActive)}
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
                <circle cx="12" cy="9.5" r="2.5" />
              </svg>
              <span class={NAV_LABEL}>{translate(locale, "Mi comunidad")}</span>
            </Link>
          ) : (
            <Link
              href="/explorar"
              aria-current={isActive("/explorar") ? "page" : undefined}
              class={itemClass(isActive("/explorar"))}
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" />
              </svg>
              <span class={NAV_LABEL}>{translate(locale, "Explorar")}</span>
            </Link>
          )}

          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={showPublish.value}
            onClick$={() => {
              showPublish.value = true;
            }}
            // Ancho fijo: el círculo mide 56 px con su anillo y "Publicar"
            // es corta. Repartido en partes iguales se quedaba con espacio
            // que a "Mi comunidad" y "Notificaciones" les faltaba.
            class="group flex min-h-12 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-2xs font-semibold text-brand touch-manipulation active:scale-95"
          >
            <span class="grid size-12 place-items-center rounded-full bg-brand-600 text-white shadow-soft ring-4 ring-surface transition-all duration-150 group-hover:shadow-lift dark:bg-brand-600">
              <svg
                viewBox="0 0 24 24"
                class="size-6"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span class={NAV_LABEL}>{translate(locale, "Publicar")}</span>
          </button>

          {viewer.userId ? (
            <>
              {/* Notificaciones */}
              <Link
                href="/notificaciones"
                aria-current={isActive("/notificaciones") ? "page" : undefined}
                class={itemClass(isActive("/notificaciones"), "relative")}
              >
                <div class="relative">
                  <svg
                    viewBox="0 0 24 24"
                    class="size-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 8.5a6 6 0 10-12 0c0 4.5-1.5 5.5-2 6.5h16c-.5-1-2-2-2-6.5z" />
                    <path d="M10.2 19a2 2 0 003.6 0" />
                  </svg>
                  {viewer.unreadNotifications > 0 && (
                    <span
                      aria-hidden="true"
                      class="absolute -right-2 -top-1 flex size-4 items-center justify-center rounded-full bg-danger-600 text-[0.5625rem] font-bold text-white"
                    >
                      {viewer.unreadNotifications > 9
                        ? "9+"
                        : viewer.unreadNotifications}
                    </span>
                  )}
                </div>
                <span class={NAV_LABEL}>
                  {translate(locale, "Notificaciones")}
                </span>
              </Link>

              {/* Perfil */}
              <Link
                href="/perfil"
                aria-current={isActive("/perfil") ? "page" : undefined}
                class={itemClass(isActive("/perfil"))}
              >
                {viewer.profile ? (
                  <Avatar
                    size="sm"
                    src={viewer.profile.avatar_url}
                    name={
                      viewer.profile.display_name ?? viewer.profile.username
                    }
                  />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    class="size-5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                )}
                <span class={NAV_LABEL}>{translate(locale, "Perfil")}</span>
              </Link>
            </>
          ) : (
            // Sin sesión, Avisos y Perfil llevaban los dos a ingresar: un solo
            // acceso dice lo que hace y vuelve a la página actual.
            <Link
              href={authEntryHref("/ingresar", loc.url)}
              class={itemClass(false)}
            >
              <svg
                viewBox="0 0 24 24"
                class="size-5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span class={NAV_LABEL}>{translate(locale, "Ingresar")}</span>
            </Link>
          )}
        </div>
      </nav>
      {showPublish.value && (
        <Modal
          open
          title={translate(locale, "¿Qué querés publicar?")}
          onClose$={() => {
            showPublish.value = false;
          }}
        >
          {communitySlug ? (
            <>
              <p class="mb-4 text-sm text-ink-muted">
                {communityMatch && !usesResidence
                  ? translate(
                      locale,
                      "Publicarás en la comunidad que estás visitando.",
                    )
                  : translate(locale, "Publicarás en {{community}}.", {
                      community: destination!.name,
                    })}
              </p>
              {viewer.userId && communityMatch && usesResidence && (
                <p
                  role="status"
                  class="mb-4 rounded-xl bg-muted p-3 text-sm text-ink-muted"
                >
                  {translate(
                    locale,
                    "Tu residencia declarada no pertenece a la comunidad que estás visitando. Para publicar, usamos {{name}}.",
                    { name: destination!.name },
                  )}
                </p>
              )}
              <ul class="space-y-2">
                {PUBLICATION_TYPES.map((type) => (
                  <li key={type.path}>
                    <Link
                      href={publicationEntryHref({
                        communitySlug,
                        type: type.type,
                        isAuthenticated: !!viewer.userId,
                        hasResidence: !!viewer.profile?.home_community_id,
                        // `destination` sale de la cadena de residencia: si
                        // existe, la persona vive en esa comunidad. Con
                        // residencia siempre existe (cae a la propia), así que
                        // desde acá nunca se llega al selector `/publicar`.
                        isMember: !!destination,
                      })}
                      class="flex min-h-16 items-center gap-3 rounded-2xl border border-subtle px-4 py-3 transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-brand-950/40"
                    >
                      <span
                        class={cx(
                          "grid size-11 shrink-0 place-items-center rounded-full text-xl",
                          CONTENT_KIND_TONES[type.type].badge,
                        )}
                        aria-hidden="true"
                      >
                        <Icon name={CONTENT_KINDS[type.type].icon} />
                      </span>
                      <span class="min-w-0">
                        <span class="block font-semibold text-ink-strong">
                          {translate(locale, type.title)}
                        </span>
                        <span class="mt-0.5 block text-sm text-ink-muted">
                          {translate(locale, type.description)}
                        </span>
                      </span>
                      <Icon name="arrow-right" class="ms-auto text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div class="space-y-4">
              <p class="text-sm leading-6 text-ink-muted">
                {translate(
                  locale,
                  "Primero elegí una comunidad. Desde allí podrás crear una encuesta, un debate, un reclamo o un proyecto.",
                )}
              </p>
              <Link
                href="/explorar"
                onClick$={() => {
                  if (pathname === "/explorar") showPublish.value = false;
                }}
                class="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
              >
                {translate(locale, "Explorar comunidades")}
              </Link>
            </div>
          )}
        </Modal>
      )}
    </>
  );
});
