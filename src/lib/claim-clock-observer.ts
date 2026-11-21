import { responseClock, type ClaimClockFields } from "./claim-escalation";

const DAY_MS = 86_400_000;
const MAX_TIMER_DELAY = 2_147_483_647;

/** Un único timer al próximo cambio del rótulo; no consulta ni escala reclamos. */
export function observeClaimResponseClock(
  claim: ClaimClockFields,
  onTime: (now: number) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const sync = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const now = Date.now();
    onTime(now);
    const clock = responseClock(claim, new Date(now));
    let delay = NaN;
    if (clock.state === "waiting") {
      const remaining = Date.parse(claim.response_due_at!) - now;
      delay = remaining - (clock.days - 1) * DAY_MS;
    } else if (clock.state === "overdue" || clock.state === "escalated") {
      const anchor =
        clock.state === "escalated"
          ? claim.escalated_at
          : claim.response_due_at;
      delay = Date.parse(anchor!) + clock.days * DAY_MS + 1 - now;
    }
    if (Number.isFinite(delay) && delay > 0)
      timer = setTimeout(sync, Math.min(delay, MAX_TIMER_DELAY));
  };
  const visible = () => {
    if (document.visibilityState !== "hidden") sync();
  };
  sync();
  window.addEventListener("pageshow", sync);
  window.addEventListener("focus", sync);
  document.addEventListener("visibilitychange", visible);
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener("pageshow", sync);
    window.removeEventListener("focus", sync);
    document.removeEventListener("visibilitychange", visible);
  };
}
