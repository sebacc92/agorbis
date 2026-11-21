/**
 * Acceso seguro a `localStorage` / `sessionStorage`.
 *
 * Cada componente que guardaba una preferencia o un rastro de uso repetía el
 * mismo `try { localStorage… } catch { // ignore }`, y no todos lo hacían:
 * en modo privado estricto, con datos de sitio bloqueados o sin espacio, el
 * getter mismo o `setItem` tiran, y un `onClick$` que tira deja el botón a
 * medio hacer (cambió la clase pero no la señal, o al revés). En el SSR el
 * objeto directamente no existe.
 *
 * Estas funciones nunca tiran: si el almacenamiento no está, leer devuelve
 * `null` y escribir devuelve `false`. Quien llama decide qué hacer, casi
 * siempre nada, porque lo que vive acá son conveniencias del dispositivo.
 *
 * Las claves siguen la clasificación de `src/lib/local-data.ts` (D67): toda
 * clave propia empieza con `agorbis` y tiene que figurar como preferencia del
 * dispositivo o como personal. El test de ese módulo también recorre los
 * archivos que usan estos helpers, así que una clave nueva sin clasificar
 * falla igual que antes.
 */

export type StorageArea = "local" | "session";

/** Lo mínimo de `Storage` que usan los helpers; permite probar sin navegador. */
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageFor(area: StorageArea): StorageAccess | null {
  // El acceso va dentro del try: en Safari con cookies bloqueadas, leer
  // `window.localStorage` ya tira un SecurityError.
  try {
    if (area === "session") {
      return typeof sessionStorage === "undefined" ? null : sessionStorage;
    }
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lee una clave como texto; `null` si no está o no hay almacenamiento. */
export function readStoredItem(
  key: string,
  area: StorageArea = "local",
): string | null {
  const storage = storageFor(area);
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Guarda texto. Devuelve si quedó guardado (cuota llena o bloqueo → `false`). */
export function writeStoredItem(
  key: string,
  value: string,
  area: StorageArea = "local",
): boolean {
  const storage = storageFor(area);
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Borra una clave. Devuelve si se pudo llegar al almacenamiento. */
export function removeStoredItem(
  key: string,
  area: StorageArea = "local",
): boolean {
  const storage = storageFor(area);
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lee JSON y lo valida con `guard`. Lo guardado lo pudo escribir otra versión
 * de la app o una extensión, así que no se confía en la forma: si no parsea o
 * no pasa el guard, se devuelve `null` como si no hubiera nada.
 */
export function readStoredJson<T>(
  key: string,
  guard: (value: unknown) => value is T,
  area: StorageArea = "local",
): T | null {
  const raw = readStoredItem(key, area);
  if (raw === null || raw === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Guarda un valor como JSON. Devuelve si quedó guardado. */
export function writeStoredJson(
  key: string,
  value: unknown,
  area: StorageArea = "local",
): boolean {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    // Referencias circulares o BigInt: no hay nada sensato que guardar.
    return false;
  }
  return writeStoredItem(key, serialized, area);
}

/** Guard para listas de textos (búsquedas recientes y similares). */
export function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
