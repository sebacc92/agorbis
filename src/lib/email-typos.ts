/**
 * Dominio de correo mal escrito (D121). El error más caro del registro es un
 * correo con "gmial.com": la cuenta se crea y la confirmación no llega nunca.
 * Se sugiere la corrección sólo para proveedores masivos y sólo cuando el
 * dominio escrito está a un error de distancia; nunca se corrige solo.
 */
const KNOWN_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.ar",
  "icloud.com",
  "live.com",
  "hotmail.com.ar",
  "outlook.es",
] as const;

/** Distancia de Levenshtein acotada: alcanza con saber si es 0, 1, 2 o más. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    let rowMinimum = previous[0];
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(above + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
      rowMinimum = Math.min(rowMinimum, previous[j]);
    }
    if (rowMinimum > max) return max + 1;
  }
  return previous[b.length];
}

/**
 * Devuelve el correo corregido si el dominio parece un error de tipeo de un
 * proveedor conocido, o `null` si está bien escrito o no se parece a ninguno.
 */
export function suggestEmailDomain(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  if ((KNOWN_DOMAINS as readonly string[]).includes(domain)) return null;
  // Sin punto no hay dominio que corregir, y con menos de cuatro letras
  // cualquier cosa está "cerca" de algo.
  if (domain.length < 4) return null;
  let best: { domain: string; distance: number } | null = null;
  for (const known of KNOWN_DOMAINS) {
    const distance = editDistance(domain, known, 2);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { domain: known, distance };
    }
  }
  if (!best || best.distance === 0) return null;
  return `${local}@${best.domain}`;
}
