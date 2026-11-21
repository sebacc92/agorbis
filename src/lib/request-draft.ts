/** Recupera también selects y auxiliares del POST nativo. */
export function requestDraft<T extends Record<string, string>>(
  defaults: T,
  posted?: FormData,
): T {
  const draft = { ...defaults };
  for (const field of Object.keys(defaults) as (keyof T & string)[]) {
    const value = posted?.get(field);
    if (typeof value === "string") draft[field] = value as T[typeof field];
  }
  return draft;
}

/** Un envío aceptado limpia sólo los valores que siguen iguales al POST. */
export function clearRequestDraft<T extends Record<string, string>>(
  draft: T,
  defaults: T,
  posted: FormData,
) {
  for (const field of Object.keys(defaults) as (keyof T & string)[]) {
    if (draft[field] === posted.get(field)) draft[field] = defaults[field];
  }
}
