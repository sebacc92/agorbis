export interface ClaimEventDraft {
  event_type: string;
  event_date: string;
  title: string;
  body: string;
  status: string;
  evidence_url: string;
}

export function claimEventDraft(posted?: FormData): ClaimEventDraft {
  const read = (key: string, fallback = "") => {
    const value = posted?.get(key);
    return typeof value === "string" ? value : fallback;
  };
  return {
    event_type: read("event_type", "update"),
    event_date: read("event_date"),
    title: read("title"),
    body: read("body"),
    status: read("status"),
    evidence_url: read("evidence_url"),
  };
}

/** Limpia sólo valores que siguen iguales a los que se enviaron. */
export function clearSubmittedClaimEventDraft(
  current: ClaimEventDraft,
  posted: FormData,
): ClaimEventDraft {
  const sent = claimEventDraft(posted);
  const empty = claimEventDraft();
  const next = { ...current };
  for (const field of Object.keys(empty) as (keyof ClaimEventDraft)[]) {
    if (current[field] === sent[field]) next[field] = empty[field];
  }
  return next;
}
