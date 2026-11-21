import { describe, expect, it } from "vitest";
import { appendDebateQuote, formatDebateQuote, hasProposalWords } from "./debate-quotes";

describe("citas y filtro de propuestas", () => {
  it.each(["Propongo renovar la plaza.", "Una SOLUCIÓN sería plantar árboles.", "Podríamos probar una alternativa.", "I propose safer crossings.", "We suggest two possible solutions.", "A new project for schools."])("reconoce palabras completas en español e inglés: %s", (text) => {
    expect(hasProposalWords(text)).toBe(true);
  });
  it.each(["La soluciónista opinó.", "A projectile crossed the road.", "La situación sigue igual."])("no toma fragmentos de palabras como propuestas: %s", (text) => {
    expect(hasProposalWords(text)).toBe(false);
  });
  it("conserva el texto escrito y atribuye la cita con sus líneas", () => {
    const quote = formatDebateQuote("Primera línea\nSegunda línea", "Elena", "CABA", "El debate");
    expect(quote).toBe("> Primera línea\n> Segunda línea\n— Elena (CABA · El debate)\n");
    expect(appendDebateQuote("Mi comentario", quote)).toBe(`Mi comentario\n\n${quote}`);
  });
  it("admite exactamente el límite y rechaza una cita completa sin cortar el texto", () => {
    expect(appendDebateQuote("a".repeat(997), "b")).toHaveLength(1000);
    expect(appendDebateQuote("a".repeat(998), "b")).toBeNull();
    expect(appendDebateQuote("", "b".repeat(1001))).toBeNull();
  });
});
