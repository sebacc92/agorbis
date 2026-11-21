import { describe, expect, it } from "vitest";
import { notificationPreferenceDraft } from "./notification-preference-draft";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./notifications";

describe("preferencias recuperadas del POST", () => {
  it("usa una copia de lo guardado cuando no hubo envío", () => {
    const saved = { ...DEFAULT_NOTIFICATION_PREFERENCES, replies: false };
    const draft = notificationPreferenceDraft(saved);
    expect(draft).toEqual(saved);
    expect(draft).not.toBe(saved);
  });

  it("conserva las casillas apagadas aunque antes estuvieran guardadas encendidas", () => {
    const posted = new FormData();
    posted.set("poll_results", "on");
    posted.set("institutional_responses", "on");
    expect(
      notificationPreferenceDraft(DEFAULT_NOTIFICATION_PREFERENCES, posted),
    ).toEqual({
      replies: false,
      poll_results: true,
      claim_updates: false,
      project_updates: false,
      institutional_responses: true,
    });
    expect(DEFAULT_NOTIFICATION_PREFERENCES.replies).toBe(true);
  });

  it("un POST sin casillas seleccionadas recupera todas apagadas", () => {
    expect(
      Object.values(
        notificationPreferenceDraft(
          DEFAULT_NOTIFICATION_PREFERENCES,
          new FormData(),
        ),
      ),
    ).toEqual([false, false, false, false, false]);
  });

  it("recupera la elección marcada también cuando su valor provocó un rechazo de validación", () => {
    const posted = new FormData();
    posted.set("replies", "valor rechazado");
    expect(
      notificationPreferenceDraft(DEFAULT_NOTIFICATION_PREFERENCES, posted)
        .replies,
    ).toBe(true);
    expect(
      notificationPreferenceDraft(DEFAULT_NOTIFICATION_PREFERENCES, posted)
        .poll_results,
    ).toBe(false);
  });
});
