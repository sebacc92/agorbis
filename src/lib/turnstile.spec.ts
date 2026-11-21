import type { RequestEventBase } from "@qwik.dev/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TURNSTILE_ACTIONS, verifyTurnstileToken } from "./turnstile";

function event(
  options: {
    hostname?: string;
    env?: Record<string, string>;
    headers?: HeadersInit;
  } = {},
): RequestEventBase {
  const values = {
    TURNSTILE_SECRET: "test-secret",
    TURNSTILE_HOSTNAMES: options.hostname ?? "agorbis.com",
    ...options.env,
  };
  return {
    url: new URL(`https://${options.hostname ?? "agorbis.com"}/registro`),
    request: new Request("https://internal.invalid/registro", {
      headers: options.headers,
    }),
    env: {
      get(name: string) {
        return values[name as keyof typeof values];
      },
    },
  } as unknown as RequestEventBase;
}

function siteverify(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Turnstile Siteverify", () => {
  it("acepta sólo success, action y hostname exactos", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({
        success: true,
        action: TURNSTILE_ACTIONS.signup,
        hostname: "agorbis.com",
      }),
    );

    await expect(
      verifyTurnstileToken(event(), "token-opaco", TURNSTILE_ACTIONS.signup),
    ).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    const body = init?.body as URLSearchParams;
    expect(body.get("response")).toBe("token-opaco");
    expect(body.get("secret")).toBe("test-secret");
    expect(body.has("remoteip")).toBe(false);
  });

  it("falla antes de la red si falta token o allowlist", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(
      verifyTurnstileToken(event(), "", TURNSTILE_ACTIONS.passwordLogin),
    ).resolves.toMatchObject({ ok: false, reason: "token" });
    await expect(
      verifyTurnstileToken(
        event({ env: { TURNSTILE_HOSTNAMES: "" } }),
        "token",
        TURNSTILE_ACTIONS.passwordLogin,
      ),
    ).resolves.toMatchObject({ ok: false, reason: "configuration" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admite el dummy oficial sólo con opt-in local explícito", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        siteverify({ success: true, hostname: "example.com" }),
      );
    const local = event({
      hostname: "127.0.0.1",
      env: {
        TURNSTILE_HOSTNAMES: "127.0.0.1",
        TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
        TURNSTILE_TESTING: "true",
      },
    });

    await expect(
      verifyTurnstileToken(local, "dummy-token", TURNSTILE_ACTIONS.signup),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();

    await expect(
      verifyTurnstileToken(
        event({
          env: {
            TURNSTILE_SECRET: "1x0000000000000000000000000000000AA",
            TURNSTILE_TESTING: "true",
          },
        }),
        "dummy-token",
        TURNSTILE_ACTIONS.signup,
      ),
    ).resolves.toMatchObject({ ok: false, reason: "configuration" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rechaza action y hostname aunque Cloudflare responda success", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        siteverify({
          success: true,
          action: TURNSTILE_ACTIONS.magicLink,
          hostname: "agorbis.com",
        }),
      )
      .mockResolvedValueOnce(
        siteverify({
          success: true,
          action: TURNSTILE_ACTIONS.signup,
          hostname: "otro.agorbis.com",
        }),
      );

    await expect(
      verifyTurnstileToken(event(), "token-1", TURNSTILE_ACTIONS.signup),
    ).resolves.toMatchObject({ ok: false, reason: "action" });
    await expect(
      verifyTurnstileToken(event(), "token-2", TURNSTILE_ACTIONS.signup),
    ).resolves.toMatchObject({ ok: false, reason: "hostname" });
  });

  it("rechaza un replay cuando Siteverify informa timeout-or-duplicate", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        siteverify({
          success: true,
          action: TURNSTILE_ACTIONS.passwordReset,
          hostname: "agorbis.com",
        }),
      )
      .mockResolvedValueOnce(
        siteverify({
          success: false,
          "error-codes": ["timeout-or-duplicate"],
        }),
      );
    const ev = event();

    await expect(
      verifyTurnstileToken(
        ev,
        "token-single-use",
        TURNSTILE_ACTIONS.passwordReset,
      ),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyTurnstileToken(
        ev,
        "token-single-use",
        TURNSTILE_ACTIONS.passwordReset,
      ),
    ).resolves.toEqual({
      ok: false,
      reason: "response",
      siteverifyErrors: ["timeout-or-duplicate"],
    });
  });

  it("conserva sólo códigos de error cortos de Siteverify", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({
        success: false,
        "error-codes": [
          "invalid-input-response",
          "Token=abc persona@agorbis.com",
          42,
          "a".repeat(65),
        ],
      }),
    );

    await expect(
      verifyTurnstileToken(event(), "token", TURNSTILE_ACTIONS.signup),
    ).resolves.toEqual({
      ok: false,
      reason: "response",
      siteverifyErrors: ["invalid-input-response"],
    });
  });

  it("envía sólo la IP exacta que Cloudflare marcó como confiable", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({
        success: true,
        action: TURNSTILE_ACTIONS.resendConfirmation,
        hostname: "agorbis.com",
      }),
    );
    const ev = event({
      env: { AGORBIS_RUNTIME: "cloudflare-workers" },
      headers: {
        "CF-Connecting-IP": "203.0.113.7",
        "x-forwarded-for": "198.51.100.99",
        "x-vercel-forwarded-for": "198.51.100.100",
      },
    });

    await verifyTurnstileToken(
      ev,
      "token",
      TURNSTILE_ACTIONS.resendConfirmation,
    );
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });

  it("omite la IP sin runtime marker o si CF-Connecting-IP es una lista", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      siteverify({
        success: true,
        action: TURNSTILE_ACTIONS.signup,
        hostname: "agorbis.com",
      }),
    );

    await verifyTurnstileToken(
      event({ headers: { "CF-Connecting-IP": "203.0.113.7" } }),
      "token-1",
      TURNSTILE_ACTIONS.signup,
    );
    await verifyTurnstileToken(
      event({
        env: { AGORBIS_RUNTIME: "cloudflare-workers" },
        headers: {
          "CF-Connecting-IP": "203.0.113.7, 198.51.100.99",
        },
      }),
      "token-2",
      TURNSTILE_ACTIONS.signup,
    );

    for (const call of fetchMock.mock.calls) {
      const body = call[1]?.body as URLSearchParams;
      expect(body.has("remoteip")).toBe(false);
    }
  });
});
