import { describe, expect, it } from "vitest";
import {
  contributionStatusOptions,
  milestoneStatusOptions,
  projectStatusOptions,
  taskStatusOptions,
} from "./project-execution-states";

describe("transiciones de ejecución disponibles", () => {
  it("una tarea debe pasar por En curso antes de completarse y no puede reabrirse", () => {
    expect(taskStatusOptions("open")).toEqual([
      "open",
      "in_progress",
      "blocked",
    ]);
    expect(taskStatusOptions("in_progress")).toEqual([
      "in_progress",
      "completed",
      "blocked",
    ]);
    expect(taskStatusOptions("blocked")).toEqual([
      "open",
      "in_progress",
      "blocked",
    ]);
    expect(taskStatusOptions("completed")).toEqual(["completed"]);
  });
  it("revisar un aporte permite aceptarlo o declinarlo antes de completarlo", () => {
    expect(contributionStatusOptions("offered")).toEqual([
      "offered",
      "accepted",
      "declined",
    ]);
    expect(contributionStatusOptions("accepted")).toEqual([
      "accepted",
      "completed",
      "declined",
    ]);
    expect(contributionStatusOptions("completed")).toEqual(["completed"]);
    expect(contributionStatusOptions("declined")).toEqual(["declined"]);
  });
  it("un hito completado sólo vuelve a En curso, conservando siempre su estado actual", () => {
    expect(milestoneStatusOptions("completed")).toEqual([
      "in_progress",
      "completed",
    ]);
    for (const state of ["pending", "in_progress", "blocked"])
      expect(milestoneStatusOptions(state)).toEqual([
        "pending",
        "in_progress",
        "completed",
        "blocked",
      ]);
  });
  it("el autor avanza el proyecto y sólo la moderación puede retrocederlo", () => {
    expect(projectStatusOptions("proposal")).toEqual([
      "proposal",
      "funding",
      "in_progress",
    ]);
    expect(projectStatusOptions("funding")).toEqual(["funding", "in_progress"]);
    expect(projectStatusOptions("in_progress")).toEqual([
      "in_progress",
      "completed",
    ]);
    expect(projectStatusOptions("completed")).toEqual(["completed"]);
    expect(projectStatusOptions("completed", true)).toEqual([
      "completed",
      "proposal",
      "funding",
      "in_progress",
    ]);
    expect(projectStatusOptions("removed")).toEqual(["removed"]);
    expect(projectStatusOptions("removed", true)).toEqual([
      "removed",
      "proposal",
      "funding",
      "in_progress",
      "completed",
    ]);
  });
  it("un estado desconocido queda visible sin inventarle transiciones", () => {
    for (const options of [
      taskStatusOptions,
      contributionStatusOptions,
      milestoneStatusOptions,
      projectStatusOptions,
    ])
      expect(options("estado_desconocido")).toEqual(["estado_desconocido"]);
  });
});
