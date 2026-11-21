import type { RequestEventCommon } from "@qwik.dev/router";
import { many } from "./query";
import type { DB } from "./supabase";

/**
 * Cuántas filas devuelve PostgREST como máximo por pedido (`max_rows` en
 * `supabase/config.toml`). Pedir más no trae más: corta en silencio.
 */
export const CHILDREN_PAGE = 1000;

/**
 * Techo de vueltas. Cada vuelta descubre al menos una comunidad con hijas y la
 * saca del pedido siguiente, así que en la práctica alcanzan una o dos; el
 * techo existe para que un nivel con miles de nietas no encadene viajes.
 */
export const MAX_CHILDREN_ROUNDS = 4;

export type ChildrenClient = Pick<DB, "from">;

/**
 * Qué comunidades de la lista tienen al menos una hija.
 *
 * Antes era un `select parent_id ... in (300 ids)` sin límite: con 300
 * provincias o partidos de varias decenas de localidades cada uno, las nietas
 * pasan de mil, PostgREST devuelve las primeras mil y las comunidades que
 * quedaban afuera se mostraban como hojas, sin el enlace para bajar de nivel.
 * Es decir, había ciudades a las que no se podía llegar desde Explorar.
 *
 * PostgREST no tiene `distinct`, así que se pregunta por vueltas: cada una
 * trae a lo sumo una página, marca los padres que aparecieron y la siguiente
 * pregunta sólo por los que faltan. Si se agota el techo con padres todavía
 * sin resolver, se los marca como navegables: entrar a uno sin hijas muestra
 * el aviso de hoja y el enlace a su comunidad, mientras que marcarlo como hoja
 * lo dejaría inalcanzable.
 */
export async function parentsWithChildren(
  ev: RequestEventCommon,
  db: ChildrenClient,
  scope: string,
  parentIds: readonly string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  let pending = [...new Set(parentIds)];

  for (let round = 0; round < MAX_CHILDREN_ROUNDS; round++) {
    if (pending.length === 0) return found;

    const rows = await many(
      ev,
      `${scope}/${round}`,
      db
        .from("communities")
        .select("parent_id")
        .in("parent_id", pending)
        .limit(CHILDREN_PAGE),
    );

    for (const row of rows) if (row.parent_id) found.add(row.parent_id);

    // Una página incompleta es la respuesta entera: los que no aparecieron
    // no tienen hijas.
    if (rows.length < CHILDREN_PAGE) return found;
    pending = pending.filter((id) => !found.has(id));
  }

  for (const id of pending) found.add(id);
  return found;
}
