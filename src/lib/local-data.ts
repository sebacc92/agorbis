/**
 * Limpieza del almacenamiento local del navegador (D67).
 *
 * Varias funciones guardan en `localStorage`/`sessionStorage` contenido o
 * rastros de uso de quien está usando la app: borradores, búsquedas
 * recientes, guardados, avisos descartados. Nada de eso viaja al servidor,
 * pero tampoco se iba nunca: sobrevivía al cierre de sesión y a la baja de la
 * cuenta, y en un dispositivo compartido (biblioteca, centro vecinal) la
 * persona siguiente heredaba lo que había escrito o tocado la anterior.
 *
 * Varias claves de las listas son de componentes ya retirados por mostrar
 * contenido ficticio (ver `src/components/fictional-content.spec.ts`): reclamos
 * sin conexión, reacciones, ánimo barrial, voluntariado, reconocimientos,
 * avisos de emergencia y notificaciones web. Ningún código las escribe más,
 * pero siguen guardadas en los navegadores que usaron esas versiones; se
 * mantienen clasificadas como personales para que la limpieza se las lleve.
 *
 * La regla es **denegar por defecto**: toda clave propia (las que empiezan con
 * `agorbis`) se considera personal salvo que figure como preferencia del
 * dispositivo. Así una clave nueva que alguien olvide clasificar se borra
 * igual, y el test de este módulo además falla para que se la clasifique a
 * conciencia. Las claves ajenas (de otras librerías o extensiones) no se tocan.
 *
 * El idioma no aparece en la lista porque no vive en el almacenamiento: va en
 * una cookie que resuelve el servidor, y esta función no la toca.
 */

/** Preferencias del dispositivo, no de la persona: sobreviven a la limpieza. */
export const DEVICE_PREFERENCE_KEYS: readonly string[] = [
  "agorbis-theme",
  "agorbis_high_contrast",
];

/** Prefijos de preferencias del dispositivo (accesibilidad: fuente, movimiento, sonido…). */
export const DEVICE_PREFERENCE_PREFIXES: readonly string[] = ["agorbis_a11y_"];

/** Claves personales exactas conocidas (incluidas las heredadas, ver arriba). */
export const PERSONAL_KEYS: readonly string[] = [
  "agorbis_bookmarks_v1",
  "agorbis_offline_claims_v1",
  "agorbis_recent_searches",
  "agorbis_web_notif_dismissed",
  "agorbis_web_notif_enabled",
  "agorbis-civic-tour-seen",
];

/** Prefijos de claves personales conocidas (llevan un id, slug o fecha detrás). */
export const PERSONAL_KEY_PREFIXES: readonly string[] = [
  // Borradores de publicación con dueño (y los viejos sin dueño, que comparten prefijo).
  "agorbis:draft:",
  "agorbis_rx_",
  "agorbis-rx-",
  "agorbis_history_",
  // Legado: la lista de pasos con casillas y su guía se quitaron (D116); se
  // siguen borrando en los dispositivos que todavía las tienen.
  "agorbis_checklist_",
  "agorbis_dismiss_guide_",
  "agorbis_welcome_",
  "agorbis_praise_",
  "agorbis_volunteer_",
  "agorbis_squad_",
  "agorbis_mood_",
  "agorbis-last-visit-",
  "agorbis_emergency_dismiss_",
  "agorbis_honor_thanks_",
  "agorbis_budget_ledger_",
];

/** Detiene los escritores de datos personales antes de borrarlos del navegador. */
export const PERSONAL_DATA_CLEARED_EVENT = "agorbis:personal-data-cleared";

/**
 * Eventos que avisan a la interfaz que cambió lo guardado. Se disparan después
 * de limpiar para que los guardados no sigan mostrándose desde la memoria de
 * un componente que todavía está montado.
 */
const CHANGE_EVENTS = ["agorbis-bookmarks-updated"] as const;

