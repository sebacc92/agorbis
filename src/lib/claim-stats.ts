import type { RequestEventCommon } from "@qwik.dev/router";
import { CLAIM_CATEGORIES, LOAD_FAILED } from "./constants";
import type { ClaimCategory, ClaimStatus } from "./database.types.helpers";
import { resolveLocale, translate } from "./i18n";
import { logFailure } from "./log";
import { requestIdOf } from "./request-id";
import type { DB } from "./supabase";

/**
 * Conteos de reclamos que se pueden auditar.
 *
 * Rendición y comparativa traían todas las filas de `claims` de la comunidad y
 * contaban en JS. Parecía exacto y no lo era: PostgREST corta en `max_rows =
 * 1000` (`supabase/config.toml`) sin avisar, así que en una comunidad con 1.500
 * reclamos la "tasa de resolución" salía de las primeras mil filas que
 * devolvía el plan, presentada como el total. Además cada visita bajaba miles
 * de filas para tirarlas.
 *
 * Acá cada número es un `count: "exact"` con `head: true`: Postgres cuenta y
 * no viaja ninguna fila, así que no hay recorte posible. Las consultas son
 * independientes y salen en paralelo.
 */

/**
 * Lo que el listado de reclamos llama "abiertos" (`/c/<slug>/reclamos?estado=
 * abiertos`). Antes "en curso" se calculaba como `total - resueltos`, y eso
 * contaba los rechazados como si alguien siguiera trabajando en ellos.
 */
export const OPEN_CLAIM_STATUSES = [
  "open",
  "under_review",
  "acknowledged",
  "in_progress",
] as const satisfies readonly ClaimStatus[];

export type ClaimCountScope = "visible" | "resolved" | "open";

export interface ClaimTally {
  /** Todos menos los retirados por moderación: lo que se ve publicado. */
  total: number;
  resolved: number;
  /** Abiertos de verdad; los rechazados no entran ni acá ni en resueltos. */
  open: number;
  /** Porcentaje entero de resueltos sobre el total; 0 si no hay reclamos. */
  rate: number;
}

export interface CategoryClaimTally extends ClaimTally {
  key: ClaimCategory;
  label: string;
  emoji: string;
}

/** Lo que devuelve un `select(..., { count, head: true })` de PostgREST. */
interface CountResult {
  count: number | null;
  error: { message?: string; code?: string } | null;
}

/** Basta con `from`: así los tests pueden pasar un cliente falso mínimo. */
export type CountClient = Pick<DB, "from">;

export function resolutionRate(resolved: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((resolved / total) * 100);
}

export function makeTally(
  total: number,
  resolved: number,
  open: number,
): ClaimTally {
  return { total, resolved, open, rate: resolutionRate(resolved, total) };
}

/**
 * Un conteo exacto, o 500.
 *
 * Igual que `many`/`single` en `query.ts`: un conteo fallido no es cero. Un
 * `count` nulo sin error tampoco: significa que PostgREST no contó (por
 * ejemplo, si alguien saca el `count: "exact"`), y mostrar "0 reclamos" en una
 * rendición de cuentas sería afirmar algo que nadie midió.
 */
export async function exactCount(
  ev: RequestEventCommon,
  scope: string,
  query: PromiseLike<CountResult>,
): Promise<number> {
  const { count, error } = await query;
  if (error || typeof count !== "number") {
    logFailure(
      { scope, requestId: requestIdOf(ev) },
      error ?? { message: "count ausente en la respuesta" },
    );
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }
  return count;
}

function claimCountQuery(
  db: CountClient,
  communityId: string,
  scope: ClaimCountScope,
  category?: ClaimCategory,
) {
  let query = db
    .from("claims")
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId);

  if (scope === "resolved") query = query.eq("status", "resolved");
  else if (scope === "open")
    query = query.in("status", [...OPEN_CLAIM_STATUSES]);
  else query = query.neq("status", "removed");

  if (category) query = query.eq("category", category);
  return query;
}

/** Total, resueltos y abiertos de una comunidad (o de una categoría suya). */
export async function claimTally(
  ev: RequestEventCommon,
  db: CountClient,
  scope: string,
  communityId: string,
  category?: ClaimCategory,
): Promise<ClaimTally> {
  const [total, resolved, open] = await Promise.all(
    (["visible", "resolved", "open"] as const).map((kind) =>
      exactCount(
        ev,
        `${scope}/${kind}`,
        claimCountQuery(db, communityId, kind, category),
      ),
    ),
  );
  return makeTally(total, resolved, open);
}

/**
 * El desglose por categoría de una comunidad, más el total general.
 *
 * El general se suma de las categorías en vez de pedirse aparte: la columna
 * tiene un `check` (`claims_category_chk`) con exactamente las claves de
 * `CLAIM_CATEGORIES`, así que no hay reclamo que quede afuera, y son tres
 * viajes menos por visita. Si se agrega una categoría a la base sin agregarla
 * a la constante, este total queda corto: por eso la constante y el `check`
 * se cambian juntos.
 */
export async function categoryClaimTallies(
  ev: RequestEventCommon,
  db: CountClient,
  scope: string,
  communityId: string,
): Promise<{ overall: ClaimTally; byCategory: CategoryClaimTally[] }> {
  const byCategory = await Promise.all(
    CLAIM_CATEGORIES.map(async (cat) => ({
      key: cat.key,
      label: cat.label,
      emoji: cat.emoji,
      ...(await claimTally(
        ev,
        db,
        `${scope}/${cat.key}`,
        communityId,
        cat.key,
      )),
    })),
  );

  const sum = (pick: (tally: ClaimTally) => number) =>
    byCategory.reduce((acc, tally) => acc + pick(tally), 0);

  return {
    overall: makeTally(
      sum((t) => t.total),
      sum((t) => t.resolved),
      sum((t) => t.open),
    ),
    byCategory,
  };
}

/** Totales de varias comunidades, por id. Para la comparativa territorial. */
export async function communityClaimTallies(
  ev: RequestEventCommon,
  db: CountClient,
  scope: string,
  communityIds: readonly string[],
): Promise<Map<string, ClaimTally>> {
  const tallies = await Promise.all(
    communityIds.map(
      async (id) => [id, await claimTally(ev, db, scope, id)] as const,
    ),
  );
  return new Map(tallies);
}
