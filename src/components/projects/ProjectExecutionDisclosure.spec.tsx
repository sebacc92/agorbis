import {
  component$,
  useContextProvider,
  useSignal,
  useStore,
} from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { Tables } from "~/lib/database.types.helpers";
import {
  ProjectExecution,
  type ProjectExecutionActions,
} from "./ProjectExecution";

const projectId = "f0000000-0000-4000-8000-000000000001";
const milestoneId = "f0000000-0000-4000-8000-000000000002";
const refreshLabel = "Revalidar después del hito";
function useFixtureAction() {
  return useStore({
    isRunning: false,
    formData: undefined as FormData | undefined,
    value: undefined as { saved: true; confirmationId: string } | undefined,
  });
}
const Example = component$(() => {
  useContextProvider(LocaleContext, "es");
  const milestones = useSignal<Tables<"project_milestones">[]>([]);
  const actions = {
    addMilestone: useFixtureAction(),
    addTask: useFixtureAction(),
    offer: useFixtureAction(),
    updateMilestone: useFixtureAction(),
    updateTask: useFixtureAction(),
    updateContribution: useFixtureAction(),
    updateProjectStatus: useFixtureAction(),
  };
  return (
    <>
      <button
        id="refresh-execution"
        onClick$={() => {
          const posted = new FormData();
          posted.set("project_id", projectId);
          actions.addMilestone.formData = posted;
          actions.addMilestone.value = {
            saved: true,
            confirmationId: milestoneId,
          };
          milestones.value = [
            {
              id: milestoneId,
              project_id: projectId,
              title: "Hito confirmado",
              description: null,
              target_date: null,
              status: "pending",
              sort_order: 0,
              completed_at: null,
              created_at: "2026-10-01T12:00:00Z",
            },
          ];
        }}
      >
        {refreshLabel}
      </button>
      <ProjectExecution
        actions={actions as unknown as ProjectExecutionActions}
        projectId={projectId}
        milestones={milestones.value}
        tasks={[]}
        contributions={[]}
        organizations={[]}
        projectStatus="proposal"
        canManage
        canContribute
      />
    </>
  );
});

/** Sin gestión: el estado de un aporte sólo puede salir de su badge. */
const ContributionsExample = component$<{
  contributions: Omit<Tables<"project_contributions">, "user_id">[];
  canContribute: boolean;
  loadFailed?: boolean;
}>(({ contributions, canContribute, loadFailed = false }) => {
  useContextProvider(LocaleContext, "es");
  const actions = {
    addMilestone: useFixtureAction(),
    addTask: useFixtureAction(),
    offer: useFixtureAction(),
    updateMilestone: useFixtureAction(),
    updateTask: useFixtureAction(),
    updateContribution: useFixtureAction(),
    updateProjectStatus: useFixtureAction(),
  };
  return (
    <ProjectExecution
      actions={actions as unknown as ProjectExecutionActions}
      projectId={projectId}
      milestones={[]}
      tasks={[]}
      contributions={contributions}
      contributionsLoadFailed={loadFailed}
      organizations={[]}
      projectStatus="funding"
      canManage={false}
      canContribute={canContribute}
    />
  );
});
const acceptedContribution = {
  id: "f0000000-0000-4000-8000-000000000003",
  project_id: projectId,
  kind: "materials",
  description: "Pintura para los bicicleteros",
  quantity: 4,
  unit: "latas",
  status: "accepted",
  created_at: "2026-10-01T12:00:00Z",
  updated_at: "2026-10-02T12:00:00Z",
};

beforeEach(() => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 0),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe("formularios de ejecución desplegados", () => {
  it("guardar un hito no cierra tarea/aporte ni pierde sus borradores", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(<Example />);
    const details = screen.querySelectorAll<HTMLDetailsElement>("details");
    for (const index of [1, 2]) {
      const element = details[index]!;
      element.open = true;
      element.setAttribute("open", "");
      await userEvent(element, "toggle");
    }
    const task = details[1]!.querySelector<HTMLInputElement>('[name="title"]')!;
    task.value = "Tarea en edición";
    await userEvent(task, "input");
    const contribution = details[2]!.querySelector<HTMLTextAreaElement>(
      '[name="description"]',
    )!;
    contribution.value = "Aporte en edición";
    await userEvent(contribution, "input");
    await userEvent(screen.querySelector("#refresh-execution"), "click");
    expect(screen.textContent).toContain("Hito confirmado");
    expect(details[1]!.hasAttribute("open")).toBe(true);
    expect(details[2]!.hasAttribute("open")).toBe(true);
    expect(task.value).toBe("Tarea en edición");
    expect(contribution.value).toBe("Aporte en edición");
  });
});

describe("aportes no monetarios", () => {
  it("sin aportes lo dice y explica qué hace falta para ofrecer uno", async () => {
    const { render, screen } = await createDOM();
    await render(
      <ContributionsExample contributions={[]} canContribute={false} />,
    );
    const section = screen.querySelector("#aportes-no-monetarios")!;
    expect(section.textContent).toContain(
      "Todavía nadie ofreció tiempo, materiales ni habilidades.",
    );
    expect(section.textContent).toContain(
      "Para ofrecer un aporte hay que ingresar y vivir en la comunidad del proyecto.",
    );
    // Ni una lista vacía ni un formulario para quien no puede ofrecer.
    expect(section.querySelector("ul")).toBeFalsy();
    expect(section.querySelector("details")).toBeFalsy();
  });

  it("si la lectura falla no afirma que nadie ofreció nada", async () => {
    const { render, screen } = await createDOM();
    await render(
      <ContributionsExample
        contributions={[]}
        canContribute={false}
        loadFailed
      />,
    );
    const section = screen.querySelector("#aportes-no-monetarios")!;
    expect(section.textContent).toContain("No pudimos cargar los aportes.");
    expect(section.textContent).not.toContain("Todavía nadie ofreció");
  });

  it("cada aporte dice su estado en palabras, aparte de su tipo", async () => {
    const { render, screen } = await createDOM();
    await render(
      <ContributionsExample
        contributions={[acceptedContribution]}
        canContribute
      />,
    );
    const section = screen.querySelector("#aportes-no-monetarios")!;
    const row = section.querySelector("li")!;
    expect(row.textContent).toContain("Materiales");
    expect(row.textContent).toContain("Aceptado");
    expect(row.textContent).toContain("4 latas");
    // Sin gestión no hay selector: "Aceptado" no puede venir de una opción.
    expect(row.querySelector("select")).toBeFalsy();
    expect(section.textContent).toContain("1 aporte");
    expect(section.textContent).not.toContain("1 aportes");
    expect(section.textContent).not.toContain("Todavía nadie ofreció");
    expect(section.textContent).not.toContain(
      "Para ofrecer un aporte hay que ingresar",
    );
  });
});
