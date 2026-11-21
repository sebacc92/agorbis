import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), requireUser: vi.fn() }));
vi.mock("./session", () => ({ requireUser: mocks.requireUser, supabase: () => ({ rpc: mocks.rpc }) }));
import { submitSuspensionAppeal, withdrawSuspensionAppeal } from "./appeal-actions";

const suspensionId = "11111111-1111-4111-8111-111111111111";
const appealId = "22222222-2222-4222-8222-222222222222";
const ev = { fail: (status: number, value: object) => ({ failed: true, status, ...value }) };
beforeEach(() => { vi.clearAllMocks(); mocks.requireUser.mockResolvedValue({ userId: "persona" }); });

describe("confirmación de apelaciones", () => {
  it("confirma la suspensión y apelación que la RPC guardó", async () => {
    mocks.rpc.mockResolvedValue({ data: appealId, error: null });
    expect(await submitSuspensionAppeal({ suspension_id: suspensionId, body: "Contexto verificable de mi solicitud de revisión." }, ev as never)).toEqual({ submitted: true, appealId, suspensionId });
    expect(mocks.rpc).toHaveBeenCalledWith("submit_suspension_appeal", { p_suspension: suspensionId, p_body: "Contexto verificable de mi solicitud de revisión." });
    expect(mocks.requireUser).toHaveBeenCalledWith(ev);
  });
  it.each([null, "", true])("no anuncia un envío sin ID confirmado", async (data) => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    expect(await submitSuspensionAppeal({ suspension_id: suspensionId, body: "Contexto verificable de mi solicitud de revisión." }, ev as never)).toMatchObject({ failed: true, status: 400 });
  });
  it("conserva el rechazo de apelación abierta", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect(await submitSuspensionAppeal({ suspension_id: suspensionId, body: "Contexto verificable de mi solicitud de revisión." }, ev as never)).toMatchObject({ failed: true, message: "Ya hay una apelación abierta para esta suspensión." });
  });
  it("confirma un retiro solamente cuando la RPC devuelve true", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await withdrawSuspensionAppeal({ appeal_id: appealId }, ev as never)).toEqual({ withdrawn: true, appealId });
    for (const data of [false, null]) {
      mocks.rpc.mockResolvedValue({ data, error: null });
      expect(await withdrawSuspensionAppeal({ appeal_id: appealId }, ev as never)).toMatchObject({ failed: true, status: 400 });
    }
  });
});
