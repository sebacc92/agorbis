import type { Viewer } from "./session";

/**
 * Qué gestión se le ofrece a quien mira una publicación. Sólo decide qué se
 * dibuja: RLS y las RPC vuelven a comprobar cada acción.
 *
 * La sesión se exige antes de comparar porque `author_id` puede ser nulo: las
 * encuestas iniciales de 0015 no tienen autor y una cuenta borrada lo deja así.
 * Sin esa guarda, `null === null` le dibujaba a quien no ingresó "Zona del
 * autor" y "Sí, cerrar la votación", algo que nunca iba a poder hacer (D96).
 */
export function contentPermissions(
  viewer: Pick<Viewer, "userId" | "isModerator">,
  authorId: string | null,
) {
  const isAuthor = !!viewer.userId && viewer.userId === authorId;
  return { isAuthor, canManage: viewer.isModerator || isAuthor };
}
