import { describe, expect, it } from "vitest";
import {
  ensureHttpPrefix,
  formatCuit,
  formatPhoneNumber,
  validateCuitChecksum,
} from "./input-masks";

describe("input-masks", () => {
  describe("formatCuit", () => {
    it("formats partial and full CUIT numbers", () => {
      expect(formatCuit("20")).toBe("20");
      expect(formatCuit("2012345678")).toBe("20-12345678");
      expect(formatCuit("20123456789")).toBe("20-12345678-9");
      expect(formatCuit("20-12345678-9")).toBe("20-12345678-9");
      expect(formatCuit("abc20-xyz12345678--9000")).toBe("20-12345678-9");
    });
  });

  describe("validateCuitChecksum", () => {
    it("validates valid CUIT with modulo 11", () => {
      // 20-30000000-8:
      // sum = 2*5 + 0*4 + 3*3 + 0 + 0 + 0 + 0 + 0 + 0 + 0 = 10 + 9 = 19
      // remainder = 19 % 11 = 8 -> 11 - 8 = 3 (invalid)
      // Test known valid CUIT: 20-22222222-3
      // sum = 2*(5+4+3+2+7+6+5+4+3+2) = 2*41 = 82
      // remainder = 82 % 11 = 5 -> 11 - 5 = 6 (invalid)
      // Let's test with a generated valid:
      // 20-12345678-?
      // 2*5 + 0*4 + 1*3 + 2*2 + 3*7 + 4*6 + 5*5 + 6*4 + 7*3 + 8*2
      // = 10 + 0 + 3 + 4 + 21 + 24 + 25 + 24 + 21 + 16 = 148
      // 148 % 11 = 5 -> 11 - 5 = 6 -> check digit 6.
      expect(validateCuitChecksum("20-12345678-6")).toBe(true);
      expect(validateCuitChecksum("20-12345678-9")).toBe(false);
      expect(validateCuitChecksum("123")).toBe(false);
    });
  });

  describe("formatPhoneNumber", () => {
    it("formats phone digits nicely", () => {
      expect(formatPhoneNumber("")).toBe("");
      expect(formatPhoneNumber("+541112345678")).toBe("+54 11 1234-5678");
      expect(formatPhoneNumber("11223344")).toBe("1122-3344");
    });
  });

  describe("ensureHttpPrefix", () => {
    it("adds https:// when missing", () => {
      expect(ensureHttpPrefix("")).toBe("");
      expect(ensureHttpPrefix("municipio.gob.ar")).toBe("https://municipio.gob.ar");
      expect(ensureHttpPrefix("https://municipio.gob.ar")).toBe("https://municipio.gob.ar");
      expect(ensureHttpPrefix("http://ong.org")).toBe("http://ong.org");
    });
  });
});
