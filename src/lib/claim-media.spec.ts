import { describe, expect, it } from "vitest";
import {
  claimDraftMediaUrl,
  claimPublishedMediaUrl,
  isClaimDraftUploadPath,
  isOwnedClaimDraftUploadPath,
  safeClaimMediaUrl,
} from "./claim-media";

const USER = "11111111-1111-4111-8111-111111111111";
const CLAIM = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333.webp";

describe("claim media paths", () => {
  it("usa un pending opaco que no contiene el UUID del usuario", () => {
    const path = `pending/${FILE}`;
    expect(isClaimDraftUploadPath(path)).toBe(true);
    expect(path).not.toContain(USER);
    expect(claimDraftMediaUrl(path)).toBe(
      `/media/reclamos/pendientes/${FILE}`,
    );
  });

  it("sólo tolera el formato legacy cuando pertenece a la sesión", () => {
    expect(isOwnedClaimDraftUploadPath(`${USER}/${FILE}`, USER)).toBe(true);
    expect(
      isOwnedClaimDraftUploadPath(
        `44444444-4444-4444-8444-444444444444/${FILE}`,
        USER,
      ),
    ).toBe(false);
    expect(isOwnedClaimDraftUploadPath(`pending/../${FILE}`, USER)).toBe(false);
  });

  it("publica sólo namespace de reclamo y filtra rutas internas malformadas", () => {
    const url = `/media/reclamos/${CLAIM}/${FILE}`;
    expect(claimPublishedMediaUrl(CLAIM, FILE)).toBe(url);
    expect(safeClaimMediaUrl(url)).toBe(url);
    expect(safeClaimMediaUrl(`/media/reclamos/${USER}/../${FILE}`)).toBeNull();
    expect(safeClaimMediaUrl("javascript:alert(1)")).toBeNull();
  });
});
