import { describe, expect, it } from "vitest";
import { memberWorkloads, projectControlMetrics } from "./project-control";

const tasks = [
  { workflowStatus: "backlog", timingStatus: "today", weight: 2 },
  { workflowStatus: "in_progress", timingStatus: "overdue", assignedTo: "adam", weight: 5 },
  { workflowStatus: "blocked", timingStatus: "today", assignedTo: "adam", weight: 3 },
  { workflowStatus: "done", timingStatus: "done", assignedTo: "anna", weight: 8 },
] as const;

describe("projectControlMetrics", () => {
  it("выделяет риск, узкое место и взвешенную готовность", () => {
    expect(projectControlMetrics(tasks, 1)).toEqual({
      total: 4,
      active: 3,
      completed: 1,
      blocked: 1,
      overdue: 1,
      unassigned: 1,
      wip: 1,
      wipLimit: 1,
      completionPercent: 44,
      bottleneckStatus: "backlog",
      health: "risk",
    });
  });

  it("не создаёт ложный риск для пустого проекта", () => {
    expect(projectControlMetrics([], 0)).toMatchObject({
      total: 0,
      completionPercent: 0,
      wipLimit: 1,
      health: "stable",
    });
  });
});

describe("memberWorkloads", () => {
  it("собирает активный вес, просрочки и блокировки по исполнителям", () => {
    expect(memberWorkloads(tasks)).toEqual([
      {
        memberId: "adam",
        activeTasks: 2,
        activeWeight: 8,
        blocked: 1,
        overdue: 1,
        completed: 0,
      },
      {
        memberId: null,
        activeTasks: 1,
        activeWeight: 2,
        blocked: 0,
        overdue: 0,
        completed: 0,
      },
      {
        memberId: "anna",
        activeTasks: 0,
        activeWeight: 0,
        blocked: 0,
        overdue: 0,
        completed: 1,
      },
    ]);
  });
});
