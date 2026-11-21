import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEventAction } from "@qwik.dev/router";
import { requireUser } from "./session";
import { createServerSupabase } from "./supabase";
import {
  addProjectMilestone,
  addProjectTask,
  offerProjectContribution,
  updateProjectMilestone,
  updateProjectTask,
  updateProjectContribution,
  updateProjectStatus,
  milestoneSchema,
  taskSchema,
  contributionSchema,
} from "./project-execution-actions";

vi.mock("./session", () => ({ requireUser: vi.fn() }));
vi.mock("./supabase", () => ({ createServerSupabase: vi.fn() }));
const id = "f0000000-0000-4000-8000-000000000001";
const entity = "f0000000-0000-4000-8000-000000000002";
const ev = {
  fail: (status: number, value: object) => ({ ...value, status, failed: true }),
} as unknown as RequestEventAction;
beforeEach(() =>
  vi
    .mocked(requireUser)
    .mockResolvedValue({ userId: entity } as Awaited<
      ReturnType<typeof requireUser>
    >),
);

function database(
  data: { id: string } | null = { id: entity },
  error: object | null = null,
) {
  const result = { data, error };
  const query = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  vi.mocked(createServerSupabase).mockReturnValue({
    from: vi.fn(() => query),
  } as unknown as ReturnType<typeof createServerSupabase>);
  return query;
}

describe("escrituras confirmadas de ejecución", () => {
  it("confirma sólo inserciones con una fila real y mantiene actor, campos y sesión", async () => {
    const query = database();
    expect(
      await addProjectMilestone(
        milestoneSchema.parse({ project_id: id, title: "Nuevo hito" }),
        ev,
      ),
    ).toEqual({ saved: true, confirmationId: entity });
    expect(query.insert).toHaveBeenLastCalledWith({
      project_id: id,
      title: "Nuevo hito",
      description: null,
      target_date: null,
      sort_order: 0,
    });
    expect(
      await addProjectTask(
        taskSchema.parse({ project_id: id, title: "Nueva tarea" }),
        ev,
      ),
    ).toEqual({ saved: true, confirmationId: entity });
    expect(query.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        milestone_id: null,
        project_id: id,
        assigned_organization_id: null,
      }),
    );
    expect(
      await offerProjectContribution(
        contributionSchema.parse({
          project_id: id,
          kind: "time",
          description: "Puedo colaborar",
          quantity: "",
        }),
        ev,
      ),
    ).toEqual({ saved: true, confirmationId: entity });
    expect(query.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        project_id: id,
        user_id: entity,
        quantity: null,
      }),
    );
    expect(requireUser).toHaveBeenCalledWith(ev);
  });
  it.each([
    [
      updateProjectMilestone,
      { project_id: id, milestone_id: entity, status: "completed" as const },
    ],
    [
      updateProjectTask,
      { project_id: id, task_id: entity, status: "completed" as const },
    ],
    [
      updateProjectContribution,
      { project_id: id, contribution_id: entity, status: "completed" as const },
    ],
  ])(
    "limita cada cambio de fila a proyecto e identificador",
    async (handler, input) => {
      const query = database();
      // La tabla parametrizada reúne tres firmas de datos distintas.
      const result = await handler(input as never, ev);
      expect(result).toEqual({ saved: true, confirmationId: entity });
      // El rol de la sesión sólo puede actualizar status; la base calcula
      // completed_at del hito al aceptar la transición.
      expect(query.update).toHaveBeenCalledWith({ status: "completed" });
      expect(query.eq.mock.calls).toEqual([
        ["id", entity],
        ["project_id", id],
      ]);
    },
  );
  it("no anuncia éxito para cero filas o un rechazo real de RLS", async () => {
    database(null);
    expect(
      await updateProjectStatus({ project_id: id, status: "completed" }, ev),
    ).toMatchObject({ failed: true });
    database(null, { code: "42501", message: "not permitted" });
    expect(
      await addProjectTask(
        taskSchema.parse({ project_id: id, title: "Tarea rechazada" }),
        ev,
      ),
    ).toMatchObject({ failed: true });
  });
  it("mantiene el rechazo de sesión/consentimiento y valida campos corregibles", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("consentimiento"));
    await expect(
      addProjectMilestone(
        milestoneSchema.parse({ project_id: id, title: "Hito válido" }),
        ev,
      ),
    ).rejects.toThrow("consentimiento");
    expect(
      milestoneSchema.safeParse({
        project_id: id,
        title: "ab",
        target_date: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      taskSchema.safeParse({
        project_id: id,
        title: "Tarea",
        due_date: "2026-02-31",
      }).success,
    ).toBe(false);
    expect(
      contributionSchema.safeParse({
        project_id: id,
        kind: "time",
        description: "abc",
        quantity: -1,
      }).success,
    ).toBe(false);
    expect(
      contributionSchema.parse({
        project_id: id,
        kind: "time",
        description: "Texto válido",
        quantity: "",
      }).quantity,
    ).toBeUndefined();
  });
});
