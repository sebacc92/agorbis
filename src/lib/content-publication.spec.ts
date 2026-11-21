import { describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@qwik.dev/router";
import { publicationResult, publishedContentPath } from "./content-publication";

const destination = "/reclamos/33333333-3333-4333-8333-333333333333";

describe("confirmed publication", () => {
  it("returns an explicit receipt for the browser, preserving a native POST redirect", () => {
    const redirect = vi.fn(() => new Error("redirect"));
    const ev = { internalRequest: "action", redirect } as unknown as RequestEvent;
    const firstVisit = `${destination}?publicado=1`;
    expect(publicationResult(ev, destination)).toEqual({ published: true, redirectTo: firstVisit });
    expect(redirect).not.toHaveBeenCalled();
    const native = { internalRequest: undefined, redirect } as unknown as RequestEvent;
    expect(() => publicationResult(native, destination)).toThrow("redirect");
    expect(redirect).toHaveBeenCalledWith(303, firstVisit);
    expect(publishedContentPath({ published: true, redirectTo: firstVisit })).toBe(firstVisit);
  });

  it.each([
    undefined,
    { preview: { title: "Draft" } },
    { failed: true, message: "Quota exceeded" },
    { redirect: "/ingresar" },
    { published: false, redirectTo: destination },
    { published: true, redirectTo: "https://attacker.invalid" },
    { published: true, redirectTo: "//attacker.invalid" },
    { published: true, redirectTo: "/perfil" },
    { published: true, redirectTo: `${destination}?next=//attacker.invalid` },
  ])("does not mistake a preview, failure or login redirect for a publication: %j", (value) => {
    expect(publishedContentPath(value)).toBeNull();
  });
});

describe("publishedContentPath con acuerdos (D118)", () => {
  it("acepta la página de un acuerdo recién propuesto", async () => {
    const { publishedContentPath } = await import("./content-publication");
    expect(
      publishedContentPath({
        published: true,
        redirectTo: "/acuerdos/a0000000-0000-4000-8000-000000000001",
      }),
    ).toBe("/acuerdos/a0000000-0000-4000-8000-000000000001");
  });
});
