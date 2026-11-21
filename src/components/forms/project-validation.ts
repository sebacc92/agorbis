export const PROJECT_FIELD_STEPS: Record<string, number> = {
  title: 1,
  summary: 1,
  plan: 2,
  budget_amount: 3,
  currency: 3,
  resources_needed: 3,
  time_estimate: 3,
};

/** La misma información obligatoria se revisa antes de ocultar cada paso. */
export function projectStepErrors(
  values: { title: string; summary: string; plan: string },
  throughStep: number,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (throughStep >= 1) {
    if (values.title.trim().length < 3) errors.title = "Mínimo 3 caracteres.";
    if (!values.summary.trim())
      errors.summary = "Resumí el proyecto en una o dos frases.";
  }
  if (throughStep >= 2 && !values.plan.trim()) {
    errors.plan = "Explicá cómo se llevaría a cabo.";
  }
  return errors;
}
