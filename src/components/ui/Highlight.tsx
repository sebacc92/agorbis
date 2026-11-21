import { component$ } from "@qwik.dev/core";
import { highlightSegments } from "~/lib/text";

/**
 * Marca en un texto los tramos que coinciden con lo buscado.
 *
 * Los tramos se arman como nodos JSX y no interpolando HTML: el término sale
 * de la URL, así que un `<script>` en la búsqueda tiene que terminar siendo
 * texto visible y no marcado ejecutable.
 *
 * `<mark>` y no un `<span>` con color: es el elemento que significa
 * exactamente esto, así que un lector de pantalla puede anunciarlo y el
 * resaltado no depende sólo de que se distinga el fondo.
 *
 * La marca va pegada a las letras, sin relleno a los costados: la búsqueda
 * encuentra subcadenas, y un relleno abría adentro de la palabra un hueco
 * que se leía como espacio ("reem plaza"). `box-decoration-clone` repite el
 * redondeo en cada renglón cuando la marca cae en un corte de línea.
 */
export const Highlight = component$<{ text: string; query: string }>(
  ({ text, query }) => (
    <>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <mark
            key={`tramo-${index}`}
            class="rounded-xs bg-accent-200 text-ink-strong box-decoration-clone dark:bg-accent-700/50 dark:text-ink-strong"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`tramo-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  ),
);
