const MAX_TIMER_DELAY = 2_147_483_647;

/** Un solo vencimiento local; no consulta ni actualiza resultados del servidor. */
export function observePollDeadline(
  closesAt: string | null,
  status: string,
  onTime: (now: number) => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = closesAt ? Date.parse(closesAt) : NaN;
  const sync = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const now = Date.now();
    onTime(now);
    if (status === "active" && Number.isFinite(deadline) && deadline > now) {
      timer = setTimeout(sync, Math.min(deadline - now, MAX_TIMER_DELAY));
    }
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
