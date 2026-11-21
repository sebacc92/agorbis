import { z, type RequestEventAction } from "@qwik.dev/router";
import { writeFailure, type DbErrorLike } from "./db-error";
import { requireUser } from "./session";
import { createServerSupabase } from "./supabase";
import { isCalendarDate } from "./text";

const projectId = z.string().uuid();
const optionalId = z.string().uuid().optional().or(z.literal(""));
const text = (maximum: number) =>
  z.string().trim().max(maximum, `Máximo ${maximum} caracteres.`).optional();
const date = z
  .string()
  .trim()
  .refine((value) => value === "" || isCalendarDate(value), {
    message: "Usá una fecha con el formato AAAA-MM-DD.",
  })
  .optional();
const title = (maximum: number) =>
  z
    .string()
    .trim()
    .min(3, "Mínimo 3 caracteres.")
    .max(maximum, `Máximo ${maximum} caracteres.`);
export const milestoneSchema = z.object({
  project_id: projectId,
  title: title(160),
  description: text(1000),
  target_date: date,
  sort_order: z.coerce.number().int().min(0).max(300).default(0),
});
export const milestoneStatusSchema = z.object({
  project_id: projectId,
  milestone_id: projectId,
  status: z.enum(["pending", "in_progress", "completed", "blocked"]),
});
export const taskSchema = z.object({
  project_id: projectId,
  milestone_id: optionalId,
  title: title(180),
  description: text(1000),
  skills_needed: text(300),
  due_date: date,
  assigned_organization_id: optionalId,
});
export const taskStatusSchema = z.object({
  project_id: projectId,
  task_id: projectId,
  status: z.enum(["open", "in_progress", "completed", "blocked"]),
});
export const contributionSchema = z.object({
  project_id: projectId,
  kind: z.enum(["time", "materials", "skills", "logistics", "other"]),
  description: z
    .string()
    .trim()
    .min(5, "Mínimo 5 caracteres.")
    .max(1000, "Máximo 1000 caracteres."),
  quantity: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().positive("La cantidad debe ser mayor a cero.").optional(),
  ),
  unit: text(40),
});
export const contributionStatusSchema = z.object({
  project_id: projectId,
  contribution_id: projectId,
  status: z.enum(["offered", "accepted", "completed", "declined"]),
});
export const projectStatusSchema = z.object({
  project_id: projectId,
  status: z.enum(["proposal", "funding", "in_progress", "completed"]),
});

function failure(
  ev: RequestEventAction,
  error: DbErrorLike | null,
  fallback: string,
) {
  const result = writeFailure(error, fallback);
  return ev.fail(result.status, { message: result.message });
}

export async function addProjectMilestone(
  data: z.infer<typeof milestoneSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_milestones")
    .insert({
      project_id: data.project_id,
      title: data.title,
      description: data.description || null,
      target_date: data.target_date || null,
      sort_order: data.sort_order,
    })
    .select("id")
    .single();
  if (error || !row) return failure(ev, error, "No pudimos crear el hito.");
  return { saved: true as const, confirmationId: row.id };
}

export async function updateProjectMilestone(
  data: z.infer<typeof milestoneStatusSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_milestones")
    .update({ status: data.status })
    .eq("id", data.milestone_id)
    .eq("project_id", data.project_id)
    .select("id")
    .maybeSingle();
  if (error || !row)
    return failure(ev, error, "No pudimos actualizar el hito.");
  return { saved: true as const, confirmationId: row.id };
}

export async function addProjectTask(
  data: z.infer<typeof taskSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_tasks")
    .insert({
      project_id: data.project_id,
      milestone_id: data.milestone_id || null,
      title: data.title,
      description: data.description || null,
      skills_needed: data.skills_needed || null,
      due_date: data.due_date || null,
      assigned_organization_id: data.assigned_organization_id || null,
    })
    .select("id")
    .single();
  if (error || !row) return failure(ev, error, "No pudimos crear la tarea.");
  return { saved: true as const, confirmationId: row.id };
}

export async function updateProjectTask(
  data: z.infer<typeof taskStatusSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_tasks")
    .update({ status: data.status })
    .eq("id", data.task_id)
    .eq("project_id", data.project_id)
    .select("id")
    .maybeSingle();
  if (error || !row)
    return failure(ev, error, "No pudimos actualizar la tarea.");
  return { saved: true as const, confirmationId: row.id };
}

export async function offerProjectContribution(
  data: z.infer<typeof contributionSchema>,
  ev: RequestEventAction,
) {
  const viewer = await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_contributions")
    .insert({
      project_id: data.project_id,
      user_id: viewer.userId,
      kind: data.kind,
      description: data.description,
      quantity: data.quantity ?? null,
      unit: data.unit || null,
    })
    .select("id")
    .single();
  if (error || !row)
    return failure(ev, error, "No pudimos registrar tu aporte.");
  return { saved: true as const, confirmationId: row.id };
}

export async function updateProjectContribution(
  data: z.infer<typeof contributionStatusSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("project_contributions")
    .update({ status: data.status })
    .eq("id", data.contribution_id)
    .eq("project_id", data.project_id)
    .select("id")
    .maybeSingle();
  if (error || !row)
    return failure(ev, error, "No pudimos actualizar el aporte.");
  return { saved: true as const, confirmationId: row.id };
}

export async function updateProjectStatus(
  data: z.infer<typeof projectStatusSchema>,
  ev: RequestEventAction,
) {
  await requireUser(ev);
  const { data: row, error } = await createServerSupabase(ev)
    .from("projects")
    .update({ status: data.status })
    .eq("id", data.project_id)
    .select("id")
    .maybeSingle();
  if (error || !row)
    return failure(ev, error, "No pudimos actualizar el estado del proyecto.");
  return { saved: true as const, confirmationId: row.id };
}
