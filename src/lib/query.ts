import type { RequestEventBase, RequestEventCommon } from "@qwik.dev/router";
import { LOAD_FAILED } from "./constants";
import { resolveLocale, translate } from "./i18n";
import { logFailure } from "./log";
import { requestIdOf } from "./request-id";

/**
 * Una consulta fallida no es un resultado vacío.
 *
 * El patrón `const { data } = await db.from(...)` estaba en 73 lugares y
 * descarta el `error`: cuando la consulta falla, `data` llega `null` y la
 * página se dibuja como si de verdad no hubiera nada. Una comunidad con
 * cuarenta debates anuncia "Todavía no se abrió ningún debate" y ofrece
 * estrenarlo; un reclamo con autor muestra "Cuenta eliminada"; la grilla de
 * cupo dice que no se puede publicar en ningún lado. Son pantallas que mienten
 * con seguridad, y sobre las que la gente actúa.
 *
 * Estos dos ayudantes obligan a elegir. `many`/`single` cortan con 500 —el
 * error es recuperable y el navegador puede reintentar—; `orFallback` degrada
 * a propósito, pero deja rastro en los logs en vez de perder el fallo.
 */

/**
 * Lo que devuelve cualquier consulta de PostgREST.
 *
 * El tipo se infiere del resultado entero y no de `data` sola: supabase-js
 * devuelve una unión discriminada (`{data: T, error: null}` o
 * `{data: null, error: PostgrestError}`), y hacer coincidir un `T | null`
 * contra esa unión colapsaba la inferencia a `never`.
 */
interface AnyResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}

function fail(ev: RequestEventCommon, scope: string, error: unknown): never {
  logFailure({ scope, requestId: requestIdOf(ev) }, error);
  throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
}

/**
 * Filas de una consulta de lista. Corta con 500 si falló.
 *
 * Devuelve `[]` sólo cuando la consulta salió bien y no había nada, que es la
 * única vez que un listado vacío significa lo que dice.
 */
export async function many<R extends AnyResult>(
  ev: RequestEventCommon,
  scope: string,
  query: PromiseLike<R>,
): Promise<NonNullable<R["data"]>> {
  const { data, error } = await query;
  if (error) fail(ev, scope, error);
  return (data ?? []) as NonNullable<R["data"]>;
}

/** server$ no dispone de ev.error: el cliente maneja el rechazo recuperable. */
export async function serverMany<R extends AnyResult>(
  ev: RequestEventBase,
  scope: string,
  query: PromiseLike<R>,
): Promise<NonNullable<R["data"]>> {
  const { data, error } = await query;
  if (error) {
    logFailure({ scope, requestId: requestIdOf(ev) }, error);
    throw new Error(LOAD_FAILED);
  }
  return (data ?? []) as NonNullable<R["data"]>;
}

/**
 * Una fila o `null`. Corta con 500 si falló.
 *
 * `null` queda reservado para "no existe", así el `if (!fila) throw 404` de
 * cada llamador vuelve a significar exactamente eso.
 */
export async function single<R extends AnyResult>(
  ev: RequestEventCommon,
  scope: string,
  query: PromiseLike<R>,
): Promise<NonNullable<R["data"]> | null> {
  const { data, error } = await query;
  if (error) fail(ev, scope, error);
  return (data ?? null) as NonNullable<R["data"]> | null;
}

/**
 * Degrada a un valor por defecto, dejando rastro.
 *
 * Para lo accesorio: un panel lateral, un contador, un resumen. Que la página
 * siga en pie vale más que ese dato — pero el fallo se registra, porque
 * "siempre vacío" y "roto hace tres días" se ven igual desde afuera.
 */
export async function orFallback<R extends AnyResult>(
  scope: string,
  query: PromiseLike<R>,
  fallback: NonNullable<R["data"]>,
): Promise<NonNullable<R["data"]>> {
  const { data, error } = await query;
  if (error) {
    logFailure({ scope }, error);
    return fallback;
  }
  return (data ?? fallback) as NonNullable<R["data"]>;
}
