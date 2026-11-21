import { qwikVite } from "@qwik.dev/core/optimizer";
import { defineConfig } from "vitest/config";

/**
 * Pruebas de componentes.
 *
 * El resto de la suite son scripts de Node que transpilan un archivo en
 * memoria: alcanza para lógica pura, pero un `component$` no se puede ejecutar
 * así —necesita el optimizador de Qwik para resolver los QRL—. De ahí el
 * runner aparte.
 *
 * `environment: "node"`: `ssrRenderToDom` de `@qwik.dev/core/testing` arma su
 * propio documento, así que no hace falta jsdom ni happy-dom.
 */
export default defineConfig({
  plugins: [qwikVite()],
  resolve: {
    alias: {
      "~": new URL("./src", import.meta.url).pathname,
      /**
       * `@qwik.dev/router` importa este módulo virtual, que en un build normal
       * lo genera su plugin de Vite. Acá no corre el router —se renderizan
       * componentes sueltos, no rutas— pero cualquier componente que use
       * `<Link>` arrastra el import igual. Se apunta a un módulo vacío en vez
       * de montar el plugin entero, que además escanearía `src/routes`.
       */
      "@qwik-router-sw-register": new URL(
        "./scripts/stub-sw-register.mjs",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ["src/**/*.spec.tsx", "src/**/*.spec.ts"],
    environment: "node",
  },
});
