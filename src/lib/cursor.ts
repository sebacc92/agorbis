/**
 * Paginación por cursor sobre `(created_at, id)`.
 *
 * Los listados paginaban con `.lt("created_at", cursor)` a secas. Dos filas
 * con el mismo `created_at` en el borde de una página hacían que la siguiente
 * consulta descartara **todas** las de ese instante, incluidas las que nunca
 * se habían mostrado: no se salteaban, desaparecían. Es fácil de provocar con
 * contenido importado o sembrado en lote, donde varias filas comparten
 * timestamp exacto.
 *
 * Agregar el `id` como desempate cierra el caso, porque `(created_at, id)` sí
 * es único. `poll_feed` ya lo resolvía así desde la migración 0006 —compara
 * `(p.created_at, p.id) < (p_before_created, p_before_id)`— y estos ayudantes
 * llevan el mismo criterio a los listados que se arman desde TypeScript, con
 * los mismos nombres de parámetro en la URL (`antes` e `id`).
 *
 * Sin imports: lo usan rutas de servidor y las pruebas lo transpilan solo.
 */

export interface Cursor {
  created_at: string;
  id: string;
}

/**
 * Un `timestamptz` tal como lo devuelve PostgREST.
 *
 * Fecha y hora obligatorias; los segundos fraccionarios y el desplazamiento
 * son opcionales porque Postgres los omite cuando no hacen falta. Se acepta
 * tanto `Z` como `±HH:MM` y también `±HHMM`/`±HH`, que es lo que emite
 * `to_char` en algunas configuraciones.
 */
const TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/;

/** Las cuatro tablas que se paginan con esto tienen `id uuid`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ¿El día existe en el calendario?
 *
 * `TIMESTAMP` comprueba la forma, no el contenido: `2026-02-31` la cumple.
 * `Date.parse` tampoco alcanza —desborda al 3 de marzo en vez de devolver
 * `NaN`— así que se reconstruye la fecha y se comparan los tres componentes.
 * Postgres rechaza el valor imposible con un error, y el listado terminaría
 * contestando 500 por un parámetro que ya se podía descartar acá.
 */
function isRealDate(timestamp: string): boolean {
  const [year, month, day] = timestamp
    .slice(0, 10)
    .split("-")
    .map((part) => Number(part));
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * El cursor que viaja en la URL, o `null` si es la primera página.
 *
 * Los dos valores se validan antes de devolverlos, y no por prolijidad: el
 * `created_at` termina interpolado dentro del filtro `or(...)` que arma
 * `beforeCursor`, que es una gramática, no un parámetro. Un `id` con un
 * paréntesis y una coma —`?id=0),recipient_id.neq.0`— cierra el `and(...)` y
 * agrega una rama propia al `or`, anulándolo. RLS sigue siendo el límite real
 * y por eso esto no exponía datos de otros, pero un filtro que el visitante
 * puede reescribir no es un filtro.
 *
 * `/inicio` no arma texto —pasa los valores como argumentos tipados a
 * `personalized_feed(…, timestamptz, uuid)`— así que ahí el mismo `?id=x` que
 * antes reventaba con un error de cast y un 500 ahora simplemente arranca
 * desde la primera página.
 *
 * Ante un cursor inválido se ignora entero y no sólo la mitad rota: quedarse
 * con un solo valor deja el desempate sin la otra columna, que es exactamente
 * el comportamiento que estos ayudantes existen para corregir.
 */
export function readCursor(params: URLSearchParams): Cursor | null {
  const created_at = params.get("antes");
  const id = params.get("id");
  if (!created_at || !id) return null;
  if (!TIMESTAMP.test(created_at) || !UUID.test(id)) return null;
  if (!isRealDate(created_at)) return null;
  return { created_at, id };
}

/**
 * Filtro de PostgREST para "estrictamente anterior al cursor", en orden
 * descendente.
 *
 * Se expresa como `or(a, and(b, c))` y no como la comparación de tuplas de
 * SQL porque PostgREST no la expone. Los valores se pegan tal cual: no hay
 * escapado posible dentro de esta gramática, así que lo que la mantiene sana
 * es que `readCursor` sea la única puerta de entrada y ya haya comprobado que
 * son un timestamp y un UUID: ninguno de los dos puede contener una coma ni un
 * paréntesis, que son los dos caracteres con los que se arma la estructura.
 */
export function beforeCursor(cursor: Cursor): string {
  return [
    `created_at.lt.${cursor.created_at}`,
    `and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
  ].join(",");
}

/**
 * Los parámetros de la página siguiente, ya escapados.
 *
 * Devuelve `null` cuando la página no estaba llena: si no hay más filas, no
 * hay enlace que ofrecer.
 */
export function nextCursorParams(
  rows: { created_at: string; id: string }[],
  pageSize: number,
): string | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1]!;
  return `antes=${encodeURIComponent(last.created_at)}&id=${encodeURIComponent(last.id)}`;
}
