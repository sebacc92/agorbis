import { describe, expect, it } from "vitest";
import {
  coarseLookupCoordinate,
  formatPublicCoordinate,
  GPS_LOOKUP_DECIMALS,
  hasAnyLocationCoordinate,
  PUBLIC_LOCATION_DECIMALS,
  toPublicLocationPoint,
} from "./geolocation-privacy";

describe("privacidad de geolocalización", () => {
  it("cuantiza ambos ejes a la cuadrícula pública de tres decimales", () => {
    expect(PUBLIC_LOCATION_DECIMALS).toBe(3);
    expect(toPublicLocationPoint(-38.0055274, -57.5426107)).toEqual({
      lat: -38.006,
      lng: -57.543,
    });
  });

  it("usa el mismo desempate que round(numeric, 3) de PostgreSQL", () => {
    expect(toPublicLocationPoint(-1.2345, 1.2345)).toEqual({
      lat: -1.235,
      lng: 1.235,
    });
  });

  it("acepta cero y normaliza cero negativo", () => {
    expect(toPublicLocationPoint("-0", "0")).toEqual({ lat: 0, lng: 0 });
    expect(formatPublicCoordinate(0)).toBe("0.000");
  });

  it("rechaza pares incompletos, no finitos y fuera de rango", () => {
    expect(toPublicLocationPoint("-38", "")).toBeNull();
    expect(toPublicLocationPoint("NaN", "0")).toBeNull();
    expect(toPublicLocationPoint(Infinity, 0)).toBeNull();
    expect(toPublicLocationPoint(91, 0)).toBeNull();
    expect(toPublicLocationPoint(0, -181)).toBeNull();
    expect(hasAnyLocationCoordinate("", " ")).toBe(false);
    expect(hasAnyLocationCoordinate("", "0")).toBe(true);
  });

  it("redondea la posición del onboarding a ~1 km y normaliza cero negativo", () => {
    expect(GPS_LOOKUP_DECIMALS).toBe(2);
    expect(GPS_LOOKUP_DECIMALS).toBeLessThan(PUBLIC_LOCATION_DECIMALS);
    expect(coarseLookupCoordinate(-38.0055274)).toBe(-38.01);
    expect(coarseLookupCoordinate(-57.5426107)).toBe(-57.54);
    expect(coarseLookupCoordinate(151.2093)).toBe(151.21);
    expect(Object.is(coarseLookupCoordinate(-0.001), -0)).toBe(false);
    expect(coarseLookupCoordinate(-0.001)).toBe(0);
  });
});
