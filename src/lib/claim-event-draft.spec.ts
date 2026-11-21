import { describe, expect, it } from "vitest";
import {
  claimEventDraft,
  clearSubmittedClaimEventDraft,
} from "./claim-event-draft";

describe("borrador de seguimiento después de guardar", () => {
  const posted = () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      event_type: "evidence",
      title: "  Título enviado  ",
      body: "Texto enviado",
      event_date: "2026-10-23",
      status: "resolved",
      evidence_url: "https://example.com/proof.pdf",
    }))
      data.set(key, value);
    return data;
  };
  it("limpia los valores enviados, incluidos espacios previos a la validación del servidor", () => {
    const data = posted();
    expect(clearSubmittedClaimEventDraft(claimEventDraft(data), data)).toEqual(
      claimEventDraft(),
    );
  });
  it("conserva por campo lo escrito durante el envío y no muta el borrador original", () => {
    const data = posted();
    const current = {
      ...claimEventDraft(data),
      title: "Un título posterior",
      body: "Otro texto",
      status: "in_progress",
    };
    const next = clearSubmittedClaimEventDraft(current, data);
    expect(next).toEqual({
      ...claimEventDraft(),
      title: "Un título posterior",
      body: "Otro texto",
      status: "in_progress",
    });
    expect(current.event_type).toBe("evidence");
    expect(current.evidence_url).toBe("https://example.com/proof.pdf");
  });
});
