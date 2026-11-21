import { component$, useContextProvider, useSignal } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { Field } from "~/components/ui";
import { renderWithLocale } from "~/testing/render";
import { encodeStatusOptions, StatusSelect } from "./ProjectExecution";

/**
 * El padre se redibuja por un motivo ajeno al estado (acá, un contador) y
 * también cuando el estado guardado cambia de verdad.
 */
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  const current = useSignal("open");
  const ticks = useSignal(0);
  return (
    <>
      <button type="button" id="redraw" onClick$={() => ticks.value++}>
        {ticks.value}
      </button>
            <button
        type="button"
        id="saved"
        aria-label="saved"
        onClick$={() => (current.value = "in_progress")}
      />
      <StatusSelect
        name="status"
        aria-label="Estado"
        current={current.value}
        options={encodeStatusOptions(
          current.value === "open"
            ? ["open", "in_progress", "blocked"]
            : ["in_progress", "completed", "blocked"],
          (value) => value,
        )}
      />
    </>
  );
});

describe("StatusSelect", () => {
  it("parte del estado guardado y conserva la elección aunque el padre se redibuje", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const select = screen.querySelector("select")!;
    const selected = () =>
      Array.from(select.querySelectorAll("option"))
        .filter((option) => option.hasAttribute("selected"))
        .map((option) => option.value);
    expect(selected()).toEqual(["open"]);

    select.value = "in_progress";
    await userEvent(select, "change");
    await userEvent("#redraw", "click");
    expect(screen.querySelector("#redraw")!.textContent).toBe("1");
    // El redibujado no vuelve a imponer el estado guardado.
    expect(selected()).toEqual(["in_progress"]);
  });

  it("se realinea cuando el estado guardado cambia", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const select = screen.querySelector("select")!;
    select.value = "blocked";
    await userEvent(select, "change");
    await userEvent("#saved", "click");
    const values = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(values).toEqual(["in_progress", "completed", "blocked"]);
    expect(
      Array.from(select.querySelectorAll("option"))
        .filter((option) => option.hasAttribute("selected"))
        .map((option) => option.value),
    ).toEqual(["in_progress"]);
  });
});

const Labelled = component$(() => {
  useContextProvider(LocaleContext, "es");
  return (
    <Field name="status" label="Estado general">
      <StatusSelect
        name="status"
        current="funding"
        options={encodeStatusOptions(["funding", "in_progress"], (v) =>
          v.slice(0, 1),
        )}
      />
    </Field>
  );
});

describe("StatusSelect dentro de Field", () => {
  // Un `id` explícito en `undefined` pisaba el derivado del `name` y la
  // etiqueta quedaba sin control asociado.
  it("conserva el id que asocia la etiqueta y sus opciones en SSR", async () => {
    const { document } = await renderWithLocale(<Labelled />);
    const select = document.querySelector("select#status")!;
    expect(select).toBeTruthy();
    expect(
      Array.from(select.querySelectorAll("option")).map((o) =>
        o.getAttribute("value"),
      ),
    ).toEqual(["funding", "in_progress"]);
    expect(select.querySelector("option[selected]")!.getAttribute("value")).toBe(
      "funding",
    );
  });
});
