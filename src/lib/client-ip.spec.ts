import type { RequestEventBase } from "@qwik.dev/router";
import { describe, expect, it } from "vitest";
import { getTrustedClientIp } from "./client-ip";

function event(
  headers: HeadersInit,
  runtime = "cloudflare-workers",
): RequestEventBase {
  return {
    request: new Request("https://agorbis.com/", { headers }),
    env: {
      get(name: string) {
        return name === "AGORBIS_RUNTIME" ? runtime : undefined;
      },
    },
  } as unknown as RequestEventBase;
}

describe("IP confiable de Cloudflare", () => {
  it.each(["203.0.113.7", "2001:db8::7", "::ffff:192.0.2.7"])(
    "acepta una única IP literal con runtime marker: %s",
    (ip) => {
      expect(getTrustedClientIp(event({ "CF-Connecting-IP": ip }))).toBe(ip);
    },
  );

  it("ignora el header si falta el runtime marker server-only", () => {
    expect(
      getTrustedClientIp(event({ "CF-Connecting-IP": "203.0.113.7" }, "")),
    ).toBeUndefined();
  });

  it("rechaza listas, valores inválidos y headers forwarded alternativos", () => {
    expect(
      getTrustedClientIp(
        event({ "CF-Connecting-IP": "203.0.113.7, 198.51.100.2" }),
      ),
    ).toBeUndefined();
    expect(
      getTrustedClientIp(event({ "CF-Connecting-IP": "999.0.0.1" })),
    ).toBeUndefined();
    expect(
      getTrustedClientIp(
        event({
          "x-forwarded-for": "203.0.113.7",
          "x-vercel-forwarded-for": "203.0.113.8",
        }),
      ),
    ).toBeUndefined();
  });
});
