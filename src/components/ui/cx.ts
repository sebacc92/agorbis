/**
 * Une clases ignorando falsy. Evita traer `clsx` por 200 bytes.
 *
 * Vive aparte del barrel (`./index.tsx`) para que los componentes de esta
 * carpeta puedan usarlo sin importar el barrel que a su vez los reexporta:
 * ese ida y vuelta era un import circular que, según el orden de carga,
 * dejaba `cx` en `undefined` al evaluar el módulo.
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
