/**
 * Reemplazo vacío de `@qwik-router-sw-register` para las pruebas de
 * componentes. Ver `vitest.config.ts`: el módulo real lo genera el plugin de
 * Qwik Router durante el build, y registrar un service worker no tiene sentido
 * al renderizar un componente aislado.
 */
export default "";
