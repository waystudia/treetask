import type { TaskWeight } from "./progress";

export const TASK_WORKFLOW_STATUSES = [
  "backlog",
  "planned",
  "in_progress",
  "blocked",
  "done",
] as const;

export type TaskWorkflowStatus = (typeof TASK_WORKFLOW_STATUSES)[number];
export type TaskTimingStatus = "today" | "overdue" | "done";
export type ProjectHealth = "stable" | "attention" | "risk";

export interface ProjectControlTask {
  workflowStatus: TaskWorkflowStatus | "archived";
  timingStatus: TaskTimingStatus;
  assignedTo?: string;
  weight: TaskWeight;
}

export interface ProjectControlMetrics {
  total: number;
  active: number;
  completed: number;
  blocked: number;
  overdue: number;
  unassigned: number;
  wip: number;
  wipLimit: number;
  completionPercent: number;
  bottleneckStatus: TaskWorkflowStatus | null;
  health: ProjectHealth;
}

export interface MemberWorkload {
  memberId: string | null;
  activeTasks: number;
  activeWeight: number;
  blocked: number;
  overdue: number;
  completed: number;
}

const ACTIVE_STATUSES = new Set<TaskWorkflowStatus>([
  "backlog",
  "planned",
  "in_progress",
  "blocked",
]);

function normalizedWipLimit(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.min(50, Math.max(1, Math.round(value)));
}

export function projectControlMetrics(
  tasks: readonly ProjectControlTask[],
  configuredWipLimit = 3,
): ProjectControlMetrics {
  const visible = tasks.filter((task) => task.workflowStatus !== "archived");
  const active = visible.filter((task) => ACTIVE_STATUSES.has(task.workflowStatus as TaskWorkflowStatus));
  const completed = visible.filter((task) => task.workflowStatus === "done");
  const wipLimit = normalizedWipLimit(configuredWipLimit);
  const statusCounts = new Map<TaskWorkflowStatus, number>();

  for (const task of active) {
    const status = task.workflowStatus as TaskWorkflowStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const bottleneckStatus = [...statusCounts.entries()]
    .sort(([leftStatus, leftCount], [rightStatus, rightCount]) => (
      rightCount - leftCount
      || TASK_WORKFLOW_STATUSES.indexOf(leftStatus) - TASK_WORKFLOW_STATUSES.indexOf(rightStatus)
    ))[0]?.[0] ?? null;
  const totalWeight = visible.reduce((sum, task) => sum + task.weight, 0);
  const completedWeight = completed.reduce((sum, task) => sum + task.weight, 0);
  const blocked = active.filter((task) => task.workflowStatus === "blocked").length;
  const overdue = active.filter((task) => task.timingStatus === "overdue").length;
  const wip = active.filter((task) => task.workflowStatus === "in_progress").length;
  const unassigned = active.filter((task) => !task.assignedTo).length;
  const health: ProjectHealth = blocked > 0 && (overdue > 0 || wip > wipLimit)
    ? "risk"
    : blocked > 0 || overdue > 0 || wip > wipLimit || unassigned > 0
      ? "attention"
      : "stable";

  return {
    total: visible.length,
    active: active.length,
    completed: completed.length,
    blocked,
    overdue,
    unassigned,
    wip,
    wipLimit,
    completionPercent: totalWeight === 0 ? 0 : Math.round((completedWeight / totalWeight) * 100),
    bottleneckStatus,
    health,
  };
}

export function memberWorkloads(
  tasks: readonly ProjectControlTask[],
): readonly MemberWorkload[] {
  const workloads = new Map<string | null, MemberWorkload>();

  for (const task of tasks) {
    if (task.workflowStatus === "archived") continue;
    const memberId = task.assignedTo ?? null;
    const current = workloads.get(memberId) ?? {
      memberId,
      activeTasks: 0,
      activeWeight: 0,
      blocked: 0,
      overdue: 0,
      completed: 0,
    };
    if (task.workflowStatus === "done") {
      current.completed += 1;
    } else {
      current.activeTasks += 1;
      current.activeWeight += task.weight;
      if (task.workflowStatus === "blocked") current.blocked += 1;
      if (task.timingStatus === "overdue") current.overdue += 1;
    }
    workloads.set(memberId, current);
  }

  return [...workloads.values()].sort((left, right) => (
    right.activeWeight - left.activeWeight
    || right.activeTasks - left.activeTasks
    || (left.memberId ?? "").localeCompare(right.memberId ?? "")
  ));
}