/**
 * Literales `agorbis…` que aparecen junto al almacenamiento y no son claves.
 * `agorbis:theme-changed` es `THEME_CHANGED_EVENT` de `theme.ts`: anuncia el
 * tema nuevo a `ThemeToggle` y no guarda nada (la clave es `agorbis-theme`).
 * Va escrito acá para que este módulo siga sin dependencias.
 */
export const NON_STORAGE_LITERALS: readonly string[] = [
  ...CHANGE_EVENTS,
  PERSONAL_DATA_CLEARED_EVENT,
  "agorbis:theme-changed",
];

export type StorageKeyClass =
  "device" | "personal" | "unclassified" | "foreign";

const OWN_PREFIX = "agorbis";

/**
 * Clasifica una clave (o el prefijo estático de una clave armada con un id).
 *
 * `unclassified` es una clave propia que no figura en ninguna lista: la
 * limpieza la trata como personal, pero existe para que el test la detecte.
 */
export function classifyStorageKey(key: string): StorageKeyClass {
  if (!key.startsWith(OWN_PREFIX)) return "foreign";
  if (
    DEVICE_PREFERENCE_KEYS.includes(key) ||
    DEVICE_PREFERENCE_PREFIXES.some((prefix) => key.startsWith(prefix))
  ) {
    return "device";
  }
  if (
    PERSONAL_KEYS.includes(key) ||
    PERSONAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
  ) {
    return "personal";
  }
  return "unclassified";
}

/** Lo mínimo de `Storage` que hace falta; permite probar sin navegador. */
export type StorageLike = Pick<
  Storage,
  "length" | "key" | "removeItem" | "getItem"
>;

function shouldRemove(key: string): boolean {
  const kind = classifyStorageKey(key);
  return kind === "personal" || kind === "unclassified";
}

function clearStorage(storage: StorageLike): number {
  // Primero se juntan las claves y después se borra: borrar mientras se
  // recorre por índice corre las posiciones y saltea claves.
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && shouldRemove(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

function browserStorages(): StorageLike[] {
  const storages: StorageLike[] = [];
  // Cada acceso va aparte: en modo privado o con datos de sitio bloqueados el
  // getter mismo puede tirar, y que falle uno no tiene que salvar al otro.
  try {
    if (typeof localStorage !== "undefined") storages.push(localStorage);
  } catch {
    // Sin acceso a localStorage no hay nada que limpiar ahí.
  }
  try {
    if (typeof sessionStorage !== "undefined") storages.push(sessionStorage);
  } catch {
    // Ídem para sessionStorage.
  }
  return storages;
}

/**
 * Borra del navegador todo lo personal de Agorbis y conserva sólo las
 * preferencias del dispositivo. Se llama en el cliente al cerrar sesión y al
 * confirmar la baja de la cuenta. Nunca tira: una limpieza que falla no puede
 * impedir que la persona salga.
 *
 * Devuelve cuántas claves borró (útil para los tests).
 */
export function clearPersonalLocalData(
  storages: StorageLike[] = browserStorages(),
): number {
  // Se anuncia incluso si todavía no hay claves: puede quedar un autoguardado
  // pendiente. Los listeners nativos se ejecutan antes de continuar el logout.
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event(PERSONAL_DATA_CLEARED_EVENT));
    } catch {
      // La limpieza sigue aunque el navegador no permita emitir el aviso.
    }
  }
  let removed = 0;
  for (const storage of storages) {
    try {
      removed += clearStorage(storage);
    } catch {
      // Un almacenamiento que no deja borrar no frena al siguiente.
    }
  }
  if (removed > 0 && typeof window !== "undefined") {
    for (const name of CHANGE_EVENTS) {
      try {
        window.dispatchEvent(new Event(name));
      } catch {
        // Sin listeners o sin Event: no hay interfaz que refrescar.
      }
    }
  }
  return removed;
}
