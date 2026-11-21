import { describe, expect, it } from "vitest";
import {
  CONTENT_KINDS,
  CONTENT_KIND_TONES,
  isContentKind,
} from "./content-kinds";

describe("tipos de contenido (D123)", () => {
  it("cada tipo tiene ícono, plural y una familia de color completa", () => {
    for (const [kind, meta] of Object.entries(CONTENT_KINDS)) {
      expect(meta.icon).toBeTruthy();
      expect(meta.plural).toBe(meta.plural.toLowerCase());
      const tone = CONTENT_KIND_TONES[kind as keyof typeof CONTENT_KIND_TONES];
      for (const cls of Object.values(tone)) {
        expect(cls).toContain(`kind-${kind}`);
      }
    }
  });

  it("ningún tipo seleccionado usa el violeta de la marca", () => {
    for (const tone of Object.values(CONTENT_KIND_TONES)) {
      expect(tone.selected).not.toContain("brand");
    }
  });

  it("reconoce los cinco tipos y rechaza el resto", () => {
    expect(isContentKind("agreement")).toBe(true);
    expect(isContentKind("claim")).toBe(true);
    expect(isContentKind("toString")).toBe(false);
    expect(isContentKind("")).toBe(false);
  });
});
