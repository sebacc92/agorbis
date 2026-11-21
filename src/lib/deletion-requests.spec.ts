import type { RequestEventBase } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELETION_ADMIN_REQUIRED,
  hashReceiptAccessCode,
  issueReceiptAccessCode,
  lookupDeletionReceipt,
  receiptLookupSourceHash,
  requireDeletionRequestAdmin,
} from "./deletion-requests";

const mocks = vi.hoisted(() => ({
  requireModerator: vi.fn(),
  userRpc: vi.fn(),
  serverRpc: vi.fn(),
  createAdminSupabase: vi.fn(),
}));
vi.mock("./session", () => ({
  requireModerator: mocks.requireModerator,
  supabase: () => ({ rpc: mocks.userRpc }),
}));
vi.mock("./supabase", () => ({ createAdminSupabase: mocks.createAdminSupabase }));

const reference = "00000000-0000-4000-8000-000000000001";
const code = "a".repeat(64);
const receipt = {
  reference,
  status: "in_review",
  received_at: "2026-09-08T12:00:00Z",
  updated_at: "2026-09-08T13:00:00Z",
  closed_at: null,
  resolution_code: null,
};

function fixture(options: { host?: string; runtime?: string; ip?: string; secret?: string } = {}) {
  const url = new URL(`https://${options.host ?? "agorbis.com"}/eliminar-datos/seguimiento/`);
  const values: Record<string, string> = {
    AGORBIS_RUNTIME: options.runtime ?? "cloudflare-workers",
    SUPABASE_SECRET_KEY: options.secret ?? "local-fixture-secret",
  };
  return {
    url,
    request: new Request(url, { headers: { "CF-Connecting-IP": options.ip ?? "192.0.2.20" } }),
    env: { get: (key: string) => values[key] },
    locale: () => "es",
    error: (status: number, message: string) => Object.assign(new Error(message), { status }),
  } as unknown as RequestEventBase;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModerator.mockResolvedValue({ userId: reference, isModerator: true });
  mocks.userRpc.mockResolvedValue({ data: true, error: null });
  mocks.serverRpc.mockResolvedValue({ data: receipt, error: null });
  mocks.createAdminSupabase.mockReturnValue({ rpc: mocks.serverRpc });
});

describe("administración privada de solicitudes por correo", () => {
  it("requiere primero los controles de sesión y MFA existentes y después is_admin", async () => {
    const ev = fixture() as Parameters<typeof requireDeletionRequestAdmin>[0];
    await expect(requireDeletionRequestAdmin(ev)).resolves.toMatchObject({ userId: reference });
    expect(mocks.requireModerator).toHaveBeenCalledWith(ev);
    expect(mocks.userRpc).toHaveBeenCalledWith("is_admin", { p_user: reference });
    expect(mocks.requireModerator.mock.invocationCallOrder[0]).toBeLessThan(mocks.userRpc.mock.invocationCallOrder[0]);
  });
  it("rechaza al moderador no admin aun cuando haya superado el control MFA", async () => {
    mocks.userRpc.mockResolvedValue({ data: false, error: null });
    await expect(requireDeletionRequestAdmin(fixture() as Parameters<typeof requireDeletionRequestAdmin>[0]))
      .rejects.toMatchObject({ status: 403, message: DELETION_ADMIN_REQUIRED });
  });
  it("no evalúa privilegios si el control existente rechaza la sesión", async () => {
    const denied = new Error("MFA required in fixture");
    mocks.requireModerator.mockRejectedValue(denied);
    await expect(requireDeletionRequestAdmin(fixture() as Parameters<typeof requireDeletionRequestAdmin>[0])).rejects.toBe(denied);
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });
  it("falla cerrado ante un error de permisos, aunque data diga true", async () => {
    mocks.userRpc.mockResolvedValue({ data: true, error: { message: "fixture" } });
    await expect(requireDeletionRequestAdmin(fixture() as Parameters<typeof requireDeletionRequestAdmin>[0])).rejects.toMatchObject({ status: 403 });
  });
});

describe("código privado y consulta sin datos de cuenta", () => {
  it("emite secretos aleatorios de 256 bits y guarda una representación SHA-256 distinta", async () => {
    const first = await issueReceiptAccessCode();
    const second = await issueReceiptAccessCode();
    expect(first.code).toMatch(/^[a-f0-9]{64}$/);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.code).not.toBe(first.hash);
    expect(first.code).not.toBe(second.code);
    expect(first.hash).toBe(await hashReceiptAccessCode(first.code));
  });
  it("envía al RPC sólo hashes y filtra campos privados incluso si aparecen en su respuesta", async () => {
    mocks.serverRpc.mockResolvedValue({ data: { ...receipt, contact_email: "private@agorbis.test", access_hash: "private", verification_note: "private" }, error: null });
    const ev = fixture();
    await expect(lookupDeletionReceipt(ev, { reference, access_code: code })).resolves.toEqual(receipt);
    expect(mocks.serverRpc).toHaveBeenCalledWith("read_data_deletion_receipt", {
      p_reference: reference,
      p_access_hash: await hashReceiptAccessCode(code),
      p_source_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    const payload = JSON.stringify(mocks.serverRpc.mock.calls);
    expect(payload).not.toContain(code);
    expect(payload).not.toContain("192.0.2.20");
    expect(payload).not.toContain("local-fixture-secret");
  });
  it.each([
    { reference: "00000000-0000-4000-8000-000000000099", access_code: code },
    { reference, access_code: "b".repeat(64) },
  ])("no distingue referencia o código incorrectos", async (input) => {
    mocks.serverRpc.mockResolvedValue({ data: null, error: null });
    await expect(lookupDeletionReceipt(fixture(), input)).resolves.toBeNull();
  });
  it("usa la misma ausencia de recibo para vencimiento, límite y fallos internos", async () => {
    const ev = fixture();
    mocks.serverRpc.mockResolvedValueOnce({ data: null, error: null });
    mocks.serverRpc.mockResolvedValueOnce({ data: receipt, error: { message: "fixture backend failure" } });
    mocks.serverRpc.mockRejectedValueOnce(new Error("fixture transport failure"));
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(lookupDeletionReceipt(ev, { reference, access_code: code })).resolves.toBeNull();
    }
  });
  it.each([
    { reference: "not-a-reference", access_code: code },
    { reference, access_code: "not-a-code" },
    { reference, access_code: code.repeat(10) },
  ])("rechaza entradas mal formadas sin tocar el servidor", async (input) => {
    await expect(lookupDeletionReceipt(fixture(), input)).resolves.toBeNull();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });
  it.each([
    { runtime: "not-cloudflare" },
    { ip: "192.0.2.20, 192.0.2.21" },
    { ip: "" },
    { secret: "" },
  ])("no admite saltarse el límite cuando no hay IP confiable o secreto", async (options) => {
    await expect(lookupDeletionReceipt(fixture(options), { reference, access_code: code })).resolves.toBeNull();
    expect(mocks.serverRpc).not.toHaveBeenCalled();
  });
  it("agrupa el desarrollo local y deriva claves diferentes para fuentes distintas", async () => {
    const first = await receiptLookupSourceHash(fixture());
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(await receiptLookupSourceHash(fixture())).toBe(first);
    expect(await receiptLookupSourceHash(fixture({ ip: "192.0.2.21" }))).not.toBe(first);
    expect(await receiptLookupSourceHash(fixture({ host: "localhost", runtime: "local", ip: "" }))).toMatch(/^[a-f0-9]{64}$/);
  });
});
