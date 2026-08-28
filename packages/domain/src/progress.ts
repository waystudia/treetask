export const TASK_WEIGHTS = [1, 2, 3, 5, 8, 13] as const;

export type TaskWeight = (typeof TASK_WEIGHTS)[number];
export type TaskProgressMode = "binary" | "checklist" | "manual";
export type OutcomeStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "confirmed"
  | "rejected";

export interface ChecklistItemProgress {
  completed: boolean;
}

export interface TaskProgressInput {
  weight: TaskWeight;
  mode: TaskProgressMode;
  completed?: boolean;
  manualPercent?: number;
  checklist?: readonly ChecklistItemProgress[];
  active?: boolean;
}

export interface OutcomeProgressInput {
  status: OutcomeStatus;
  evidenceCount?: number;
}

export interface ProjectProgress {
  taskProgress: number;
  outcomeProgress: number | null;
  totalProgress: number;
  treeStage: number;
  outcomeLayer: number;
}

const clampPercent = (value: number): number =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));

export function taskCompletion(task: TaskProgressInput): number {
  switch (task.mode) {
    case "binary":
      return task.completed ? 100 : 0;
    case "manual":
      return clampPercent(task.manualPercent ?? 0);
    case "checklist": {
      const items = task.checklist ?? [];
      if (items.length === 0) return 0;
      const completed = items.filter((item) => item.completed).length;
      return (completed / items.length) * 100;
    }
  }
}

export function tasksProgress(tasks: readonly TaskProgressInput[]): number {
  const activeTasks = tasks.filter((task) => task.active !== false);
  const totalWeight = activeTasks.reduce((sum, task) => sum + task.weight, 0);
  if (totalWeight === 0) return 0;

  return clampPercent(
    activeTasks.reduce(
      (sum, task) => sum + task.weight * taskCompletion(task),
      0,
    ) / totalWeight,
  );
}

export function outcomeCompletion(outcome: OutcomeProgressInput): number {
  if (outcome.status === "confirmed") return 100;
  if (outcome.status === "submitted" && (outcome.evidenceCount ?? 0) > 0) {
    return 50;
  }
  return 0;
}

export function outcomesProgress(
  outcomes: readonly OutcomeProgressInput[],
): number | null {
  if (outcomes.length === 0) return null;
  return clampPercent(
    outcomes.reduce((sum, outcome) => sum + outcomeCompletion(outcome), 0) /
      outcomes.length,
  );
}

export function projectProgress(
  tasks: readonly TaskProgressInput[],
  outcomes: readonly OutcomeProgressInput[],
): ProjectProgress {
  const taskProgress = tasksProgress(tasks);
  const outcomeProgress = outcomesProgress(outcomes);
  const totalProgress = clampPercent(
    outcomeProgress === null
      ? taskProgress
      : taskProgress * 0.7 + outcomeProgress * 0.3,
  );

  return {
    taskProgress,
    outcomeProgress,
    totalProgress,
    treeStage: Math.min(20, Math.max(0, Math.round(taskProgress / 5))),
    outcomeLayer:
      outcomeProgress === null
        ? 0
        : Math.min(5, Math.max(0, Math.round(outcomeProgress / 20))),
  };
}
