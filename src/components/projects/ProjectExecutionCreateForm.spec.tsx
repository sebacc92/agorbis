import { component$, useContextProvider, useStore } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { useAddTask, useAddMilestone } from "~/routes/proyectos/[id]";
import { ProjectExecutionCreateForm } from "./ProjectExecutionCreateForm";

const projectId = "f0000000-0000-4000-8000-000000000001";
const confirmationId = "f0000000-0000-4000-8000-000000000002";
const fixtureLabels = {
  pending: "Preparar",
  success: "Confirmar",
  again: "Revalidar",
};
const posted = () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    project_id: projectId,
    title: "Tarea enviada",
    description: "Texto enviado",
  }))
    data.set(key, value);
  return data;
};
const Example = component$<{ failed?: boolean }>(({ failed }) => {
  useContextProvider(LocaleContext, "es");
  const action = useStore({
    isRunning: false,
    formData: failed ? posted() : (undefined as FormData | undefined),
    value: failed
      ? { failed: true, fieldErrors: { title: "Mínimo 3 caracteres." } }
      : (undefined as
          | {
              failed?: boolean;
              fieldErrors?: Record<string, string>;
              saved?: boolean;
              confirmationId?: string;
            }
          | undefined),
  });
  const other = useStore({
    isRunning: false,
    formData: undefined,
    value: undefined,
  });
  return (
    <>
      <button
        id="pending"
        onClick$={() => {
          action.formData = posted();
          action.isRunning = true;
        }}
      >
        {fixtureLabels.pending}
      </button>
      <button
        id="success"
        onClick$={() => {
          action.isRunning = false;
          action.value = { saved: true, confirmationId };
        }}
      >
        {fixtureLabels.success}
      </button>
      <button
        id="again"
        onClick$={() => {
          action.value = { saved: true, confirmationId };
        }}
      >
        {fixtureLabels.again}
      </button>
      <ProjectExecutionCreateForm
        action={action as ReturnType<typeof useAddTask>}
        kind="task"
        projectId={projectId}
      />
      <ProjectExecutionCreateForm
        action={other as ReturnType<typeof useAddMilestone>}
        kind="milestone"
        projectId={projectId}
      />
    </>
  );
});
beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("borradores de ejecución", () => {
  it("conserva edición posterior y otro formulario, y procesa una confirmación sólo una vez", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const forms = screen.querySelectorAll("form");
    const title = forms[0]!.querySelector<HTMLInputElement>('[name="title"]')!;
    const body = forms[0]!.querySelector<HTMLTextAreaElement>(
      '[name="description"]',
    )!;
    const other = forms[1]!.querySelector<HTMLInputElement>('[name="title"]')!;
    for (const [field, value] of [
      [title, "Tarea enviada"],
      [body, "Texto enviado"],
      [other, "Otro borrador"],
    ] as const) {
      field.value = value;
      await userEvent(field, "input");
    }
    await userEvent(screen.querySelector("#pending"), "click");
    body.value = "Texto posterior";
    await userEvent(body, "input");
    await userEvent(screen.querySelector("#success"), "click");
    expect(title.value).toBe("");
    expect(body.value).toBe("Texto posterior");
    expect(other.value).toBe("Otro borrador");
    expect(screen.textContent).toContain("La tarea se creó.");
    title.value = "Nueva edición";
    await userEvent(title, "input");
    await userEvent(screen.querySelector("#again"), "click");
    expect(title.value).toBe("Nueva edición");
  });
  it("restaura un POST rechazado y asocia nombre, error y ancla al campo del formulario correcto", async () => {
    const { render, screen } = await createDOM();
    await render(<Example failed />);
    const title = screen.querySelector<HTMLInputElement>(
      'form [name="title"]',
    )!;
    expect(title.value).toBe("Tarea enviada");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toBe(`${title.id}-error`);
    expect(
      screen.querySelector(`label[for="${title.id}"]`)?.textContent,
    ).toContain("Tarea");
    expect(screen.querySelector(`a[href="#${title.id}"]`)).toBeTruthy();
    expect(
      new Set(
        Array.from(screen.querySelectorAll("[id]")).map((node) => node.id),
      ).size,
    ).toBe(screen.querySelectorAll("[id]").length);
    expect(screen.textContent).not.toContain("La tarea se creó.");
  });
});
