/**
 * Fila de chips o filtros: en el teléfono un solo renglón que se desliza; desde
 * `sm` envuelve como antes.
 *
 * Varias pantallas dejaban envolver sus filtros y en 390 px ocupaban tres o
 * seis renglones antes del contenido (Inicio, el mapa, Explorar). Los hijos no
 * se achican: el que no entra queda a un deslizamiento, no cortado.
 */
export const CHIP_ROW =
  "scrollbar-slim flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-1 [&>*]:shrink-0 sm:flex-wrap sm:overflow-visible sm:pb-0";

/** Para filas que cuelgan del contenedor de página: llegan hasta el borde. */
export const CHIP_ROW_BLEED = "-mx-4 px-4 sm:mx-0 sm:px-0";
