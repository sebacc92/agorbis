import { describe, expect, it } from "vitest";
import {
  claimResolutionEvidence,
  isClaimProgressEvent,
  isOfficialClaimEvent,
} from "./claim-event-presentation";

describe("autoridad de los movimientos del reclamo", () => {
  it("una resolución sin institución es avance ciudadano y no respuesta oficial", () => {
    const citizen = { event_type: "resolution", organization_id: null };
    const institution = { ...citizen, organization_id: "institution-id" };
    expect(isOfficialClaimEvent(citizen)).toBe(false);
    expect(isClaimProgressEvent(citizen)).toBe(true);
    expect(isOfficialClaimEvent(institution)).toBe(true);
    expect(isClaimProgressEvent(institution)).toBe(false);
    expect(
      isOfficialClaimEvent({
        event_type: "official_response",
        organization_id: "institution-id",
      }),
    ).toBe(true);
  });
});

describe("evidencia visual admitida y documentos enlazables", () => {
  const evidence = (url: string) => [
    { event_type: "resolution", evidence_url: url },
  ];
  it.each(["jpg", "JPEG", "png", "webp", "avif"])(
    "admite %s sólo desde los orígenes ya incluidos en CSP",
    (extension) => {
      const own = `https://agorbis.test/photo.${extension}?download=1`;
      const storage = `https://storage.test/storage/photo.${extension}`;
      expect(
        claimResolutionEvidence(evidence(own), "https://agorbis.test"),
      ).toEqual({ url: own, kind: "image" });
      expect(
        claimResolutionEvidence(
          evidence(storage),
          "https://agorbis.test",
          "https://storage.test/",
        ),
      ).toEqual({ url: storage, kind: "image" });
      const thirdParty = `https://external.test/photo.${extension}`;
      expect(
        claimResolutionEvidence(evidence(thirdParty), "https://agorbis.test"),
      ).toEqual({ url: thirdParty, kind: "link" });
    },
  );
  it.each(["proof.pdf", "report", "proof.svg", "proof.pdf?name=image.jpg"])(
    "mantiene %s como enlace, sin intentar usarlo como imagen",
    (path) => {
      const url = `https://agorbis.test/${path}`;
      expect(
        claimResolutionEvidence(evidence(url), "https://agorbis.test"),
      ).toEqual({ url, kind: "link" });
    },
  );
  it("usa la resolución más reciente y no sustituye su documento por una foto anterior", () => {
    const rows = [
      ...evidence("https://agorbis.test/old.jpg"),
      ...evidence("https://agorbis.test/new.pdf"),
      {
        event_type: "evidence",
        evidence_url: "https://agorbis.test/extra.jpg",
      },
    ];
    expect(claimResolutionEvidence(rows, "https://agorbis.test")).toEqual({
      url: "https://agorbis.test/new.pdf",
      kind: "link",
    });
  });
  it("descarta URLs inseguras y no amplía CSP con una configuración de storage inválida", () => {
    expect(
      claimResolutionEvidence(
        evidence("javascript:alert(1)"),
        "https://agorbis.test",
      ),
    ).toBeNull();
    expect(
      claimResolutionEvidence(
        evidence("https://user:password@agorbis.test/proof.jpg"),
        "https://agorbis.test",
      ),
    ).toBeNull();
    expect(
      claimResolutionEvidence(
        evidence("https://storage.test/proof.jpg"),
        "https://agorbis.test",
        "invalid",
      ),
    ).toMatchObject({ kind: "link" });
  });
});
