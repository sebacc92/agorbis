import { validator$ } from "@qwik.dev/router";
import { resolveLocale, translate } from "./i18n";

/**
 * Tope de valores por campo, aplicado antes de cualquier esquema.
 *
 * Un formulario puede traer el mismo campo repetido tantas veces como quepa
 * en el cuerpo del pedido (hasta 5 MB en el Worker), y las copias de Zod que
 * usa el router (3.25.76, sin arreglo para GHSA-mrhx-c7xc-m3w5) acumulan un
 * issue por elemento inválido antes de mirar el largo. Este validador sólo
 * cuenta: si un campo trae más valores que los que el producto admite,
 * rechaza con 400 sin tocar el contenido ni construir nada por elemento.
 *
 * El router ejecuta los validadores en orden inverso al declarado y corta en
 * el primero que falla, así que se declara **después** de `zod$` para correr
 * **antes**. `src/lib/form-collection-limits.spec.ts` fija ese orden en las
 * acciones que aceptan arrays (D100).
 */
export const COLLECTION_LIMITS_BRAND = "agorbis-collection-limits";

export type CollectionLimits = Readonly<Record<string, number>>;

export function exceedsCollectionLimits(
  data: unknown,
  limits: CollectionLimits,
): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const field of Object.keys(limits)) {
    const value = record[field];
    if (Array.isArray(value) && value.length > limits[field]) return field;
  }
  return null;
}

/**
 * Crea el validador para una acción; ver el comentario del módulo. Sin sufijo
 * `$` a propósito: el optimizador de Qwik trata cualquier `nombre$(…)` como
 * una API implícita y busca un `nombreQrl` que no existe.
 */
export function collectionLimits(limits: CollectionLimits) {
  const validator = validator$((ev, data) => {
    const field = exceedsCollectionLimits(data, limits);
    if (field === null) return { success: true as const, data };
    return {
      success: false as const,
      status: 400,
      error: {
        message: translate(
          resolveLocale(ev.locale()),
          "Llegaron más valores de los que admite el formulario. Volvé a cargar la página e intentá de nuevo.",
        ),
      },
    };
  });
  // `validator$` sólo devuelve el validador en el servidor; en el cliente la
  // acción no valida y el router guarda `undefined`.
  return validator
    ? Object.assign(validator, { brand: COLLECTION_LIMITS_BRAND })
    : validator;
}
