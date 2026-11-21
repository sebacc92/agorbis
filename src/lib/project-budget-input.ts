import type { Locale } from "./i18n-core";

export type ProjectBudgetInput =
  | { valid: true; canonical: string; amount: number | null }
  | { valid: false; reason: "format" | "positive" | "range" };

/** No adivina separadores: 2.500 en español y 2,500 en inglés son miles. */
export function parseProjectBudgetInput(
  text: string,
  locale: Locale,
): ProjectBudgetInput {
  const raw = text.trim();
  if (!raw) return { valid: true, canonical: "", amount: null };
  if (raw.startsWith("-")) return { valid: false, reason: "positive" };

  const pattern =
    locale === "es"
      ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/
      : /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;
  if (!pattern.test(raw)) return { valid: false, reason: "format" };

  const normalized =
    locale === "es"
      ? raw.replaceAll(".", "").replace(",", ".")
      : raw.replaceAll(",", "");
  const [integer, fraction] = normalized.split(".");
  const whole = integer.replace(/^0+(?=\d)/, "");
  // projects.budget_amount es numeric(14,2): se rechaza, nunca se redondea.
  if (whole.length > 12) return { valid: false, reason: "range" };
  const canonical = fraction === undefined ? whole : `${whole}.${fraction}`;
  const amount = Number(canonical);
  if (amount <= 0) return { valid: false, reason: "positive" };
  return { valid: true, canonical, amount };
}

export function projectBudgetExample(locale: Locale): string {
  return locale === "es" ? "2.500,50" : "2,500.50";
}

export function projectBudgetInputMessage(
  reason: Extract<ProjectBudgetInput, { valid: false }>["reason"],
): string {
  if (reason === "positive")
    return "El presupuesto tiene que ser mayor a cero.";
  if (reason === "range")
    return "El presupuesto admite hasta 12 cifras enteras y 2 decimales.";
  return "Usá el formato {{example}}, con hasta 2 decimales y sin símbolos de moneda.";
}
