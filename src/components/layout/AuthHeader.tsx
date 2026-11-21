import { component$ } from "@qwik.dev/core";
import { Link, useLocation } from "@qwik.dev/router";
import { Logo } from "./Header";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useLocale, translate } from "~/lib/i18n";
import { withAuthNext } from "~/lib/auth-navigation";

export const AuthHeader = component$<{ signedIn: boolean }>(({ signedIn }) => {
  const locale = useLocale();
  const location = useLocation();
  const login = location.url.pathname.replace(/\/$/, "") === "/ingresar";
  const accountHref = signedIn
    ? "/perfil"
    : withAuthNext(
        login ? "/registro" : "/ingresar",
        location.url.searchParams.get("next"),
      );
  return (
    <header class="border-b border-subtle bg-app/85">
      <div class="mx-auto flex h-18 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          href="/"
          aria-label={translate(locale, "Ir al inicio")}
          class="shrink-0"
        >
          {/* A 320 px el isotipo, el idioma, el tema y "Ingresá" no entran
              con la marca escrita: con las fuentes del runner de CI el
              encabezado desbordaba la página. El nombre vuelve desde 360 px;
              el enlace conserva su etiqueta accesible. */}
          <Logo class="[&>span]:hidden min-[360px]:[&>span]:inline" />
        </Link>
        <div class="flex items-center gap-1 sm:gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href={accountHref}
            class="inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-brand hover:bg-muted sm:px-3"
          >
            {translate(
              locale,
              signedIn ? "Mi cuenta" : login ? "Crear cuenta" : "Ingresá",
            )}
          </Link>
        </div>
      </div>
    </header>
  );
});
