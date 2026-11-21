import { describe, expect, it } from "vitest";
import { projectStepErrors } from "./project-validation";

describe("validación al avanzar en un proyecto", () => {
  it("no deja ocultar título y resumen vacíos o formados por espacios", () => {
    expect(projectStepErrors({ title: "a", summary: "  ", plan: "" }, 1)).toEqual({
      title: "Mínimo 3 caracteres.", summary: "Resumí el proyecto en una o dos frases.",
    });
  });
  it("no pide el plan antes del segundo paso y revisa todos los anteriores al enviar", () => {
    const values = { title: "Mi proyecto", summary: "Un resumen", plan: " " };
    expect(projectStepErrors(values, 1)).toEqual({});
    expect(projectStepErrors(values, 3)).toEqual({ plan: "Explicá cómo se llevaría a cabo." });
    expect(projectStepErrors({ ...values, plan: "Plan completo" }, 3)).toEqual({});
  });
});
