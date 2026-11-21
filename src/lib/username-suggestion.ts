/** Mismo patrón que valida `useSaveName` y la base (`profiles.username`). */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Sugiere un nombre de usuario desde el nombre para mostrar: "Sofía Rearte"
 * → "sofia_rearte". Sale del nombre que la persona eligió mostrar y no del
 * correo, para no publicar una parte de su dirección (D108). Devuelve "" si
 * no alcanza para un nombre válido.
 */
export function suggestUsername(displayName: string): string {
  const full = displayName
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  let slug = full.slice(0, 20).replace(/_+$/g, "");
  // Si el corte parte una palabra, se queda con las palabras enteras:
  // "sebastian_cardoso", no "sebastian_cardoso_ca" (D110).
  if (full.length > 20 && full[20] !== "_") {
    const lastBreak = slug.lastIndexOf("_");
    if (lastBreak >= 3) slug = slug.slice(0, lastBreak);
  }
  return USERNAME_PATTERN.test(slug) ? slug : "";
}
