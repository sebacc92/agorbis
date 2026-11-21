/**
 * Reglas negativas compartidas para evidencia legal externa.
 *
 * Deliberadamente no describen un formato positivo de constancia AAIP ni
 * intentan acreditar una traducción: sólo rechazan valores que sabemos que no
 * pueden representar evidencia externa aprobada.
 */

const AAIP_PROCEDURE_REFERENCE = /\b(?:RL|EX|RE|PV|IF)(?:\b|(?=\d))/i;
const AAIP_PROCEDURE_TEXT =
  /(?:\b(?:CUIL|CUIT)\b|en\s+tr[aá]mite|\bpending\b|\bpendiente\b|\bexpediente\b|\bfiling\b|transacci[oó]n|\btransaction\b)/i;
const EXTERNAL_EVIDENCE_PLACEHOLDER =
  /(?:peg[aá][ -]?ac[aá]|change[-_ ]?me|\bexamples?\b|\bejemplos?\b|\bfixtures?\b|\bplaceholders?\b|\bsamples?\b|\bdumm(?:y|ies)\b|\btests?\b|\btesting\b|\bpruebas?\b|\bfakes?\b|\bfals[oa]s?\b|\bunknown\b|\bdesconocid[oa]s?\b|\.invalid\b|\bpendiente\b|\bpending\b|por confirmar|to be confirmed|\btbd\b|\btodo\b|\bn\/a\b|[<>])/i;
const UNSAFE_SINGLE_LINE_TEXT = /[\0\r\n]/;

export function isExternalEvidencePlaceholder(value) {
  return typeof value === "string" && EXTERNAL_EVIDENCE_PLACEHOLDER.test(value);
}

export function isForbiddenAaipDatabaseRegistrationIdValue(
  registrationId,
  { controllerId = "" } = {},
) {
  if (typeof registrationId !== "string") return true;
  const current = registrationId.trim();
  if (!current || UNSAFE_SINGLE_LINE_TEXT.test(current)) return true;

  return (
    AAIP_PROCEDURE_REFERENCE.test(current) ||
    AAIP_PROCEDURE_TEXT.test(current) ||
    isExternalEvidencePlaceholder(current) ||
    (typeof controllerId === "string" &&
      controllerId.trim().length > 0 &&
      current === controllerId.trim())
  );
}

const normalizeDisclosureForComparison = (value) =>
  value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();

export function areBilingualExternalEvidenceValuesEquivalent(spanish, english) {
  if (typeof spanish !== "string" || typeof english !== "string") {
    return false;
  }
  const es = normalizeDisclosureForComparison(spanish);
  const en = normalizeDisclosureForComparison(english);
  return es.length > 0 && es === en;
}
