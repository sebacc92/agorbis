import { describe, expect, it } from "vitest";
import { pendingTotpForRetry } from "./pending-totp";

const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
describe("retomar un TOTP pendiente", () => {
  it("admite sólo el factor TOTP pendiente que devolvió la cuenta actual", () => {
    expect(pendingTotpForRetry([{ id, type: "totp", status: "unverified" }], id)).toBe(id);
    expect(pendingTotpForRetry([{ id, type: "totp", status: "unverified" }], otherId)).toBeNull();
  });
  it.each([undefined, null, "", "no-es-un-id", new File(["id"], "factor")])("no confía en un identificador enviado: %s", (value) => {
    expect(pendingTotpForRetry([{ id, type: "totp", status: "unverified" }], value)).toBeNull();
  });
  it.each([
    { id, type: "totp", status: "verified" },
    { id, type: "phone", status: "unverified" },
    { id, type: "webauthn", status: "unverified" },
  ])("no retoma otros tipos ni un alta ya terminada", (factor) => {
    expect(pendingTotpForRetry([factor], id)).toBeNull();
  });
});
