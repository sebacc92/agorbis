import type { RequestEventAction } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  unlinkIdentity: vi.fn(),
  logFailure: vi.fn(),
}));
vi.mock("./session", () => ({
  requireUser: mocks.requireUser,
  supabase: () => ({
    rpc: mocks.rpc,
    auth: { signOut: mocks.signOut, unlinkIdentity: mocks.unlinkIdentity },
  }),
}));
vi.mock("./log", () => ({ logFailure: mocks.logFailure }));

import {
  GOOGLE_CONSENT_CONFIRM_REQUIRED,
  GOOGLE_CONSENT_WITHDRAW_FAILED,
  loadGoogleConsentAccount,
  parseGoogleConsentAccount,
  withdrawGoogleConsentForAccount,
} from "./google-consent-account";

const inactive = {
  provider: "google",
  status: "unavailable",
  current_version: null,
  current_content_hash: null,
  notice_version: null,
  notice_hash: null,
  accepted_at: null,
  withdrawn_at: null,
  last_withdrawn_at: null,
  locale: null,
};
const withdrawn = {
  ...inactive,
  status: "withdrawn",
  withdrawn_at: "2026-09-08T18:23:20.123456+00:00",
  last_withdrawn_at: "2026-09-08T18:23:20.123456+00:00",
};

function event() {
  return {
    headers: new Headers(),
    env: { get: vi.fn(() => "false") },
    fail: vi.fn((status: number, value: Record<string, unknown>) => ({
      failed: true,
      status,
      ...value,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "own-account" });
});

describe("consulta y retiro del consentimiento Google desde la cuenta", () => {
  it("acepta ausencia de aviso y un retiro sin aceptación previa", () => {
    expect(parseGoogleConsentAccount(inactive)).toEqual(inactive);
    expect(parseGoogleConsentAccount(withdrawn)).toEqual(withdrawn);
  });

  it.each([
    null,
    [withdrawn],
    { ...withdrawn, provider: "facebook" },
    { ...withdrawn, status: "approved" },
    { ...withdrawn, last_withdrawn_at: "fecha ilegible" },
    { ...withdrawn, current_content_hash: "a" },
  ])("no acepta un resultado desconocido como prueba: %j", (value) => {
    expect(parseGoogleConsentAccount(value)).toBeNull();
  });

  it("consulta sin requerir proveedor habilitado, residencia ni aceptación general", async () => {
    const ev = event();
    mocks.rpc.mockResolvedValue({ data: inactive, error: null });
    await expect(
      loadGoogleConsentAccount(ev as unknown as RequestEventAction),
    ).resolves.toEqual(inactive);
    expect(mocks.requireUser).toHaveBeenCalledWith(ev);
    expect(mocks.rpc).toHaveBeenCalledWith("my_google_auth_consent");
    expect(ev.env.get).not.toHaveBeenCalled();
    expect(ev.headers.get("Cache-Control")).toBe("private, no-store");
    expect(ev.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(ev.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("distingue un fallo de consulta de la ausencia de consentimiento", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "08006" } });
    await expect(
      loadGoogleConsentAccount(event() as unknown as RequestEventAction),
    ).resolves.toBeNull();
    expect(mocks.logFailure).toHaveBeenCalledOnce();
  });

  it.each([undefined, "no", "true", "SI"])(
    "exige confirmación explícita antes de retirar: %s",
    async (confirmation) => {
      const ev = event();
      await expect(
        withdrawGoogleConsentForAccount(
          { confirm_withdrawal: confirmation },
          ev as unknown as RequestEventAction,
        ),
      ).resolves.toMatchObject({
        status: 400,
        message: GOOGLE_CONSENT_CONFIRM_REQUIRED,
      });
      expect(mocks.rpc).not.toHaveBeenCalled();
    },
  );

  it("retira sin aviso activo ni flag, y conserva sesión e identidad", async () => {
    const ev = event();
    mocks.rpc.mockResolvedValue({ data: withdrawn, error: null });
    await expect(
      withdrawGoogleConsentForAccount(
        { confirm_withdrawal: "si" },
        ev as unknown as RequestEventAction,
      ),
    ).resolves.toEqual({ saved: true, consent: withdrawn });
    expect(mocks.rpc).toHaveBeenCalledWith("withdraw_google_auth_consent");
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(ev.env.get).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.unlinkIdentity).not.toHaveBeenCalled();
    expect(ev.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    { data: withdrawn, error: { code: "08006" } },
    { data: inactive, error: null },
    { data: { ...withdrawn, last_withdrawn_at: null }, error: null },
    { data: null, error: null },
  ])("no anuncia retiro si no pudo confirmarlo: %j", async (response) => {
    mocks.rpc.mockResolvedValue(response);
    await expect(
      withdrawGoogleConsentForAccount(
        { confirm_withdrawal: "si" },
        event() as unknown as RequestEventAction,
      ),
    ).resolves.toMatchObject({
      status: 503,
      message: GOOGLE_CONSENT_WITHDRAW_FAILED,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.unlinkIdentity).not.toHaveBeenCalled();
  });

  it("una visita o un envío anónimo no llega a las RPC", async () => {
    const redirect = new Error("authentication required");
    mocks.requireUser.mockRejectedValue(redirect);
    const ev = event() as unknown as RequestEventAction;
    await expect(loadGoogleConsentAccount(ev)).rejects.toBe(redirect);
    await expect(
      withdrawGoogleConsentForAccount({ confirm_withdrawal: "si" }, ev),
    ).rejects.toBe(redirect);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
