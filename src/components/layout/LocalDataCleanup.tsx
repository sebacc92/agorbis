import { component$, useVisibleTask$ } from "@qwik.dev/core";
import { clearPersonalLocalData } from "~/lib/local-data";

/**
 * Borra los datos personales del almacenamiento local al montarse.
 *
 * El cierre de sesión y la baja ya limpian en el `onSubmit$` de sus
 * formularios, pero ese handler sólo corre con JavaScript. Sin él, la baja
 * llega igual al servidor y redirige al inicio con `?cuenta=eliminada`, y el
 * cierre de sesión con `?sesion=cerrada`; este componente se monta sólo en
 * esas dos vueltas, así que la limpieza ocurre recién cuando el servidor ya
 * confirmó la acción y no agrega trabajo a ninguna otra visita.
 */
export const LocalDataCleanup = component$(() => {
  // eslint-disable-next-line qwik/no-use-visible-task -- localStorage y sessionStorage sólo existen en el navegador
  useVisibleTask$(
    () => {
      clearPersonalLocalData();
    },
    { strategy: "document-ready" },
  );
  return <span hidden />;
});
