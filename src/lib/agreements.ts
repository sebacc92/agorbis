import { formatDate } from "./format";
import { translate, type Locale } from "./i18n";
import type { DbErrorLike } from "./db-error";
import { agreementRaiseMessage } from "./db-error";

/**
 * Acuerdos entre comunidades (D118).
 *
 * Todo lo que decide quién puede qué vive en la base (`propose_agreement`,
 * `adhere_agreement`, `withdraw_agreement`, `agreement_state`). Acá sólo hay
 * palabras para los estados que la base devuelve y la misma regla de
 * elegibilidad, repetida para avisar antes de enviar: si la app y la base
 * discrepan, manda la base.
 */

/** Los ocho estados derivados que devuelve `agreement_state` (D118, D120). */
export const AGREEMENT_STATUSES = [
  "proposed",
  "voting",
  "approved",
  "rejected",
  "no_quorum",
  "lapsed",
  "withdrawn",
  "removed",
] as const;

export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];
export type PartyOutcome = "pending" | "approved" | "rejected" | "no_quorum";

export function isAgreementStatus(value: string): value is AgreementStatus {
  return (AGREEMENT_STATUSES as readonly string[]).includes(value);
}

/** Estado en palabras. Nada dice "aprobado" si la base no lo dijo (D74). */
export function agreementStatusLabel(
  locale: Locale,
  status: AgreementStatus,
  closesAt: string | null,
): string {
  switch (status) {
    case "proposed":
      return translate(locale, "Propuesto, esperando adhesión");
    case "voting":
      return closesAt
        ? translate(locale, "En votación hasta el {{date}}", {
            date: formatDate(closesAt, locale),
          })
        : translate(locale, "En votación");
    case "approved":
      return translate(locale, "Aprobado");
    case "rejected":
      return translate(locale, "Rechazado");
    case "no_quorum":
      return translate(locale, "Sin quórum");
    case "lapsed":
      return translate(locale, "Sin adhesión");
    case "withdrawn":
      return translate(locale, "Retirado");
    case "removed":
      return translate(locale, "Dado de baja por moderación");
  }
}

/**
 * Resultado de una comunidad. La participación se muestra sólo si la base la
 * entregó, y la base sólo la entrega con la ronda cerrada y quórum (D68).
 */
export function partyOutcomeLabel(
  locale: Locale,
  outcome: PartyOutcome,
  participants: number | null,
): string {
  if (outcome === "pending") return translate(locale, "En votación");
  if (outcome === "no_quorum") {
    return translate(locale, "Sin quórum: menos de cinco participantes");
  }
  const verb =
    outcome === "approved"
      ? translate(locale, "Aprobó")
      : translate(locale, "Rechazó");
  if (participants === null) return verb;
  return `${verb} · ${translate(locale, "{{count}} participantes", {
    count: String(participants),
  })}`;
}

export type EligibilityIssue = "cantidad" | "nivel" | "pais" | "contenida";

interface CommunityShape {
  level: number;
  path: string;
}

const MIN_LEVEL = 3;
const MAX_LEVEL = 5;
const MAX_PARTIES = 5;
/** El tercer segmento del path es el país: `earth.<continente>.<país>`. */
const COUNTRY_SEGMENT = 2;

/**
 * La misma regla que `private.assert_agreement_parties`, en el mismo orden,
 * para que el aviso del formulario coincida con el rechazo de la base.
 */
export function eligibilityIssue(
  own: CommunityShape,
  others: readonly CommunityShape[],
): EligibilityIssue | null {
  const byPath = new Map<string, CommunityShape>();
  for (const community of [own, ...others])
    byPath.set(community.path, community);
  const parties = [...byPath.values()];

  if (parties.length < 1 || parties.length > MAX_PARTIES) return "cantidad";
  if (parties.some((c) => c.level < MIN_LEVEL || c.level > MAX_LEVEL)) {
    return "nivel";
  }
  const countries = new Set(
    parties.map((c) => c.path.split(".")[COUNTRY_SEGMENT] ?? ""),
  );
  if (countries.size !== 1) return "pais";
  const nested = parties.some((a) =>
    parties.some((b) => b !== a && b.path.startsWith(`${a.path}.`)),
  );
  if (nested) return "contenida";
  return null;
}

