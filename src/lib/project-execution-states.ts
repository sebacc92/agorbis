import type { ProjectStatus } from "./database.types.helpers";

type TaskState = "open" | "in_progress" | "completed" | "blocked";
type ContributionState = "offered" | "accepted" | "completed" | "declined";
type MilestoneState = "pending" | "in_progress" | "completed" | "blocked";

// Reflejan los guards de 0039: la base conserva la autoridad al guardar.
const tasks: Record<TaskState, readonly TaskState[]> = {
  open: ["open", "in_progress", "blocked"],
  in_progress: ["in_progress", "completed", "blocked"],
  blocked: ["open", "in_progress", "blocked"],
  completed: ["completed"],
};
const contributions: Record<ContributionState, readonly ContributionState[]> = {
  offered: ["offered", "accepted", "declined"],
  accepted: ["accepted", "completed", "declined"],
  completed: ["completed"],
  declined: ["declined"],
};
const milestones: Record<MilestoneState, readonly MilestoneState[]> = {
  pending: ["pending", "in_progress", "completed", "blocked"],
  in_progress: ["pending", "in_progress", "completed", "blocked"],
  blocked: ["pending", "in_progress", "completed", "blocked"],
  completed: ["in_progress", "completed"],
};
const projects: Record<ProjectStatus, readonly ProjectStatus[]> = {
  proposal: ["proposal", "funding", "in_progress"],
  funding: ["funding", "in_progress"],
  in_progress: ["in_progress", "completed"],
  completed: ["completed"],
  removed: ["removed"],
};

export const taskStatusOptions = (current: string): readonly string[] =>
  tasks[current as TaskState] ?? [current];
export const contributionStatusOptions = (current: string): readonly string[] =>
  contributions[current as ContributionState] ?? [current];
export const milestoneStatusOptions = (current: string): readonly string[] =>
  milestones[current as MilestoneState] ?? [current];
export function projectStatusOptions(
  current: string,
  canModerate = false,
): readonly string[] {
  // Retirar contenido tiene su confirmación propia; acá se conserva el estado
  // actual y se ofrecen sólo los estados que admite la acción de ejecución.
  return canModerate
    ? [
        ...new Set([
          current,
          "proposal",
          "funding",
          "in_progress",
          "completed",
        ] as const),
      ]
    : (projects[current as ProjectStatus] ?? [current]);
}
