import type { RequestEventAction } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addClaimEvent, claimEventSchema } from "./extension-actions";
import { requireUser } from "./session";
import { createServerSupabase } from "./supabase";

vi.mock("./session", () => ({ requireUser: vi.fn() }));
vi.mock("./supabase", () => ({ createServerSupabase: vi.fn() }));
const claimId = "a0000000-0000-4000-8000-000000000001";
const eventId = "b0000000-0000-4000-8000-000000000001";
const input = {
  claim_id: claimId,
  event_type: "resolution" as const,
  title: "Resolución reportada",
  body: "Evidencia concreta",
};
const ev = {
  fail: (status: number, value: object) => ({ failed: true, status, ...value }),
} as unknown as RequestEventAction;
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServerSupabase).mockReturnValue({
    rpc,
  } as unknown as ReturnType<typeof createServerSupabase>);
});

describe("seguimiento confirmado bajo sesión y RPC vigentes", () => {
  it("sólo confirma con el ID real devuelto por la RPC y mantiene sus permisos en la base", async () => {
    rpc.mockResolvedValue({ data: eventId, error: null });
    expect(await addClaimEvent(input, ev)).toEqual({
      added: true,
      eventId,
      claimId,
    });
    expect(requireUser).toHaveBeenCalledWith(ev);
    expect(rpc).toHaveBeenCalledWith("add_claim_event_with_status", {
      p_claim: claimId,
      p_organization: "",
      p_event_type: "resolution",
      p_title: input.title,
      p_body: input.body,
      p_evidence_url: "",
      p_event_date: "",
      p_status: "",
    });
  });
  it.each([
    { data: null, error: null },
    { data: null, error: { code: "42501", message: "denied" } },
  ])(
    "un rechazo o ausencia de ID no publica ni confirma: %j",
    async (result) => {
      rpc.mockResolvedValue(result);
      expect(await addClaimEvent(input, ev)).toMatchObject({
        failed: true,
        status: 400,
        message: "No pudimos agregar la actualización.",
      });
    },
  );
  it("conserva el rechazo del consentimiento vigente sin convertirlo en éxito", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED" },
    });
    expect(await addClaimEvent(input, ev)).toMatchObject({
      failed: true,
      status: 403,
      message: expect.stringMatching(/consentimiento/),
    });
  });
  it("valida título y fecha antes de permitir el envío", () => {
    expect(claimEventSchema.safeParse({ ...input, title: "a" }).success).toBe(
      false,
    );
    expect(
      claimEventSchema.safeParse({ ...input, event_date: "2026-02-31" })
        .success,
    ).toBe(false);
  });
});
