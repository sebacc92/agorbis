/**
 * Opciones para los contextos sin JavaScript de las pruebas nativas.
 *
 * Sin scripts, Chromium sólo produce un frame cuando Playwright lo fuerza, y
 * una animación CSS como la de abrir un `<details>` avanza un poco en cada
 * muestra: el botón nunca queda "estable", el clic se reintenta con esperas
 * crecientes y una sola prueba podía tardar 30 s o vencer su tiempo en CI.
 * Con movimiento reducido, que el CSS global respeta, no hay animación que
 * esperar. Es la misma preferencia que puede tener una persona real.
 */
export const nativeContextOptions = {
  javaScriptEnabled: false,
  reducedMotion: "reduce",
} as const;
