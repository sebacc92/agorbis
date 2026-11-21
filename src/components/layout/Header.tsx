import {
  $,
  component$,
  Slot,
  useOnDocument,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { Form, Link, useLocation } from "@qwik.dev/router";
import { Avatar, ButtonLink, Icon, cx } from "~/components/ui";
import { useSignOut } from "~/lib/auth-actions";
import { routes } from "~/lib/community";
import { APP_NAME } from "~/lib/constants";
import { clearPersonalLocalData } from "~/lib/local-data";
import { supportPageHref } from "~/lib/support";

/** Se resuelve una vez: es una constante del código, no cambia por pedido. */
const supportHref = supportPageHref();
import type { Viewer } from "~/lib/session";
import { CommunitySearch } from "./CommunitySearch";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { authEntryHref, signedInHome } from "~/lib/auth-navigation";
import { useLocale, translate } from "~/lib/i18n";

export const Logo = component$<{ class?: string }>(({ class: cls }) => (
  <span
    class={cx(
      "inline-flex items-center gap-2 font-semibold tracking-tight",
      cls,
    )}
  >
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      class="size-8 shrink-0 rounded-xl shadow-soft"
    >
      <rect width="64" height="64" rx="14" fill="#7c3aed" />
      <circle
        cx="32"
        cy="32"
        r="19"
        fill="none"
        stroke="#fff"
        stroke-width="3"
      />
      <ellipse
        cx="32"
        cy="32"
        rx="8.5"
        ry="19"
        fill="none"
        stroke="#fff"
        stroke-width="2.4"
      />
      <path
        d="M13.6 26h36.8M13.6 38h36.8"
        stroke="#fff"
        stroke-width="2.4"
        stroke-linecap="round"
      />
      <circle
        cx="41.5"
        cy="41.5"
        r="6.5"
        fill="#fbbf24"
        stroke="#7c3aed"
        stroke-width="3"
      />
    </svg>
    <span class="text-ink-strong">{APP_NAME}</span>
  </span>
));

/**
 * Link de navegación del header. Además de unificar el estilo, marca la sección
 * activa con `aria-current="page"`: sin eso el resaltado sólo existe para quien
 * puede verlo, y un lector de pantalla no tiene forma de saber dónde está.
 */
const NavLink = component$<{
  href: string;
  active: boolean;
  reload?: boolean;
}>(({ href, active, reload }) => (
  <Link
    href={href}
    reload={reload}
    aria-current={active ? "page" : undefined}
    class={cx(
      "rounded-2xl px-3 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-muted text-ink-strong"
        : "text-ink-muted hover:bg-muted hover:text-ink-strong",
    )}
  >
    <Slot />
  </Link>
));

/** Misma navegación, en formato de fila para el panel desplegable de móvil. */
const MobileNavLink = component$<{
  href: string;
  active: boolean;
  reload?: boolean;
}>(({ href, active, reload }) => (
  <Link
    href={href}
    reload={reload}
    aria-current={active ? "page" : undefined}
    class={cx(
      "flex min-h-11 items-center rounded-xl px-3 text-sm font-medium transition-colors",
      active
        ? "bg-muted text-ink-strong"
        : "text-ink-muted hover:bg-muted hover:text-ink-strong",
    )}
  >
    <Slot />
  </Link>
));

export const Header = component$<{ viewer: Viewer }>(({ viewer }) => {
  const menuOpen = useSignal(false);
  const navOpen = useSignal(false);
  const menuTrigger = useSignal<HTMLButtonElement>();
  const navTrigger = useSignal<HTMLButtonElement>();
  const headerRef = useSignal<HTMLElement>();
  const signOut = useSignOut();
  const loc = useLocation();
  const locale = useLocale();

  // La comunidad más específica del usuario: su "casa" en la app.
  const home = viewer.residenceChain.at(-1);
  const isActive = (href: string) => loc.url.pathname.startsWith(href);
  const homeHref = home ? routes.community(home.slug) : null;

  // Al navegar, los paneles se cierran solos. Qwik Router no desmonta el header
  // entre rutas, así que sin esto el menú queda abierto sobre la página nueva.
  useTask$(({ track }) => {
    track(() => loc.url.pathname);
    track(() => loc.url.search);
    menuOpen.value = false;
    navOpen.value = false;
  });

  // Escape cierra el panel abierto y devuelve el foco al botón que lo abrió:
  // si el foco se quedara en el panel destruido, saltaría al principio del
  // documento y se perdería el lugar de lectura.
  useOnDocument(
    "keydown",
    $((event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (menuOpen.value) {
        menuOpen.value = false;
        menuTrigger.value?.focus();
      }
      if (navOpen.value) {
        navOpen.value = false;
        navTrigger.value?.focus();
      }
    }),
  );

  // Un click fuera del header cierra ambos paneles. No se devuelve el foco acá:
  // el usuario ya lo movió a donde quiso ir.
  useOnDocument(
    "pointerdown",
    $((event: PointerEvent) => {
      if (!menuOpen.value && !navOpen.value) return;
      const target = event.target as Node | null;
      if (target && headerRef.value?.contains(target)) return;
      menuOpen.value = false;
      navOpen.value = false;
    }),
  );

  /**
   * Lo mismo con el teclado.
   *
   * Un menú desplegable de navegación no lleva trampa de foco —eso es para
   * diálogos modales, que bloquean el resto de la página—: lo correcto es que
   * el Tab siga de largo. Pero el panel quedaba abierto y flotando sobre el
   * contenido después de que el foco ya se había ido, sin forma de cerrarlo
   * salvo Escape. Salir tabulando ahora lo cierra, igual que salir con el
   * mouse.
   */
  useOnDocument(
    "focusin",
    $((event: FocusEvent) => {
      if (!menuOpen.value && !navOpen.value) return;
      const target = event.target as Node | null;
      if (target && headerRef.value?.contains(target)) return;
      menuOpen.value = false;
      navOpen.value = false;
    }),
  );

  return (
    <header
      ref={headerRef}
      class="sticky top-0 z-40 border-b border-subtle bg-app/85 backdrop-blur-md"
    >
      <div class="container-content flex h-16 items-center gap-3">
        {/* El botón de menú va primero para que sea lo primero que se tabula
            en móvil, que es donde es la única puerta a la navegación. */}
        <button
          ref={navTrigger}
          type="button"
          class="-ml-1 grid size-11 shrink-0 place-items-center rounded-2xl text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong lg:hidden"
          aria-expanded={navOpen.value}
          aria-controls={navOpen.value ? "menu-navegacion" : undefined}
          aria-label={translate(
            locale,
            navOpen.value ? "Cerrar menú" : "Abrir menú",
          )}
          onClick$={() => {
            navOpen.value = !navOpen.value;
            menuOpen.value = false;
            /* El panel se dibuja al final del `<header>`: al abrirlo, el
               siguiente Tab no iba al menú sino al logo, al buscador y a la
               campana, y recién después al menú recién abierto. Se le pasa el
               foco al panel —no al primer campo, que en un teléfono levantaría
               el teclado sin que nadie lo pidiera—. */
            if (navOpen.value) {
              requestAnimationFrame(() =>
                document.getElementById("menu-navegacion")?.focus(),
              );
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            class="size-5"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            {navOpen.value ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>

        <Link
          href={signedInHome(viewer) ?? "/"}
          aria-label={`${APP_NAME} · ${translate(locale, "Inicio")}`}
          class="min-w-0"
        >
          <Logo class="max-w-full [&>span]:truncate" />
        </Link>

        {/* Desde `lg` y no desde `xl`: entre 1024 y 1279 px la navegación
            quedaba escondida tras el menú aunque había lugar, y para hacerle
            lugar se fueron los duplicados (D96). */}
        <nav
          aria-label={translate(locale, "Principal")}
          class="ml-2 hidden items-center gap-1 lg:flex"
        >
          {viewer.userId && (
            <NavLink href="/inicio" active={isActive("/inicio")}>
              {translate(locale, "Inicio")}
            </NavLink>
          )}
          <NavLink href="/explorar" active={isActive("/explorar")}>
            {translate(locale, "Explorar")}
          </NavLink>
          <NavLink href="/manual" active={isActive("/manual")}>
            {translate(locale, "Cómo funciona")}
          </NavLink>
          {homeHref && (
            <NavLink href={homeHref} active={loc.url.pathname === homeHref}>
              <span aria-hidden="true" class="mr-1">
                {home?.emoji}
              </span>
              {translate(locale, "Mi comunidad")}
            </NavLink>
          )}
          {viewer.isModerator && (
            <NavLink href="/moderacion" active={isActive("/moderacion")} reload>
              {translate(locale, "Moderación")}
            </NavLink>
          )}
        </nav>

        {/* El buscador ocupa el espacio libre: con miles de comunidades,
              por la jerarquía a mano dejó de alcanzar. */}
        <div class="ml-auto hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex">
          {/* Un solo campo (D124): el atajo ⌘K vive adentro del buscador y
              abre la paleta; el botón separado repetía la entrada. */}
          <CommunitySearch palette />
        </div>

        <div class="ml-auto flex items-center gap-1.5 md:ml-3">
          {/* En teléfonos estas preferencias viven en el panel: así la marca
              y las acciones principales no compiten por unos pocos píxeles.
              Con sesión pasan al menú de la cuenta, que necesita el lugar. */}
          {!viewer.profile && (
            <div class="hidden items-center gap-1.5 md:flex">
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          )}

          {viewer.profile ? (
            <>
              {/* Acá había además un chip con la comunidad propia, que
                  repetía "Mi comunidad" de la navegación. */}
              <Link
                href="/notificaciones"
                aria-label={
                  viewer.unreadNotifications > 0
                    ? translate(locale, "{{count}} notificaciones sin leer", {
                        count: viewer.unreadNotifications,
                      })
                    : translate(locale, "Notificaciones")
                }
                aria-current={isActive("/notificaciones") ? "page" : undefined}
                class="relative grid size-11 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong aria-[current=page]:bg-muted aria-[current=page]:text-ink-strong"
              >
                {/* Era el emoji 🔔: cada sistema lo dibuja distinto —en
                    Windows sale plano y gris, en Android naranja— y quedaba
                    fuera de tono al lado de los íconos trazados del resto del
                    header. Mismo trazo que el menú y el buscador. */}
                <Icon name="bell" class="text-xl" />
                {viewer.unreadNotifications > 0 && (
                  /* Un punto, no un contador (D124): la cantidad exacta ya la
                     dice el nombre accesible y la página de notificaciones;
                     en el header alcanza con saber que hay algo nuevo. */
                  <span
                    aria-hidden="true"
                    class="absolute right-2 top-2 size-2 rounded-full bg-kind-claim ring-2 ring-surface"
                  />
                )}
              </Link>
              <div class="relative">
                <button
                  ref={menuTrigger}
                  type="button"
                  class="flex min-h-11 items-center gap-2 rounded-xl p-1 pr-2 transition-all duration-150 hover:bg-muted active:scale-95 touch-manipulation"
                  aria-expanded={menuOpen.value}
                  aria-controls={menuOpen.value ? "menu-usuario" : undefined}
                  /* El nombre visible entra en el nombre accesible (WCAG
                     2.5.3): en móvil el `<span>` se oculta y sin esto el
                     botón se quedaba sin etiqueta. */
                  aria-label={translate(locale, "Menú de {{name}}", {
                    name:
                      viewer.profile.display_name ?? viewer.profile.username,
                  })}
                  onClick$={() => {
                    menuOpen.value = !menuOpen.value;
                    navOpen.value = false;
                    /* El panel se dibuja después del botón, así que el Tab
                       siguiente igual caía adentro; pero con lector de
                       pantalla abrir un menú y que el foco se quede en el
                       disparador no anuncia que haya aparecido nada. Se lleva
                       el foco al primer ítem, como ya hace el panel de móvil.
                       Escape lo devuelve al botón. */
                    if (menuOpen.value) {
                      requestAnimationFrame(() =>
                        document
                          .getElementById("menu-usuario")
                          ?.querySelector<HTMLAnchorElement>("a")
                          ?.focus(),
                      );
                    }
                  }}
                >
                  <Avatar
                    src={viewer.profile.avatar_url}
                    name={
                      viewer.profile.display_name ?? viewer.profile.username
                    }
                    priority
                  />
                  {/* Avatar y nombre corto (D124): "Sebastian Cardoso
                      Castillo" entero ocupaba el lugar de la navegación. La
                      primera palabra alcanza para reconocerse; el nombre
                      completo sigue en el `aria-label`, el `title` y el menú. */}
                  <span
                    class="hidden max-w-32 truncate text-sm font-medium text-ink-strong lg:block"
                    title={
                      viewer.profile.display_name ?? viewer.profile.username
                    }
                  >
                    {
                      (viewer.profile.display_name ?? viewer.profile.username)
                        .trim()
                        .split(/\s+/)[0]
                    }
                  </span>
                </button>

                {menuOpen.value && (
                  <nav
                    id="menu-usuario"
                    aria-label={translate(locale, "Cuenta")}
                    class="animate-scale-pop absolute right-0 top-full mt-2 w-64 rounded-2xl border border-subtle bg-surface/95 backdrop-blur-md p-1.5 shadow-lift"
                  >
                    <div class="px-3 py-2">
                      <p class="truncate text-sm font-medium text-ink-strong">
                        @{viewer.profile.username}
                      </p>
                      {home && (
                        <p class="truncate text-xs text-ink-muted">
                          {home.emoji} {home.name}
                        </p>
                      )}
                    </div>
                    <div class="my-1 h-px bg-[var(--border-subtle)]" />
                    {/* Inicio, Explorar y Buscar ya están en la barra y en la
                        navegación; acá queda lo que es de la cuenta. */}
                    {!home && (
                      <Link
                        href="/perfil/residencia"
                        class="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-brand transition-colors hover:bg-muted"
                        onClick$={() => (menuOpen.value = false)}
                      >
                        {translate(locale, "Elegir barrio de residencia")}
                      </Link>
                    )}
                    <Link
                      href="/perfil"
                      class="flex min-h-11 items-center rounded-xl px-3 text-sm text-ink transition-colors hover:bg-muted"
                      onClick$={() => (menuOpen.value = false)}
                    >
                      {translate(locale, "Mi perfil")}
                    </Link>
                    <Link
                      href="/instituciones"
                      class="flex min-h-11 items-center rounded-xl px-3 text-sm text-ink transition-colors hover:bg-muted"
                      onClick$={() => (menuOpen.value = false)}
                    >
                      {translate(locale, "Instituciones")}
                    </Link>
                    {/* Quien ya participa es quien más probablemente
                        aporte, y el pie le queda lejos. Se apaga junto con
                        el pie si no hay enlace válido (D128). */}
                    {supportHref && (
                      <Link
                        href={supportHref}
                        class="flex min-h-11 items-center rounded-xl px-3 text-sm text-ink transition-colors hover:bg-muted"
                        onClick$={() => (menuOpen.value = false)}
                      >
                        {translate(locale, "Apoyar a Agorbis")}
                      </Link>
                    )}
                    {/* Sin `overflow-hidden` en el menú: recortaba el
                        desplegable de idiomas que se abre desde acá. */}
                    <div class="hidden items-center justify-between gap-2 px-3 py-2 md:flex">
                      <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                        {translate(locale, "Preferencias")}
                      </span>
                      <div class="flex items-center gap-1.5">
                        <LanguageSwitcher />
                        <ThemeToggle />
                      </div>
                    </div>
                    {/* Lo personal guardado en el navegador (borradores,
                        reacciones, búsquedas) se va con la sesión: en un
                        dispositivo compartido lo heredaría quien entre
                        después. Se limpia antes de que salga el pedido. */}
                    <Form
                      action={signOut}
                      reloadDocument
                      onSubmit$={() => {
                        clearPersonalLocalData();
                      }}
                    >
                      <button
                        type="submit"
                        class="min-h-11 w-full rounded-xl px-3 text-left text-sm text-danger transition-colors hover:bg-muted"
                      >
                        {translate(locale, "Cerrar sesión")}
                      </button>
                    </Form>
                  </nav>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href={authEntryHref("/ingresar", loc.url)}
                class="hidden min-h-11 items-center rounded-2xl px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-muted hover:text-ink-strong md:flex"
              >
                {translate(locale, "Ingresar")}
              </Link>
              <ButtonLink href={authEntryHref("/registro", loc.url)} size="sm">
                {translate(locale, "Sumate")}
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- Panel de móvil */}
      {navOpen.value && (
        <div
          id="menu-navegacion"
          role="group"
          tabIndex={-1}
          aria-label={translate(locale, "Menú")}
          class="scrollbar-slim max-h-[calc(100dvh-4rem)] animate-fade-in overflow-y-auto overscroll-contain border-t border-subtle bg-surface focus:outline-none lg:hidden"
        >
          <div class="container-content space-y-1 py-3">
            {/* El buscador está oculto en el header por falta de ancho; acá
                recupera su lugar en vez de desaparecer del teléfono. */}
            <div class="pb-2 md:hidden">
              <CommunitySearch />
            </div>

            <nav
              aria-label={translate(locale, "Principal")}
              class="flex flex-col gap-1"
            >
              {viewer.userId && (
                <MobileNavLink href="/inicio" active={isActive("/inicio")}>
                  {translate(locale, "Inicio")}
                </MobileNavLink>
              )}
              <MobileNavLink href="/explorar" active={isActive("/explorar")}>
                {translate(locale, "Explorar")}
              </MobileNavLink>
              <MobileNavLink href="/manual" active={isActive("/manual")}>
                {translate(locale, "Cómo funciona")}
              </MobileNavLink>
              {homeHref && (
                <MobileNavLink
                  href={homeHref}
                  active={loc.url.pathname === homeHref}
                >
                  <span aria-hidden="true" class="mr-1.5">
                    {home?.emoji}
                  </span>
                  {translate(locale, "Mi comunidad")}
                </MobileNavLink>
              )}
              {viewer.isModerator && (
                <MobileNavLink
                  href="/moderacion"
                  active={isActive("/moderacion")}
                  reload
                >
                  {translate(locale, "Moderación")}
                </MobileNavLink>
              )}
              {!viewer.profile && (
                <MobileNavLink
                  href={authEntryHref("/ingresar", loc.url)}
                  active={isActive("/ingresar")}
                >
                  {translate(locale, "Ingresar")}
                </MobileNavLink>
              )}
            </nav>

            <div class="mt-2 flex items-center justify-between border-t border-subtle px-3 pt-3 md:hidden">
              <span class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {translate(locale, "Preferencias")}
              </span>
              <div class="flex items-center gap-1.5">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
});
