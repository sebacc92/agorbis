/** Heurística explícita para textos en español o inglés; no clasifica su intención. */
export function hasProposalWords(body: string): boolean {
  const normalized = body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(propongo|solucion(?:es)?|podriamos|propuestas?|sugiero|proyectos?|propos(?:e|es|al|als)|suggest(?:s|ion|ions)?|solutions?|could|projects?)\b/.test(
    normalized,
  );
}

export function formatDebateQuote(
  text: string,
  author: string,
  column: string,
  debateTitle: string,
): string {
  return `> ${text.trim().split("\n").join("\n> ")}\n— ${author} (${column} · ${debateTitle})\n`;
}

/** Rechaza completa una cita que no entra; conserva siempre lo ya escrito. */
export function appendDebateQuote(draft: string, quote: string): string | null {
  const next = draft ? `${draft}\n\n${quote}` : quote;
  return next.length <= 1000 ? next : null;
}
