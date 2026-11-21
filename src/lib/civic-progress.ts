const LEVELS = [
  { minimum: 0, title: "Vecino Observador" },
  { minimum: 5, title: "Ciudadano Activo" },
  { minimum: 10, title: "Impulsor Barrial" },
  { minimum: 25, title: "Referente Comunitario" },
] as const;

/** El progreso describe el tramo actual y no inventa un mínimo de avance. */
export function civicProgress(total: number) {
  const actions = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  const index = LEVELS.reduce(
    (selected, level, i) => (actions >= level.minimum ? i : selected),
    0,
  );
  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const completed = next ? actions - current.minimum : 1;
  const required = next ? next.minimum - current.minimum : 1;
  return {
    actions,
    title: current.title,
    level: index + 1,
    nextThreshold: next?.minimum ?? null,
    completed,
    required,
    percent: Math.round((completed / required) * 100),
  };
}
