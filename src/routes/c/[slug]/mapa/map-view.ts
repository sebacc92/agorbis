import {
  formatPublicCoordinate,
  toPublicLocationPoint,
  type PublicLocationPoint,
} from "~/lib/geolocation-privacy";

/**
 * Lógica pura del mapa cívico, separada de la página para poder probarla.
 *
 * El mapa embebía un iframe de openstreetmap.org: la CSP (`frame-src`) lo
 * bloquea, así que la página quedaba en blanco, y además le pasaba a un tercero
 * no declarado la IP de cada visitante y —con "Mi ubicación"— su GPS exacto.
 * Ahora la vista es un esquema propio dibujado con los datos de Agorbis, y
 * OpenStreetMap es un enlace saliente que la persona abre si quiere, siempre
 * con coordenadas redondeadas a la misma cuadrícula pública (~110 m) que usa la
 * base para los reclamos.
 */

export type MapRadius = "all" | "2km" | "1km" | "500m" | "300m";

export const RADIUS_METERS: Record<Exclude<MapRadius, "all">, number> = {
  "300m": 300,
  "500m": 500,
  "1km": 1_000,
  "2km": 2_000,
};
const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_LATITUDE_DEGREE = (EARTH_RADIUS_METERS * Math.PI) / 180;

/** Distancia en línea recta sobre la esfera; nunca se interpreta como recorrido. */
function distanceMeters(
  a: PublicLocationPoint,
  b: PublicLocationPoint,
): number {
  const radians = Math.PI / 180;
  const latitude = Math.sin(((b.lat - a.lat) * radians) / 2);
  const longitude = Math.sin(((b.lng - a.lng) * radians) / 2);
  const haversine =
    latitude ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * longitude ** 2;
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
  );
}

/** Zoom de OpenStreetMap que muestra, más o menos, ese mismo recuadro. */
export const RADIUS_OSM_ZOOM: Record<MapRadius, number> = {
  "300m": 17,
  "500m": 16,
  "1km": 15,
  "2km": 14,
  all: 12,
};

export interface MapPointInput {
  id: string;
  lat: number | null;
  lng: number | null;
}

export interface ProjectedPoint {
  id: string;
  /** Posición en un `viewBox` de 0 a 100, con el centro en (50, 50). */
  x: number;
  y: number;
}

/**
 * Redondea una posición a la cuadrícula pública antes de usarla para nada.
 *
 * Es lo que se hace con el GPS de "Mi ubicación" apenas llega: la posición
 * exacta no se guarda en ninguna señal, así que no puede terminar en un enlace
 * ni en el estado serializado de la página.
 */
export function approximatePoint(
  lat: unknown,
  lng: unknown,
): PublicLocationPoint | null {
  return toPublicLocationPoint(lat, lng);
}

/** Centro del esquema: la ubicación aproximada de la persona, la comunidad o
 * el promedio de los reclamos con coordenadas. `null` si no hay nada. */
export function mapCenter(
  user: PublicLocationPoint | null,
  community: { lat: number | null; lng: number | null },
  claims: readonly MapPointInput[],
): PublicLocationPoint | null {
  if (user) return approximatePoint(user.lat, user.lng);
  const own = approximatePoint(community.lat, community.lng);
  if (own) return own;

  const located = claims.filter(
    (c): c is MapPointInput & { lat: number; lng: number } =>
      c.lat !== null && c.lng !== null,
  );
  if (located.length === 0) return null;
  const lat = located.reduce((sum, c) => sum + c.lat, 0) / located.length;
  const lng = located.reduce((sum, c) => sum + c.lng, 0) / located.length;
  return approximatePoint(lat, lng);
}

/**
 * Proyecta los reclamos en un cuadrado centrado en `center`.
 *
 * Proyección equirectangular local: alcanza para unos pocos kilómetros y no
 * pretende ser cartografía. La longitud se corrige por el coseno de la
 * latitud para que el cuadrado tenga lados parecidos en metros. La inclusión
 * usa distancia circular en metros, antes de proyectar; las esquinas del
 * recuadro ya no cuentan como si estuvieran dentro del radio.
 */
export function projectClaims(
  center: PublicLocationPoint,
  radius: MapRadius,
  claims: readonly MapPointInput[],
): { points: ProjectedPoint[]; located: number; center: PublicLocationPoint } {
  const locatedClaims = claims.flatMap((claim) => {
    const point = approximatePoint(claim.lat, claim.lng);
    return point ? [{ id: claim.id, point }] : [];
  });
  let projectedCenter = approximatePoint(center.lat, center.lng)!;
  let halfLat =
    radius === "all"
      ? 0.003
      : RADIUS_METERS[radius] / METERS_PER_LATITUDE_DEGREE;
  // «Todo» encuadra el conjunto visible, incluso fuera de un municipio: no
  // usa el radio fijo que dejaba puntos fuera a partir de unos 13 km.
  if (radius === "all" && locatedClaims.length) {
    const latitudes = locatedClaims.map(({ point }) => point.lat);
    const longitudes = locatedClaims.map(({ point }) => point.lng);
    projectedCenter = approximatePoint(
      (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
      (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
    )!;
    const fitCos = Math.max(
      Math.cos((projectedCenter.lat * Math.PI) / 180),
      0.01,
    );
    const maxDistance = Math.max(
      ...locatedClaims.flatMap(({ point }) => [
        Math.abs(point.lat - projectedCenter.lat),
        Math.abs(point.lng - projectedCenter.lng) * fitCos,
      ]),
    );
    halfLat = Math.max(0.003, maxDistance * 1.1);
  }
  const cos = Math.max(Math.cos((projectedCenter.lat * Math.PI) / 180), 0.01);
  const halfLng = halfLat / cos;

  const points: ProjectedPoint[] = [];
  for (const { id, point } of locatedClaims) {
    if (
      radius !== "all" &&
      distanceMeters(projectedCenter, point) > RADIUS_METERS[radius]
    )
      continue;
    // Las posiciones vecinas al antimeridiano siguen siendo vecinas.
    const longitudeDelta =
      radius === "all"
        ? point.lng - projectedCenter.lng
        : ((point.lng - projectedCenter.lng + 540) % 360) - 180;
    const dx = longitudeDelta / halfLng;
    const dy = (point.lat - projectedCenter.lat) / halfLat;
    points.push({
      id,
      x: Math.round(Math.max(0, Math.min(100, 50 + dx * 50)) * 100) / 100,
      // En SVG la y crece hacia abajo; el norte queda arriba.
      y: Math.round(Math.max(0, Math.min(100, 50 - dy * 50)) * 100) / 100,
    });
  }
  return { points, located: locatedClaims.length, center: projectedCenter };
}

/**
 * Enlace saliente a OpenStreetMap con coordenadas de 3 decimales.
 *
 * `marker` agrega el pin (para un reclamo); sin él sólo se centra el mapa. Se
 * redondea acá aunque el llamador ya lo haya hecho: es la última barrera antes
 * de que la posición salga del sitio.
 */
export function openStreetMapUrl(
  point: { lat: number; lng: number },
  radius: MapRadius,
  options: { marker?: boolean } = {},
): string | null {
  const approx = approximatePoint(point.lat, point.lng);
  if (!approx) return null;
  const lat = formatPublicCoordinate(approx.lat);
  const lng = formatPublicCoordinate(approx.lng);
  const zoom = RADIUS_OSM_ZOOM[radius];
  const query = options.marker ? `?mlat=${lat}&mlon=${lng}` : "";
  return `https://www.openstreetmap.org/${query}#map=${zoom}/${lat}/${lng}`;
}
