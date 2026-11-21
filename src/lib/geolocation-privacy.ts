/**
 * La ubicación de un reclamo es pública. Tres decimales forman una cuadrícula
 * de aproximadamente 110 m en latitud (y menos en longitud fuera del ecuador):
 * alcanza para ubicar un problema cívico sin conservar el punto GPS exacto.
 *
 * La base repite esta cuantización en un trigger y la exige con un CHECK. Este
 * helper evita que la coordenada exacta sobreviva en la vista previa o vuelva a
 * viajar en el segundo envío del formulario; no reemplaza la garantía SQL.
 */
export const PUBLIC_LOCATION_DECIMALS = 3;
export const PUBLIC_LOCATION_GRID_METERS = 110;

const PUBLIC_LOCATION_SCALE = 10 ** PUBLIC_LOCATION_DECIMALS;

export interface PublicLocationPoint {
  lat: number;
  lng: number;
}

function present(value: unknown): boolean {
  return typeof value === "number"
    ? true
    : typeof value === "string" && value.trim() !== "";
}

function quantizeCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (!present(value)) return null;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }

  // PostgreSQL round(numeric, 3) desempata alejándose de cero. Usar abs/sign
  // mantiene el mismo contrato para valores negativos en el borde x.xxx5.
  const rounded =
    Math.sign(parsed) *
    (Math.round(Math.abs(parsed) * PUBLIC_LOCATION_SCALE) /
      PUBLIC_LOCATION_SCALE);

  // Evita que -0 termine en campos ocultos, URLs o exportaciones.
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Devuelve los dos valores públicos cuantizados o `null` cuando falta una
 * mitad, hay texto inválido o el punto cae fuera del planeta.
 */
export function toPublicLocationPoint(
  lat: unknown,
  lng: unknown,
): PublicLocationPoint | null {
  if (!present(lat) && !present(lng)) return null;
  if (!present(lat) || !present(lng)) return null;

  const publicLat = quantizeCoordinate(lat, -90, 90);
  const publicLng = quantizeCoordinate(lng, -180, 180);
  return publicLat === null || publicLng === null
    ? null
    : { lat: publicLat, lng: publicLng };
}

export function hasAnyLocationCoordinate(lat: unknown, lng: unknown): boolean {
  return present(lat) || present(lng);
}

export function formatPublicCoordinate(value: number): string {
  return value.toFixed(PUBLIC_LOCATION_DECIMALS);
}

/**
 * Decimales con que la posición del GPS sale del navegador en el onboarding:
 * 2 son ~1 km.
 *
 * Para elegir la comunidad alcanza y sobra —las ventanas de búsqueda son de
 * 2° y 7°, cientos de kilómetros—, y así el servidor nunca recibe la posición
 * precisa de la casa de nadie: ni en el cuerpo del pedido ni en los filtros de
 * la consulta a Supabase, que pueden terminar en un log si algo falla. La
 * posición no se guarda en ningún lado: sólo decide a qué comunidad se
 * redirige, y la URL de destino lleva el slug, no coordenadas.
 *
 * Es más grueso que `PUBLIC_LOCATION_DECIMALS` a propósito: esa cuadrícula
 * ubica un problema en la calle; ésta sólo tiene que encontrar una ciudad.
 */
export const GPS_LOOKUP_DECIMALS = 2;

const GPS_LOOKUP_SCALE = 10 ** GPS_LOOKUP_DECIMALS;

/** Redondea una coordenada del GPS a la cuadrícula de búsqueda (~1 km). */
export function coarseLookupCoordinate(value: number): number {
  // `+ 0` normaliza el cero negativo, que zod y el log mostrarían como "-0".
  return Math.round(value * GPS_LOOKUP_SCALE) / GPS_LOOKUP_SCALE + 0;
}