export function eligibilityMessage(
  locale: Locale,
  issue: EligibilityIssue,
): string {
  switch (issue) {
    case "cantidad":
      return translate(
        locale,
        "Un acuerdo reúne de una a cinco comunidades, contando la tuya.",
      );
    case "nivel":
      return translate(
        locale,
        "Sólo participan comunidades de provincia para abajo: el país, los continentes y la Tierra no.",
      );
    case "pais":
      return translate(
        locale,
        "Todas las comunidades tienen que ser del mismo país.",
      );
    case "contenida":
      return translate(
        locale,
        "Una comunidad no puede participar junto con otra que la contiene: sus residentes votarían dos veces.",
      );
  }
}

/** Lo que devuelve `agreement_state`, ya validado en el borde. */
export interface AgreementParty {
  community_id: string;
  slug: string;
  name: string;
  emoji: string | null;
  level: number;
  adhered_at: string | null;
  poll_id: string | null;
  outcome: PartyOutcome | null;
  participants: number | null;
}

export interface AgreementState {
  id: string;
  title: string;
  body: string;
  status_derived: AgreementStatus;
  proposer_id: string | null;
  proposer_community: {
    id: string;
    slug: string;
    name: string;
    emoji: string | null;
  };
  duration_days: number;
  created_at: string;
  opened_at: string | null;
  closes_at: string | null;
  parties: AgreementParty[];
  viewer: {
    party_community_id: string | null;
    can_adhere: boolean;
    can_withdraw: boolean;
    has_receipt: boolean;
    can_vote: boolean;
  };
}

const PARTY_OUTCOMES: readonly string[] = [
  "pending",
  "approved",
  "rejected",
  "no_quorum",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown): v is string | null => v === null || str(v);
const num = (v: unknown): v is number => typeof v === "number";
const numOrNull = (v: unknown): v is number | null => v === null || num(v);
const bool = (v: unknown): v is boolean => typeof v === "boolean";

function parseParty(value: unknown): AgreementParty | null {
  if (!isRecord(value)) return null;
  const outcome = value.outcome;
  if (
    !str(value.community_id) ||
    !str(value.slug) ||
    !str(value.name) ||
    !strOrNull(value.emoji) ||
    !num(value.level) ||
    !strOrNull(value.adhered_at) ||
    !strOrNull(value.poll_id) ||
    !(outcome === null || (str(outcome) && PARTY_OUTCOMES.includes(outcome))) ||
    !numOrNull(value.participants)
  ) {
    return null;
  }
  return {
    community_id: value.community_id,
    slug: value.slug,
    name: value.name,
    emoji: value.emoji,
    level: value.level,
    adhered_at: value.adhered_at,
    poll_id: value.poll_id,
    outcome: outcome as PartyOutcome | null,
    participants: value.participants,
  };
}

/**
 * La RPC devuelve `jsonb`: nada en los tipos generados dice qué trae. Se
 * valida acá para que un cambio en la base falle en el borde con un 500
 * honesto y no en una pantalla que afirma cosas con campos vacíos.
 */
export function parseAgreementState(value: unknown): AgreementState | null {
  if (!isRecord(value)) return null;
  const community = value.proposer_community;
  const viewer = value.viewer;
  if (
    !str(value.id) ||
    !str(value.title) ||
    !str(value.body) ||
    !str(value.status_derived) ||
    !isAgreementStatus(value.status_derived) ||
    !strOrNull(value.proposer_id) ||
    !isRecord(community) ||
    !str(community.id) ||
    !str(community.slug) ||
    !str(community.name) ||
    !strOrNull(community.emoji) ||
    !num(value.duration_days) ||
    !str(value.created_at) ||
    !strOrNull(value.opened_at) ||
    !strOrNull(value.closes_at) ||
    !Array.isArray(value.parties) ||
    !isRecord(viewer) ||
    !strOrNull(viewer.party_community_id) ||
    !bool(viewer.can_adhere) ||
    !bool(viewer.can_withdraw) ||
    !bool(viewer.has_receipt) ||
    !bool(viewer.can_vote)
  ) {
    return null;
  }
  const parties = value.parties.map(parseParty);
  if (parties.some((party) => party === null)) return null;
  return {
    id: value.id,
    title: value.title,
    body: value.body,
    status_derived: value.status_derived,
    proposer_id: value.proposer_id,
    proposer_community: {
      id: community.id,
      slug: community.slug,
      name: community.name,
      emoji: community.emoji,
    },
    duration_days: value.duration_days,
    created_at: value.created_at,
    opened_at: value.opened_at,
    closes_at: value.closes_at,
    parties: parties as AgreementParty[],
    viewer: {
      party_community_id: viewer.party_community_id,
      can_adhere: viewer.can_adhere,
      can_withdraw: viewer.can_withdraw,
      has_receipt: viewer.has_receipt,
      can_vote: viewer.can_vote,
    },
  };
}

