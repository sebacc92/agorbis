import { component$ } from "@qwik.dev/core";
import { ssrRenderToDom } from "@qwik.dev/core/testing";
import { describe, expect, it } from "vitest";
import { Highlight } from "./Highlight";

/**
 * `highlightSegments` ya está cubierta como función pura en `test-shared.mjs`.
 * Acá se verifica lo único que no se puede verificar sin renderizar: que los
 * tramos lleguen al DOM como elementos y con el texto original intacto.
 *
 * Deliberadamente **no** se afirma nada sobre los `<script>` del documento: el
 * SSR de Qwik emite los suyos (`qwik/state`, `qwik/vnode`, el bootstrap de
 * eventos) y el texto renderizado aparece dentro del estado serializado, que
 * no es JavaScript ejecutable. Comprobar ese escapado sería probar el
 * serializador de Qwik, no este componente.
 */
describe("Highlight", () => {
  it("marca la coincidencia conservando los acentos del original", async () => {
    const { document } = await ssrRenderToDom(
      <Highlight text="Plaza Córdoba" query="cordoba" />,
    );
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0]!.textContent).toBe("Córdoba");
  });

  it("no marca nada cuando no hay coincidencia", async () => {
    const { document } = await ssrRenderToDom(
      <Highlight text="hola mundo" query="zzz" />,
    );
    expect(document.querySelectorAll("mark").length).toBe(0);
  });

  it("marca cada aparición de cada término", async () => {
    const { document } = await ssrRenderToDom(
      <Highlight text="agua y luz: falta agua" query="agua luz" />,
    );
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBe(3);
    expect(marks[0]!.textContent).toBe("agua");
    expect(marks[1]!.textContent).toBe("luz");
    expect(marks[2]!.textContent).toBe("agua");
  });

  it("una coincidencia adentro de una palabra no la parte con relleno", async () => {
    const { document } = await ssrRenderToDom(
      <Highlight text="no reemplaza" query="plaza" />,
    );
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0]!.textContent).toBe("plaza");
    // La búsqueda encuentra subcadenas: un relleno lateral en la marca abría
    // un hueco que se leía como espacio ("reem plaza").
    expect(marks[0]!.getAttribute("class") ?? "").not.toMatch(
      /(?:^|\s)p[xlrse]-/,
    );
  });

  it("se puede componer dentro de otro componente", async () => {
    const Tarjeta = component$(() => (
      <p>
        <Highlight text="agua potable" query="agua" />
      </p>
    ));
    const { document } = await ssrRenderToDom(<Tarjeta />);
    expect(document.querySelector("mark")?.textContent).toBe("agua");
  });
});
