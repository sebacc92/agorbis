import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { AuthShell } from "./AuthShell";

/**
 * D121, mejora 2: el registro abría sin decir que el alta son cinco pasos.
 * Con la bienvenida a un lado no hay columna para el recorrido completo, así
 * que la línea compacta va arriba del título en cualquier ancho.
 */
const Fixture = component$<{ welcome: boolean; progress?: 0 | 2 }>(
  ({ welcome, progress }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider url="https://agorbis.test/registro/">
        <AuthShell title="Creá tu cuenta" welcome={welcome} progress={progress}>
          <span id="contenido" />
        </AuthShell>
      </QwikRouterMockProvider>
    );
  },
);

describe("AuthShell", () => {
  it("con bienvenida y progreso muestra la línea compacta del paso, sin la columna", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture welcome progress={0} />);
    const nav = screen.querySelector('nav[aria-label="Progreso del registro"]');
    expect(nav?.textContent).toContain("Paso 1 de 5");
    expect(nav?.textContent).toContain("Creá tu cuenta");
    expect(nav?.querySelector("ol")).toBeFalsy();
    // La línea va antes del título, dentro de la misma columna.
    const heading = screen.querySelector("#auth-heading");
    expect(
      nav && heading
        ? // 4 = DOCUMENT_POSITION_FOLLOWING; el DOM de pruebas no expone `Node`.
          nav.compareDocumentPosition(heading) & 4
        : 0,
    ).toBeTruthy();
    expect(screen.querySelector("aside nav")).toBeFalsy();
  });

  it("sin bienvenida, el progreso conserva su columna con el recorrido entero", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture welcome={false} progress={2} />);
    const nav = screen.querySelector('aside nav[aria-label="Progreso del registro"]');
    expect(nav).toBeTruthy();
    expect(nav?.querySelector("ol")).toBeTruthy();
    expect(nav?.textContent).toContain("Paso 3 de 5");
  });

  it("sin progreso no dibuja ningún recorrido", async () => {
    const { render, screen } = await createDOM();
    await render(<Fixture welcome />);
    expect(screen.querySelector('nav[aria-label="Progreso del registro"]')).toBeFalsy();
  });
});
