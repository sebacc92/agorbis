import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeClaimResponseClock } from "./claim-clock-observer";
import { responseClock, type ClaimClockFields } from "./claim-escalation";

const start = Date.parse("2026-10-23T12:00:00Z");
const day = 86_400_000;
let browser: EventTarget;
let documentTarget: EventTarget & { visibilityState: string };
const claim = (deadline: number): ClaimClockFields => ({
  status: "open",
  response_due_at: new Date(deadline).toISOString(),
  first_response_at: null,
  escalated_at: null,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(start);
  browser = new EventTarget();
  documentTarget = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", documentTarget);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("reloj local de respuesta sin sondeo", () => {
  it("agenda sólo el próximo cambio de día o plazo, sin afirmar un escalado no confirmado", () => {
    const current = claim(start + day + 2_000);
    const update = vi.fn();
    const stop = observeClaimResponseClock(current, update);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(2_000);
    expect(responseClock(current, new Date(update.mock.lastCall![0]))).toEqual({
      state: "waiting",
      days: 1,
    });
    vi.advanceTimersByTime(day);
    expect(responseClock(current, new Date(update.mock.lastCall![0]))).toEqual({
      state: "overdue",
      days: 0,
    });
    vi.advanceTimersByTime(1);
    expect(responseClock(current, new Date(update.mock.lastCall![0]))).toEqual({
      state: "overdue",
      days: 1,
    });
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("recupera pestañas suspendidas y limpia todos los eventos y timers", () => {
    const update = vi.fn();
    const stop = observeClaimResponseClock(claim(start + 30_000), update);
    vi.setSystemTime(start + 2 * day);
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    documentTarget.visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenLastCalledWith(start + 2 * day);
    browser.dispatchEvent(new Event("pageshow"));
    browser.dispatchEvent(new Event("focus"));
    expect(update).toHaveBeenCalledTimes(4);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    browser.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(4);
  });
  it.each([
    { response_due_at: null },
    { response_due_at: "invalid" },
    { status: "resolved" },
    { first_response_at: new Date(start).toISOString() },
  ])("no agenda sin plazo pendiente válido: %j", (changes) => {
    const stop = observeClaimResponseClock(
      { ...claim(start + day), ...changes },
      vi.fn(),
    );
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
});
