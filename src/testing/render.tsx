import {
  component$,
  Slot,
  useContextProvider,
  type JSXOutput,
} from "@qwik.dev/core";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { ssrRenderToDom } from "@qwik.dev/core/testing";
import { LocaleContext, type Locale } from "~/lib/i18n";

/**
 * Envoltorio que provee el contexto de idioma.
 *
 * Casi todos los componentes de la app llaman a `useLocale()`, que lee un
 * contexto que en la app real provee `routes/layout.tsx`. Renderizar uno
 * suelto sin ese proveedor falla con `Q8: Actual value for
 * useContext(agorbis.locale) can not be found` — un error de plomería que no
 * dice nada sobre el componente.
 */
const ConLocale = component$<{ locale: Locale }>(({ locale }) => {
  useContextProvider(LocaleContext, locale);
  return <Slot />;
});

/**
 * Renderiza un componente como lo haría el servidor, con el idioma puesto.
 *
 * `es` por defecto porque es `DEFAULT_LOCALE` y porque `translate()` devuelve
 * la cadena original en ese idioma: así una prueba afirma sobre el texto que
 * está escrito en el código, sin depender de la tabla de traducciones.
 */
export function renderWithLocale(jsx: JSXOutput, locale: Locale = "es") {
  return ssrRenderToDom(
    <QwikRouterMockProvider url="http://localhost/">
      <ConLocale locale={locale}>{jsx}</ConLocale>
    </QwikRouterMockProvider>,
  );
}
