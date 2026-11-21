/**
 * Utilidades de formato y validación de campos cívicos e institucionales
 * (CUIT/CUIL, teléfonos y URLs).
 */

/**
 * Normaliza un CUIT/CUIL a formato XX-XXXXXXXX-X.
 * Recibe cualquier string, descarta caracteres no numéricos y coloca los guiones.
 */
export function formatCuit(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10, 11)}`;
}

/**
 * Valida el dígito verificador de un CUIT/CUIL mediante algoritmo Módulo 11.
 */
export function validateCuitChecksum(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(digits[i]) * multipliers[i]!;
  }

  const remainder = sum % 11;
  const expectedCheckDigit =
    remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
  return Number(digits[10]) === expectedCheckDigit;
}

/**
 * Formatea un número de teléfono en bloques legibles.
 */
export function formatPhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = raw.replace(/\D/g, "").slice(0, 15);
  if (!digits) return hasPlus ? "+" : "";

  let result = hasPlus ? `+${digits.slice(0, 2)} ` : "";
  const remaining = hasPlus ? digits.slice(2) : digits;

  if (remaining.length <= 4) {
    result += remaining;
  } else if (remaining.length <= 8) {
    result += `${remaining.slice(0, 4)}-${remaining.slice(4)}`;
  } else {
    result += `${remaining.slice(0, 2)} ${remaining.slice(2, 6)}-${remaining.slice(6)}`;
  }

  return result.trim();
}

/**
 * Auto-agrega https:// si el usuario escribe un dominio sin protocolo.
 */
export function ensureHttpPrefix(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
