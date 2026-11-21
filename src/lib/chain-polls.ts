import type { CommunityRef } from "./community";

/**
 * Encuestas abiertas de la cadena para una comunidad vacía (D116).
 *
 * Una comunidad recién abierta no tiene nada propio, pero su provincia, su
 * país o la Tierra pueden tener encuestas activas, y `is_member` es
 * jerárquico: quien vive acá también vota ahí. Estas funciones son puras;
 * la consulta vive en el loader de la página de comunidad.
 */

export interface ChainPollRow {
  id: string;
  question: string;
  closes_at: string | null;
  community_id: string;
}

export interface ChainPoll extends ChainPollRow {
  communityName: string;
  communityEmoji: string | null;
}

/** Cuántas encuestas de la cadena se ofrecen: alcanza para tener algo que hacer sin tapar los llamados a publicar. */
export const CHAIN_POLLS_LIMIT = 3;

/** Ids de los ancestros, en el orden de la cadena y sin la comunidad propia. */
export function ancestorIds(
  chain: readonly CommunityRef[],
  selfId: string,
): string[] {
  return chain
    .filter((community) => community.id !== selfId)
    .map((community) => community.id);
}

/**
 * Etiqueta cada encuesta con su comunidad. Una encuesta cuya comunidad no esté
 * en la cadena se descarta: la consulta no debería devolverla y no se le
 * inventa un nombre.
 */
export function labelChainPolls(
  polls: readonly ChainPollRow[],
  chain: readonly CommunityRef[],
): ChainPoll[] {
  const byId = new Map(chain.map((community) => [community.id, community]));
  return polls.flatMap((poll) => {
    const community = byId.get(poll.community_id);
    return community
      ? [
          {
            ...poll,
            communityName: community.name,
            communityEmoji: community.emoji,
          },
        ]
      : [];
  });
}

/**
 * Un fallo de lectura no es una comunidad vacía: sólo con los cuatro conteos
 * confirmados en cero se cambia el tablero por la invitación.
 */
export function isConfirmedEmpty(counts: {
  polls: number | null;
  debates: number | null;
  claims: number | null;
  projects: number | null;
}): boolean {
  return [counts.polls, counts.debates, counts.claims, counts.projects].every(
    (count) => count === 0,
  );
}
