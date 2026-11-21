import { describe, expect, it } from "vitest";
import {
  publicationDateTime,
  publicationInstant,
  publicationTimeZones,
} from "./publication-time";

describe("hora de cierre en una zona explícita", () => {
  it.each([
    [
      "2030-08-01T19:00",
      "America/Argentina/Buenos_Aires",
      "2030-08-01T22:00:00.000Z",
    ],
    ["2030-08-01T19:00", "Pacific/Auckland", "2030-08-01T07:00:00.000Z"],
    ["2030-01-01T00:15", "Asia/Kathmandu", "2029-12-31T18:30:00.000Z"],
    ["2030-08-01T19:00", "UTC", "2030-08-01T19:00:00.000Z"],
  ])("interpreta %s en %s sin usar la zona del proceso", (local, zone, iso) => {
    expect(publicationInstant(local, zone)).toEqual({ valid: true, iso });
    expect(publicationDateTime(new Date(iso), zone)).toBe(local);
  });
  it.each([
    ["2030-03-10T02:30", "America/New_York", "missing"],
    ["2030-11-03T01:30", "America/New_York", "ambiguous"],
    ["2030-02-30T12:00", "UTC", "date"],
    ["2030-01-01T24:00", "UTC", "date"],
    ["2030-01-01T12:00", "zona inventada", "zone"],
  ])("rechaza %s en %s con motivo %s", (local, zone, reason) => {
    expect(publicationInstant(local, zone)).toEqual({ valid: false, reason });
  });
  it("incluye UTC y el alias elegido entre las zonas que ofrece el servidor", () => {
    const choices = publicationTimeZones("America/Argentina/Buenos_Aires");
    expect(choices).toContain("UTC");
    expect(choices).toContain("America/Argentina/Buenos_Aires");
    expect(new Set(choices).size).toBe(choices.length);
  });
});
