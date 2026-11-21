/** Limpia sólo el texto confirmado que la persona no volvió a editar. */
export function clearConfirmedFields<T extends Record<string, string>>(
  draft: T,
  submitted: FormData,
  fields: readonly (keyof T & string)[],
) {
  for (const name of fields) {
    if (draft[name] === submitted.get(name)) draft[name] = "" as T[typeof name];
  }
}