/** Comunidad candidata a participar, con lo que el formulario necesita. */
export interface CandidateCommunity {
  id: string;
  slug: string;
  name: string;
  emoji: string | null;
  level: number;
  path: string;
}

/**
 * Si `row` puede sumarse a un acuerdo de `own`: ni la misma comunidad, ni una
 * que la contenga, ni una que ella contenga. La base lo vuelve a decidir al
 * recibir (`propose_agreement`); acá sólo arma la lista. La comparación usa el
 * punto del path para que "ba" no contenga a "ba-hermana".
 */
export function isCandidateFor(
  own: { id: string; path: string },
  row: { id: string; path: string },
): boolean {
  return (
    row.id !== own.id &&
    !own.path.startsWith(`${row.path}.`) &&
    !row.path.startsWith(`${own.path}.`)
  );
}

/**
 * Suma a las candidatas conocidas las que trajo una búsqueda, sin duplicar.
 * Las ya conocidas quedan primero, así una elegida nunca se pierde aunque la
 * búsqueda siguiente no la traiga.
 */
export function mergeCandidates<T extends { id: string }>(
  known: readonly T[],
  incoming: readonly T[],
): readonly T[] {
  const ids = new Set(known.map((c) => c.id));
  const fresh = incoming.filter((c) => !ids.has(c.id));
  return fresh.length ? [...known, ...fresh] : known;
}

/** Sin tildes ni mayúsculas: "cordoba" encuentra "Córdoba". */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra las candidatas por nombre. Las ya elegidas siempre se muestran, para
 * que nadie pierda de vista a quién invitó aunque cambie la búsqueda.
 */
export function filterCandidates<T extends { id: string; name: string }>(
  candidates: readonly T[],
  query: string,
  selectedIds: readonly string[],
  limit: number,
): T[] {
  const needle = normalizeForSearch(query);
  const selected = candidates.filter((c) => selectedIds.includes(c.id));
  if (!needle)
    return [
      ...selected,
      ...candidates.filter((c) => !selectedIds.includes(c.id)),
    ].slice(0, Math.max(limit, selected.length));
  const matches = candidates.filter(
    (c) =>
      !selectedIds.includes(c.id) &&
      normalizeForSearch(c.name).includes(needle),
  );
  return [...selected, ...matches].slice(0, Math.max(limit, selected.length));
}

/**
 * Qué decirle a quien propone cuando la base rechazó. La elegibilidad y la
 * duración ya se avisaron antes de enviar; si igual llegan, se repite el
 * motivo exacto en vez de "probá de nuevo", porque reintentar no sirve.
 */
/** Rechazos de elegibilidad y duración que la base lanza al proponer. */
const ELIGIBILITY_RAISE =
  /AGORBIS_AGREEMENT_(INELIGIBLE_LEVEL|MIXED_COUNTRIES|NESTED_COMMUNITIES|PARTY_COUNT|DURATION)/;

/**
 * Si el rechazo tiene un texto propio. Lo que no es conocido se muestra como
 * "Probá de nuevo" y tiene que quedar en el log, porque reintentar no lo
 * arregla.
 */
export function isKnownProposeError(
  error: DbErrorLike | null | undefined,
): boolean {
  const message = error?.message ?? "";
  return (
    ELIGIBILITY_RAISE.test(message) || agreementRaiseMessage(error) !== null
  );
}

export function proposeErrorMessage(
  locale: Locale,
  error: DbErrorLike | null | undefined,
): string {
  const message = error?.message ?? "";
  if (/AGORBIS_AGREEMENT_INELIGIBLE_LEVEL/.test(message)) {
    return eligibilityMessage(locale, "nivel");
  }
  if (/AGORBIS_AGREEMENT_MIXED_COUNTRIES/.test(message)) {
    return eligibilityMessage(locale, "pais");
  }
  if (/AGORBIS_AGREEMENT_NESTED_COMMUNITIES/.test(message)) {
    return eligibilityMessage(locale, "contenida");
  }
  if (/AGORBIS_AGREEMENT_PARTY_COUNT/.test(message)) {
    return eligibilityMessage(locale, "cantidad");
  }
  if (/AGORBIS_AGREEMENT_DURATION/.test(message)) {
    return translate(locale, "La votación dura entre 7 y 30 días.");
  }
  const known = agreementRaiseMessage(error);
  if (known) return translate(locale, known);
  return translate(
    locale,
    "No pudimos registrar la propuesta. Probá de nuevo.",
  );
}
