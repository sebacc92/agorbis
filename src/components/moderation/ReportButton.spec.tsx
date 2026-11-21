import { component$, useContextProvider } from "@qwik.dev/core";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { renderWithLocale } from "~/testing/render";
import { ReportButton } from "./ReportButton";

const id = "a0000000-0000-4000-8000-000000000001";
const Example = component$<{ authenticated: boolean; requested: boolean }>(
  ({ authenticated, requested }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url={`http://localhost/reclamos/${id}?categoria=salud${requested ? `&reportar=claim%3A${id}` : ""}#contexto`}
      >
        <ReportButton
          targetType="claim"
          targetId={id}
          isAuthenticated={authenticated}
        />
      </QwikRouterMockProvider>
    );
  },
);

describe("reporte accesible para visitantes", () => {
  it("ofrece ingreso y conserva el destino en lugar de ocultar toda la acción", async () => {
    const { document } = await renderWithLocale(
      <Example authenticated={false} requested={false} />,
    );
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href^="/ingresar"]',
    )!;
    expect(link.textContent).toContain("Ingresá para reportar este contenido");
    const next = new URL(
      link.getAttribute("href")!,
      "http://localhost",
    ).searchParams.get("next")!;
    expect(next).toContain("categoria=salud");
    expect(next).toContain(`reportar=claim%3A${id}`);
    expect(next).toContain("#contexto");
    expect(document.querySelector("form")).toBeFalsy();
  });

  it("abre sólo el reporte pedido y explica que todavía falta enviarlo", async () => {
    const { document } = await renderWithLocale(
      <Example authenticated requested />,
    );
    expect(
      document.querySelector<HTMLDetailsElement>(`#reporte-${id}`)?.open,
    ).toBe(true);
    expect(
      document.querySelector(`summary[aria-controls="reporte-form-${id}"]`),
    ).toBeTruthy();
    expect(
      document.querySelector(`#reporte-form-${id}`)?.className,
    ).not.toContain("hidden");
    expect(document.body.textContent).toContain(
      "Volviste para reportar este contenido",
    );
    expect(document.body.textContent).not.toContain("Reporte enviado. Gracias");
  });

  it("mantiene cerrado el reporte cuando no hay una intención para ese contenido", async () => {
    const { document } = await renderWithLocale(
      <Example authenticated requested={false} />,
    );
    expect(
      document.querySelector<HTMLDetailsElement>(`#reporte-${id}`)?.open,
    ).toBe(false);
    // El HTML incluye el formulario aun sin ejecutar el evento de apertura.
    expect(
      document
        .querySelector('form input[name="target_id"]')
        ?.getAttribute("value"),
    ).toBe(id);
    expect(document.querySelector('textarea[name="reason"]')).toBeTruthy();
  });
});
