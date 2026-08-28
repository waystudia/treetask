import { describe, expect, it } from "vitest";
import {
  outcomeCompletion,
  projectProgress,
  taskCompletion,
  tasksProgress,
} from "./progress";

describe("task progress", () => {
  it("supports all three modes and clamps manual input", () => {
    expect(taskCompletion({ weight: 1, mode: "binary", completed: true })).toBe(
      100,
    );
    expect(
      taskCompletion({
        weight: 1,
        mode: "checklist",
        checklist: [{ completed: true }, { completed: false }],
      }),
    ).toBe(50);
    expect(taskCompletion({ weight: 1, mode: "manual", manualPercent: 140 })).toBe(
      100,
    );
  });

  it("uses weighted active task progress", () => {
    expect(
      tasksProgress([
        { weight: 1, mode: "binary", completed: true },
        { weight: 3, mode: "binary", completed: false },
        { weight: 13, mode: "binary", completed: true, active: false },
      ]),
    ).toBe(25);
  });
});

describe("outcome progress", () => {
  it("requires evidence for a submitted outcome", () => {
    expect(outcomeCompletion({ status: "submitted", evidenceCount: 0 })).toBe(0);
    expect(outcomeCompletion({ status: "submitted", evidenceCount: 1 })).toBe(50);
    expect(outcomeCompletion({ status: "confirmed" })).toBe(100);
  });

  it("uses tasks only when no outcomes exist", () => {
    const withoutOutcomes = projectProgress(
      [{ weight: 1, mode: "manual", manualPercent: 60 }],
      [],
    );
    expect(withoutOutcomes.totalProgress).toBe(60);
    expect(withoutOutcomes.outcomeProgress).toBeNull();
  });

  it("combines tasks and outcomes in a 70/30 ratio", () => {
    const value = projectProgress(
      [{ weight: 1, mode: "manual", manualPercent: 80 }],
      [{ status: "confirmed" }],
    );
    expect(value.totalProgress).toBe(86);
    expect(value.treeStage).toBe(16);
    expect(value.outcomeLayer).toBe(5);
  });

  it("keeps tree growth tied to tasks while outcomes only change fruits", () => {
    const tasks = [{ weight: 3 as const, mode: "manual" as const, manualPercent: 40 }];
    const withoutOutcome = projectProgress(tasks, []);
    const withConfirmedOutcome = projectProgress(tasks, [{ status: "confirmed" }]);

    expect(withoutOutcome.treeStage).toBe(8);
    expect(withConfirmedOutcome.treeStage).toBe(8);
    expect(withoutOutcome.outcomeLayer).toBe(0);
    expect(withConfirmedOutcome.outcomeLayer).toBe(5);
    expect(withConfirmedOutcome.totalProgress).toBe(58);
  });
});
