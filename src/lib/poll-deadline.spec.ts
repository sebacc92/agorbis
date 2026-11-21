import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observePollDeadline } from "./poll-deadline";

const now = Date.parse("2026-10-23T12:00:00Z");
let browser: EventTarget;
let documentTarget: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  browser = new EventTarget();
  documentTarget = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("document", documentTarget);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("vencimiento local sin polling de resultados", () => {
  it("agenda un único vencimiento, recalcula al llegar y no mantiene un intervalo", () => {
    const update = vi.fn();
    const stop = observePollDeadline(new Date(now + 5_000).toISOString(), "active", update);
    expect(update).toHaveBeenLastCalledWith(now);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(4_999);
    expect(update).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(update).toHaveBeenLastCalledWith(now + 5_000);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(update).toHaveBeenCalledTimes(2);
    stop();
  });
  it("recupera una pestaña suspendida y limpia listeners y temporizador al salir", () => {
    const update = vi.fn();
    const stop = observePollDeadline(new Date(now + 30_000).toISOString(), "active", update);
    vi.setSystemTime(now + 60_000);
    documentTarget.visibilityState = "hidden";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(1);
    documentTarget.visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenLastCalledWith(now + 60_000);
    expect(vi.getTimerCount()).toBe(0);
    browser.dispatchEvent(new Event("pageshow"));
    expect(update).toHaveBeenCalledTimes(3);
    stop();
    browser.dispatchEvent(new Event("focus"));
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenCalledTimes(3);
    vi.setSystemTime(now);
    const cancel = observePollDeadline(new Date(now + 30_000).toISOString(), "active", update);
    cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([[null, "active"], ["invalid", "active"], [new Date(now - 1).toISOString(), "active"], [new Date(now + 30_000).toISOString(), "closed"]])("no agenda si no hay un plazo futuro vigente: %s, %s", (deadline, status) => {
    const stop = observePollDeadline(deadline, status!, vi.fn());
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });
});
