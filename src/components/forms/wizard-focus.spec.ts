import { afterEach, describe, expect, it, vi } from "vitest";
import { focusWizardStep } from "./wizard-focus";

afterEach(() => vi.unstubAllGlobals());
function fixture(appReduced = false, systemReduced = false) {
  const heading = { focus: vi.fn(), scrollIntoView: vi.fn() };
  const input = { focus: vi.fn(), scrollIntoView: vi.fn() };
  const scope = { querySelector: vi.fn((selector: string) => selector === "[data-wizard-heading]" ? heading : input) };
  const form = { querySelector: vi.fn(() => scope) } as unknown as HTMLFormElement;
  vi.stubGlobal("document", { documentElement: { classList: { contains: () => appReduced } } });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: systemReduced }) });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
  return { heading, input, scope, form };
}
describe("foco al avanzar y corregir pasos", () => {
  it("enfoca el encabezado del paso visible al avanzar y el campo preciso al fallar", () => {
    const { heading, input, form } = fixture();
    focusWizardStep(form, 2);
    expect(form.querySelector).toHaveBeenCalledWith('[data-wizard-step="2"]');
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    expect(input.focus).not.toHaveBeenCalled();
    focusWizardStep(form, 1, "title");
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
  });
  it.each([[true, false], [false, true]])("respeta movimiento reducido del panel o del sistema", (app, system) => {
    const { heading, form } = fixture(app, system);
    focusWizardStep(form, 3);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "instant" });
  });
});
