/**
 * Separar los embeds de PostgREST de la fila que los trae.
 *
 * Una consulta con embed —`select("*, community:communities!fk(...)")`— devuelve
 * la fila con una clave de más. Las vistas esperan exactamente una fila de la
 * tabla, así que hay que sacarla, y lo natural en JavaScript sería el rest:
 *
 * ```ts
 * const { community, ...claim } = row; // ⚠️ NO en src/routes
 * ```
 *
 * **Eso no funciona dentro de `src/routes`.** El optimizador de Qwik
 * (`@qwik.dev/core` 2.x) transforma los archivos de ruta y el rest
 * de objetos queda produciendo `{}`: no lanza, no avisa, simplemente devuelve
 * un objeto vacío. Comprobado con un literal, que es lo más simple posible:
 *
 * ```ts
 * const { a, ...resto } = { a: 1, b: 2, c: 3 };
 * Object.keys(resto).length; // 0 en src/routes, 2 en src/lib
 * ```
 *
 * El síntoma es feo de diagnosticar porque no se parece a la causa: la fila
 * queda vacía, los ids pasan a ser `undefined`, y varias consultas más abajo
 * el render se cuelga a mitad del stream sin un error en ningún log.
 *
 * Por eso esto usa spread y `delete`, que sí se transforman bien en los dos
 * lados. Vive en `src/lib` —donde el rest funciona— pero no depende de eso:
 * la idea es que sea correcto sin importar qué archivo lo llame.
 *
 * `session.ts` usa el rest directamente y está bien: está en `src/lib`. Si
 * alguna vez se mueve a una ruta, tiene que pasar por acá.
 */

/**
 * Devuelve una copia de `source` sin las claves indicadas.
 *
 * Copia superficial: los embeds que se sacan siguen siendo los mismos objetos
 * que ya se extrajeron aparte, sin duplicar.
 */
export function omitKeys<T extends object, K extends keyof T>(
  source: T,
  ...keys: K[]
): Omit<T, K> {
  const copy = { ...source } as Record<string, unknown>;
  for (const key of keys) delete copy[key as string];
  return copy as Omit<T, K>;
}
