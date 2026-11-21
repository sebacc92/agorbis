/** Conserva los filtros del documento al enviar una acción sin JavaScript. */
export function nativeActionHref(contextHref: string, actionPath: string) {
  const destination = new URL(contextHref, "https://agorbis.invalid");
  const action = new URL(actionPath, destination);
  for (const [name, value] of action.searchParams) {
    destination.searchParams.set(name, value);
  }
  return `${destination.pathname}${destination.search}`;
}
