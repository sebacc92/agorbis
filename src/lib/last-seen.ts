import type { RequestEventBase } from "@qwik.dev/router";

/**
 * Hasta dónde vio alguien la última vez.
 *
 * El feed es cronológico pero no marcaba qué había aparecido desde la visita
 * anterior: había que recordar dónde se había quedado uno, o releer. Con una
 * cadena activa eso significa releer todos los días.
 *
 * La marca vive en una cookie y no en la base porque es del navegador, no de
 * la cuenta: es "qué vi yo, acá". Perderla al cambiar de dispositivo no rompe
 * nada —simplemente no se marca nada como nuevo— y no justifica una tabla ni
 * una escritura por visita.
 */
const COOKIE = "agorbis-visto";

/**
 * Cuánto tiene que pasar para que la marca avance.
 *
 * Sin esta ventana, recargar la página borraba todos los "Nuevo" al instante:
 * la primera carga los marcaba y la segunda ya los daba por vistos, así que el
 * distintivo desaparecía justo cuando se lo iba a mirar. Con media hora, lo
 * nuevo sigue marcado mientras dura la sesión de lectura y recién se da por
 * visto cuando se vuelve más tarde.
 */
const SESSION_WINDOW_MS = 30 * 60 * 1000;

const YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface LastSeen {
  /**
   * Instante contra el que comparar: lo publicado después es nuevo.
   * `null` en la primera visita, donde no hay con qué comparar y no se marca
   * nada — estrenar la app con todo en "Nuevo" no informa.
   */
  since: string | null;
}

/**
 * Lee la marca y, si corresponde, la adelanta.
 *
 * `advance` va en `false` para las páginas que no son la primera: bajar por la
 * paginación no significa haber leído lo de arriba, y adelantar ahí daría por
 * visto justo lo que la persona todavía no miró.
 */
export function readLastSeen(
  ev: RequestEventBase,
  advance: boolean,
  now: Date = new Date(),
): LastSeen {
  const raw = ev.cookie.get(COOKIE)?.value;
  const previous = raw ? new Date(raw) : null;
  const valid =
    previous && Number.isFinite(previous.getTime()) ? previous : null;

  if (
    advance &&
    (!valid || now.getTime() - valid.getTime() > SESSION_WINDOW_MS)
  ) {
    ev.cookie.set(COOKIE, now.toISOString(), {
      path: "/",
      maxAge: YEAR_SECONDS,
      sameSite: "lax",
      httpOnly: true,
      secure: ev.url.protocol === "https:",
    });
  }

  return { since: valid ? valid.toISOString() : null };
}

/** ¿Esta publicación apareció después de la última visita? */
export function isNew(createdAt: string, since: string | null): boolean {
  if (!since) return false;
  return createdAt > since;
}
