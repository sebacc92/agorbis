import { describe, expect, it } from "vitest";
import {
  approximatePoint,
  mapCenter,
  openStreetMapUrl,
  projectClaims,
} from "./map-view";

describe("approximatePoint", () => {
  it("redondea el GPS a 3 decimales (~110 m) antes de guardarlo", () => {
    expect(approximatePoint(-34.603722, -58.381592)).toEqual({
      lat: -34.604,
      lng: -58.382,
    });
  });

  it("descarta puntos inválidos o fuera del planeta", () => {
    expect(approximatePoint(Number.NaN, 0)).toBeNull();
    expect(approximatePoint(91, 0)).toBeNull();
    expect(approximatePoint(null, null)).toBeNull();
  });
});

describe("openStreetMapUrl", () => {
  it("nunca saca más de 3 decimales del sitio", () => {
    const url = openStreetMapUrl(
      { lat: -34.6037221, lng: -58.3815931 },
      "1km",
      {
        marker: true,
      },
    );
    expect(url).toBe(
      "https://www.openstreetmap.org/?mlat=-34.604&mlon=-58.382#map=15/-34.604/-58.382",
    );
    expect(url).not.toMatch(/\d\.\d{4,}/);
  });

  it("sin marcador sólo centra el mapa y respeta el zoom del radio", () => {
    expect(openStreetMapUrl({ lat: 0, lng: 0 }, "all")).toBe(
      "https://www.openstreetmap.org/#map=12/0.000/0.000",
    );
    expect(openStreetMapUrl({ lat: 1, lng: 2 }, "300m")).toContain("#map=17/");
  });

  it("no arma un enlace con coordenadas inválidas", () => {
    expect(openStreetMapUrl({ lat: 200, lng: 0 }, "1km")).toBeNull();
  });
});

describe("mapCenter", () => {
  const claims = [
    { id: "a", lat: -34.6, lng: -58.4 },
    { id: "b", lat: -34.61, lng: -58.42 },
    { id: "c", lat: null, lng: null },
  ];

  it("prioriza la ubicación de la persona, después la comunidad", () => {
    const user = { lat: -31.4, lng: -64.2 };
    expect(mapCenter(user, { lat: -34, lng: -58 }, claims)).toEqual(user);
    expect(mapCenter(null, { lat: -34.0004, lng: -58 }, claims)).toEqual({
      lat: -34,
      lng: -58,
    });
  });

  it("sin comunidad con coordenadas usa el promedio de los reclamos", () => {
    expect(mapCenter(null, { lat: null, lng: null }, claims)).toEqual({
      lat: -34.605,
      lng: -58.41,
    });
  });

  it("devuelve null si no hay ninguna referencia", () => {
    expect(
      mapCenter(null, { lat: null, lng: null }, [
        { id: "x", lat: null, lng: null },
      ]),
    ).toBeNull();
  });
});

describe("projectClaims", () => {
  const center = { lat: -34.6, lng: -58.4 };

  it.each([
    ["300m", 0.002, 0.003, 0.002],
    ["500m", 0.004, 0.005, 0.004],
    ["1km", 0.008, 0.009, 0.008],
    ["2km", 0.017, 0.018, 0.015],
  ] as const)(
    "%s incluye sólo puntos dentro de la distancia circular en metros",
    (radius, insideLatitude, outsideLatitude, corner) => {
      const result = projectClaims({ lat: 0, lng: 0 }, radius, [
        { id: "dentro", lat: insideLatitude, lng: 0 },
        { id: "fuera", lat: outsideLatitude, lng: 0 },
        { id: "esquina", lat: corner, lng: corner },
      ]);
      expect(result.points.map((point) => point.id)).toEqual(["dentro"]);
      expect(result.located).toBe(3);
    },
  );

  it("calcula distancias de longitud según la latitud", () => {
    const result = projectClaims({ lat: 60, lng: 0 }, "1km", [
      { id: "este", lat: 60, lng: 0.017 },
      { id: "fuera", lat: 60, lng: 0.019 },
      { id: "diagonal", lat: 60.008, lng: 0.016 },
    ]);
    expect(result.points.map((point) => point.id)).toEqual(["este"]);
  });

  it("usa sólo centro y posiciones cuantizadas al decidir el radio", () => {
    const result = projectClaims({ lat: 0.00049, lng: 0 }, "300m", [
      { id: "público-dentro", lat: 0.00249, lng: 0 },
      { id: "público-fuera", lat: 0.00251, lng: 0 },
    ]);
    expect(result.center).toEqual({ lat: 0, lng: 0 });
    expect(result.points.map((point) => point.id)).toEqual(["público-dentro"]);
  });

  it("no pierde un vecino al otro lado del antimeridiano", () => {
    const result = projectClaims({ lat: 0, lng: 179.999 }, "300m", [
      { id: "vecino", lat: 0, lng: -179.999 },
    ]);
    expect(result.points).toHaveLength(1);
    expect(result.points[0].x).toBeGreaterThan(50);
    expect(result.points[0].x).toBeLessThanOrEqual(100);
  });

  it("pone el centro en (50, 50) y el norte arriba", () => {
    const { points } = projectClaims(center, "1km", [
      { id: "centro", lat: -34.6, lng: -58.4 },
      { id: "norte", lat: -34.594, lng: -58.4 },
      { id: "este", lat: -34.6, lng: -58.393 },
    ]);
    const byId = Object.fromEntries(points.map((p) => [p.id, p]));
    expect(byId.centro).toEqual({ id: "centro", x: 50, y: 50 });
    expect(byId.norte.y).toBeLessThan(50);
    expect(byId.norte.x).toBe(50);
    expect(byId.este.x).toBeGreaterThan(50);
  });

  it("deja afuera lo que no entra en el radio pero lo cuenta como ubicado", () => {
    const result = projectClaims(center, "300m", [
      { id: "cerca", lat: -34.601, lng: -58.4 },
      { id: "lejos", lat: -34.7, lng: -58.4 },
      { id: "sin", lat: null, lng: null },
    ]);
    expect(result.points.map((p) => p.id)).toEqual(["cerca"]);
    expect(result.located).toBe(2);
  });

  it("Todo el territorio encuadra todos los puntos y no se corta a unos 13 km", () => {
    const result = projectClaims(center, "all", [
      { id: "cerca", lat: -34.6, lng: -58.4 },
      { id: "cordoba", lat: -31.4, lng: -64.2 },
      { id: "ushuaia", lat: -54.8, lng: -68.3 },
      { id: "sin", lat: null, lng: null },
    ]);
    expect(result.points.map((point) => point.id)).toEqual([
      "cerca",
      "cordoba",
      "ushuaia",
    ]);
    expect(result.located).toBe(3);
    expect(result.center).not.toEqual(center);
    expect(
      result.points.every(
        (point) => point.x > 0 && point.x < 100 && point.y > 0 && point.y < 100,
      ),
    ).toBe(true);
  });

  it("Todo el territorio también encuadra un punto solo sin perder la precisión pública", () => {
    const result = projectClaims(center, "all", [
      { id: "uno", lat: -31.400123, lng: -64.200456 },
    ]);
    expect(result.center).toEqual({ lat: -31.4, lng: -64.2 });
    expect(result.points).toEqual([{ id: "uno", x: 50, y: 50 }]);
  });

  it("todas las posiciones caen dentro del viewBox", () => {
    const claims = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      lat: -34.6 + (i - 25) * 0.0005,
      lng: -58.4 + (25 - i) * 0.0005,
    }));
    for (const p of projectClaims(center, "1km", claims).points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(100);
    }
  });
});
