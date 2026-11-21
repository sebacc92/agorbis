import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { SourceAction, InstitutionalResponseAction, RelationAction } from "~/lib/extension-actions";
import { ContentExtensionsPanel } from "./ContentExtensionsPanel";

vi.mock("@qwik.dev/router", async (original) => ({ ...await original<typeof import("@qwik.dev/router")>(), useLocation: () => ({ url: new URL("https://agorbis.test/proyectos/one?q=contexto&qaction=old"), isNavigating: false }) }));
const action = { actionPath: "?qaction=action", value: undefined, isRunning: false, formData: undefined };
const Example = component$<{ failed: boolean; canManage?: boolean }>(({ failed, canManage = false }) => {
  useContextProvider(LocaleContext, "es");
  return <ContentExtensionsPanel type="project" id="one" canManage={canManage}
    addSource={action as unknown as SourceAction} respond={action as unknown as InstitutionalResponseAction} addRelation={action as unknown as RelationAction}
    data={{ sources: [], responses: [], related: [], myOrganizations: [], loadFailures: { sources: failed, responses: failed, representation: failed, related: failed } }} />;
});
describe("errores recuperables de extensiones", () => {
  it("no afirma ausencia de fuentes, respuestas o representación cuando falló la lectura", async () => {
    const { render, screen } = await createDOM();
    await render(<Example failed />);
    expect(screen.textContent).toContain("No pudimos cargar todas las fuentes");
    expect(screen.textContent).toContain("Esto no significa que no haya respuestas");
    expect(screen.textContent).toContain("No pudimos consultar tu representación");
    expect(screen.textContent).not.toContain("todavía no tiene fuentes adjuntas");
    expect(screen.textContent).not.toContain("Todavía no se vinculó");
    expect(screen.querySelectorAll("form")).toHaveLength(0);
    const links = Array.from(screen.querySelectorAll("a"));
    expect(links).toHaveLength(4);
    expect(links.every((link) => link.getAttribute("href")?.startsWith("/proyectos/one?q=contexto#"))).toBe(true);
  });
  it("una lectura correcta sin filas conserva los vacíos reales para quien puede completarlos", async () => {
    // Los formularios de quien puede sumar enfocan con `requestAnimationFrame`.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => clearTimeout(handle));
    const { render, screen } = await createDOM();
    await render(<Example failed={false} canManage />);
    vi.unstubAllGlobals();
    expect(screen.textContent).toContain("todavía no tiene fuentes adjuntas");
    expect(screen.textContent).toContain("Todavía no se vinculó");
    expect(screen.textContent).not.toContain("No pudimos cargar");
  });
  it("sin filas ni permiso para sumar, no muestra cajas vacías (D96)", async () => {
    const { render, screen } = await createDOM();
    await render(<Example failed={false} />);
    expect(screen.textContent).not.toContain("Fuentes y documentos");
    expect(screen.textContent).not.toContain("Contenido relacionado");
    expect(screen.textContent).not.toContain("todavía no tiene fuentes adjuntas");
    expect(screen.querySelectorAll("section")).toHaveLength(0);
  });
});
