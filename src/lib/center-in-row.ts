/**
 * Centra en una fila deslizable el elemento que cumple `selector` (el chip
 * del filtro aplicado), moviendo sólo la fila.
 *
 * `scrollIntoView({ block: "nearest" })` hacía lo mismo y además bajaba la
 * página: con una fila pegajosa o debajo de las pestañas, el `scroll-padding`
 * de la comunidad la da por tapada y el navegador desliza el documento entre
 * 53 y 81 px al cargar el listado.
 */
export function centerInRow(
  row: HTMLElement | undefined,
  selector: string,
): void {
  // Escrito en positivo: sin medidas (el DOM de las pruebas de componentes)
  // la comparación da falso y tampoco hay nada que mover.
  if (!row || !(row.scrollWidth > row.clientWidth)) return;
  const target = row.querySelector<HTMLElement>(selector);
  if (!target) return;

  const rowBox = row.getBoundingClientRect();
  const targetBox = target.getBoundingClientRect();
  row.scrollTo({
    left:
      row.scrollLeft +
      targetBox.left -
      rowBox.left -
      (row.clientWidth - targetBox.width) / 2,
    behavior: "auto",
  });
}
