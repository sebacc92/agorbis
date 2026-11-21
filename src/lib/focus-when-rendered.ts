/**
 * Enfoca un elemento que todavía puede no existir en el DOM.
 *
 * Un nodo recién agregado (la opción nueva de una encuesta, el menú que se
 * abre con una tecla) no aparece en el mismo tick que la señal que lo pide:
 * Qwik renderiza en su scheduler y, si el componente nunca se había dibujado
 * en el cliente, antes tiene que bajar su chunk. Un único
 * `requestAnimationFrame` alcanzaba en una máquina rápida y fallaba en CI.
 * Acá se reintenta por frames hasta que el nodo exista y reciba el foco, con
 * un tope para no quedar girando si nunca aparece.
 */
export function focusWhenRendered(
  find: () => HTMLElement | null | undefined,
  { maxFrames = 60, preventScroll = false } = {},
): () => void {
  let frame = 0;
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    const element = find();
    if (element?.isConnected) {
      element.focus({ preventScroll });
      if (document.activeElement === element) return;
    }
    if (attempts < maxFrames) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/**
 * Sostiene el foco de un elemento mientras Qwik termina de redibujar.
 *
 * Cada cambio de `isNavigating` o de `loc.url` redibuja el layout raíz, que
 * retira la página del `<main>` y la vuelve a insertar: el navegador manda el
 * foco al `body` sin que nadie lo haya pedido. Esperar a que `isNavigating` se
 * apague alcanza casi siempre, pero ese render llega más tarde si antes tiene
 * que bajar su chunk, y en un teléfono eso es lo común.
 *
 * Termina solo: al primer toque o tecla, si otro control tomó el foco, si el
 * nodo se fue o al vencer el plazo. Por eso no devuelve nada que cancelar: la
 * limpieza de una tarea visible también corre cuando el beta la repite (D99),
 * justo cuando hace falta.
 */
export function holdFocus(element: HTMLElement, { ms = 5_000 } = {}): void {
  let frame = 0;
  let start: number | undefined;
  const release = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("pointerdown", release, true);
    window.removeEventListener("keydown", release, true);
  };
  const tick = (now: number) => {
    start ??= now;
    const active = document.activeElement;
    const lost = active === document.body || active === null;
    if (
      !element.isConnected ||
      (active !== element && !lost) ||
      now - start >= ms
    ) {
      release();
      return;
    }
    if (lost) element.focus({ preventScroll: true });
    frame = requestAnimationFrame(tick);
  };
  window.addEventListener("pointerdown", release, true);
  window.addEventListener("keydown", release, true);
  frame = requestAnimationFrame(tick);
}
