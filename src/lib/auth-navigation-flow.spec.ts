import type { QRL } from "@qwik.dev/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  verifyOtp: vi.fn(),
  signUp: vi.fn(),
  hasCurrentLegalAcceptance: vi.fn(),
}));

vi.mock("~/lib/session", () => ({
  requireUser: mocks.requireUser,
  supabase: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("~/lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/supabase")>()),
  createServerSupabase: () => ({ from: mocks.from, auth: { verifyOtp: mocks.verifyOtp } }),
}));
vi.mock("~/lib/protected-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/protected-auth")>()),
  signUpWithTurnstile: mocks.signUp,
}));
vi.mock("~/lib/legal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/legal")>()),
  hasCurrentLegalAcceptance: mocks.hasCurrentLegalAcceptance,
}));
vi.mock("~/routes/layout", () => ({ useLocaleLoader: vi.fn() }));

import { useSignUp } from "~/routes/registro";
import { useConfirmEmail } from "~/routes/auth/confirm";
import { useAcceptLegal } from "~/routes/consentimiento";
import { useConfirmResidence, useSaveName } from "~/routes/onboarding";
import { INTERNATIONAL_TRANSFER_NOTICE_VERSION } from "~/lib/legal";

const publication = "/c/barrio/reclamos/nuevo?categoria=veredas#descripcion";

function event() {
  return {
    url: new URL("https://agorbis.com/"),
    locale: () => "es",
    redirect: (status: number, location: string) => Object.assign(new Error("redirect"), { status, location }),
    fail: (status: number, data: unknown) => ({ status, data }),
  };
}

async function redirectOf(action: unknown, data: Record<string, unknown>): Promise<URL> {
  // Ejecutamos el QRL real de la action, con Auth/BD simulados; no se omite
  // ningún paso de navegación ni se crean sesiones o cuentas remotas.
  const handler = await (action as { __qrl: QRL<(input: unknown, ev: unknown) => Promise<unknown>> }).__qrl.resolve();
  try {
    await handler(data, event());
  } catch (error) {
    expect(error).toMatchObject({ status: expect.any(Number), location: expect.any(String) });
    return new URL((error as { location: string }).location, "https://agorbis.com");
  }
  throw new Error("La action no redirigió");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "user-id", profile: { home_community_id: null } });
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
  mocks.hasCurrentLegalAcceptance.mockResolvedValue(false);
  mocks.signUp.mockResolvedValue({ turnstileVerified: true, result: { data: { session: null }, error: null } });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: table === "communities" ? { id: "barrio-id", slug: "barrio" } : { home_community_id: null }, error: null })),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return query;
  });
});

describe("retorno a la publicación después de crear una cuenta", () => {
  it("conserva next por el correo, consentimiento, nombre y residencia", async () => {
    const signUpHandler = await (useSignUp as unknown as { __qrl: QRL<(data: unknown, ev: unknown) => Promise<unknown>> }).__qrl.resolve();
    await signUpHandler({ email: "vecina@example.test", password: "UnaComunidad-2026!", turnstile_token: "token-a", next: publication }, event());
    expect(mocks.signUp).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ next: publication }));

    const consent = await redirectOf(useConfirmEmail, { type: "signup", token_hash: "valid-token-hash-fixture", next: publication });
    expect(consent.pathname).toBe("/consentimiento");
    expect(consent.searchParams.get("next")).toBe(publication);

    const onboarding = await redirectOf(useAcceptLegal, { next: consent.searchParams.get("next"), legal_consent: "si", international_transfers_consented: "si" });
    expect(onboarding.pathname).toBe("/onboarding");
    expect(onboarding.searchParams.get("next")).toBe(publication);
    // Conserva los dos registros legales, sin atribuir al registro una
    // aceptación que sólo puede persistir la cuenta autenticada.
    expect(mocks.rpc).toHaveBeenCalledWith("accept_current_legal", { p_minimum_age_attested: true });
    expect(mocks.rpc).toHaveBeenCalledWith("grant_current_international_transfer_consent", { p_expressly_accepted: true, p_locale: "es", p_version: INTERNATIONAL_TRANSFER_NOTICE_VERSION });

    const location = await redirectOf(useSaveName, { username: "vecina", display_name: "Vecina", next: onboarding.searchParams.get("next") });
    expect(location.pathname).toBe("/onboarding");
    expect(location.searchParams.get("paso")).toBe("lugar");
    expect(location.searchParams.get("next")).toBe(publication);

    const destination = await redirectOf(useConfirmResidence, { community_slug: "barrio", next: location.searchParams.get("next") });
    expect(`${destination.pathname}${destination.search}${destination.hash}`).toBe(publication);
  });

  it("el alta con sesión inmediata conserva next antes de aceptar los documentos", async () => {
    mocks.signUp.mockResolvedValue({ turnstileVerified: true, result: { data: { session: {} }, error: null } });
    const destination = await redirectOf(useSignUp, { email: "vecina@example.test", password: "UnaComunidad-2026!", turnstile_token: "token-a", next: publication });
    expect(destination.pathname).toBe("/consentimiento");
    expect(destination.searchParams.get("next")).toBe(publication);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("la confirmación sin acuerdos pendientes todavía conserva next al pedir la residencia", async () => {
    mocks.hasCurrentLegalAcceptance.mockResolvedValue(true);
    const destination = await redirectOf(useConfirmEmail, { type: "signup", token_hash: "valid-token-hash-fixture", next: publication });
    expect(destination.pathname).toBe("/onboarding");
    expect(destination.searchParams.get("next")).toBe(publication);
  });

  it("una cuenta con residencia vuelve directamente a next después del consentimiento", async () => {
    mocks.requireUser.mockResolvedValue({ userId: "user-id", profile: { home_community_id: "barrio-id" } });
    const destination = await redirectOf(useAcceptLegal, { next: publication, legal_consent: "si", international_transfers_consented: "si" });
    expect(`${destination.pathname}${destination.search}${destination.hash}`).toBe(publication);
  });

  it.each([undefined, "https://evil.example", "//evil.example", "/\\evil.example"])("al terminar residencia usa la comunidad para next ausente o externo: %s", async (next) => {
    const destination = await redirectOf(useConfirmResidence, { community_slug: "barrio", next });
    expect(destination.origin).toBe("https://agorbis.com");
    expect(destination.pathname).toBe("/c/barrio");
  });

  it("recuperar acceso sigue enviando a cambiar contraseña aunque haya otro next", async () => {
    const destination = await redirectOf(useConfirmEmail, { type: "recovery", token_hash: "valid-token-hash-fixture", next: publication });
    expect(`${destination.pathname}${destination.search}`).toBe("/perfil/contrasena?recovery=1");
    expect(mocks.hasCurrentLegalAcceptance).not.toHaveBeenCalled();
  });
});
