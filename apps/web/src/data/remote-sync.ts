import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@treetask/db";
import { projectProgress } from "@treetask/domain";
import { db } from "./db";
import type {
  OutcomeEvidenceRecord,
  OutcomeRecord,
  FileRecord,
  ProjectRecord,
  TaskRecord,
  TaskStatus,
} from "./types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type OutcomeRow = Database["public"]["Tables"]["outcomes"]["Row"];
type EvidenceRow = Database["public"]["Tables"]["outcome_evidence"]["Row"];
type MemberRow = Database["public"]["Tables"]["project_members"]["Row"];
type FileRow = Database["public"]["Tables"]["project_files"]["Row"];

interface ChecklistProgress {
  completed: number;
  total: number;
}

export interface RemoteSyncResult {
  projectIds: readonly string[];
  projects: number;
  tasks: number;
  outcomes: number;
  evidence: number;
  files: number;
  syncedAt: string;
}

const WEIGHTS = new Set([1, 2, 3, 5, 8, 13]);

function safeWeight(value: number): TaskRecord["weight"] {
  return (WEIGHTS.has(value) ? value : 3) as TaskRecord["weight"];
}

export function remoteTaskStatus(
  task: Pick<TaskRow, "status" | "due_at">,
  now = new Date(),
): TaskStatus {
  if (task.status === "done") return "done";
  if (task.due_at && new Date(task.due_at).getTime() < now.getTime()) return "overdue";
  return "today";
}

function dueLabel(task: Pick<TaskRow, "status" | "due_at">, now: Date): string {
  if (!task.due_at) return "Без срока";
  const due = new Date(task.due_at);
  const sameDay = due.toDateString() === now.toDateString();
  if (sameDay) {
    return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(due);
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (due.toDateString() === yesterday.toDateString()) return "Вчера";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" }).format(due);
}

function taskProgress(task: TaskRow, checklist: ChecklistProgress | undefined): number {
  if (task.progress_mode === "binary") return task.status === "done" ? 100 : 0;
  if (task.progress_mode === "manual") return task.manual_progress;
  if (!checklist || checklist.total === 0) return 0;
  return Math.round((checklist.completed / checklist.total) * 100);
}

export function mapRemoteTask(
  task: TaskRow,
  project: Pick<ProjectRow, "name" | "color">,
  checklist: ChecklistProgress | undefined,
  now = new Date(),
): TaskRecord {
  return {
    id: task.id,
    projectId: task.project_id,
    projectName: project.name,
    title: task.title,
    status: remoteTaskStatus(task, now),
    weight: safeWeight(task.weight),
    mode: task.progress_mode,
    progress: taskProgress(task, checklist),
    dueLabel: dueLabel(task, now),
    accent: project.color,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    source: "remote",
  };
}

function metadataName(metadata: Json): string | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") return null;
  return typeof metadata.name === "string" ? metadata.name : null;
}

function mapRemoteEvidence(
  evidence: EvidenceRow,
  projectId: string,
): OutcomeEvidenceRecord {
  return {
    id: evidence.id,
    projectId,
    outcomeId: evidence.outcome_id,
    kind: evidence.kind,
    name: metadataName(evidence.metadata) ?? evidence.comment ?? "Доказательство",
    externalUrl: evidence.external_url ?? undefined,
    comment: evidence.comment ?? undefined,
    createdAt: evidence.created_at,
    source: "remote",
  };
}

function mapRemoteOutcome(outcome: OutcomeRow, evidenceCount: number): OutcomeRecord {
  return {
    id: outcome.id,
    projectId: outcome.project_id,
    title: outcome.title,
    description: outcome.description,
    status: outcome.status,
    evidenceCount,
    createdAt: outcome.created_at,
    updatedAt: outcome.updated_at,
    reviewComment: outcome.review_comment ?? undefined,
    source: "remote",
  };
}

export function fileKind(name: string, mimeType: string): FileRecord["kind"] {
  const normalizedName = name.toLocaleLowerCase("en");
  if (mimeType === "application/pdf" || normalizedName.endsWith(".pdf")) return "pdf";
  if (normalizedName.endsWith(".fig")) return "figma";
  if (mimeType.startsWith("image/")) return "image";
  if (/spreadsheet|excel|csv/.test(mimeType) || /\.(xlsx?|csv)$/i.test(name)) return "spreadsheet";
  return "document";
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

function mapRemoteFile(file: FileRow): FileRecord {
  return {
    id: file.id,
    projectId: file.project_id,
    name: file.name,
    kind: fileKind(file.name, file.mime_type),
    size: formatFileSize(file.size_bytes),
    updatedAt: file.updated_at,
    folder: file.folder,
    mimeType: file.mime_type,
    sizeBytes: file.size_bytes,
    storagePath: file.storage_path,
    source: "remote",
  };
}

const ROLE_INITIAL: Record<MemberRow["role"], string> = {
  owner: "В",
  admin: "А",
  reviewer: "П",
  member: "У",
  viewer: "Н",
};

function pendingKey(entity: string, entityId: string): string {
  return `${entity}:${entityId}`;
}

function assertResponse(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function hydrateRemoteData(
  client: SupabaseClient<Database>,
  now = new Date(),
): Promise<RemoteSyncResult> {
  const [projectsResponse, tasksResponse, checklistResponse, outcomesResponse, evidenceResponse, membersResponse, filesResponse] = await Promise.all([
    client.from("projects").select("*"),
    client.from("tasks").select("*"),
    client.from("task_checklist_items").select("*"),
    client.from("outcomes").select("*"),
    client.from("outcome_evidence").select("*"),
    client.from("project_members").select("*"),
    client.from("project_files").select("*"),
  ]);

  assertResponse(projectsResponse.error);
  assertResponse(tasksResponse.error);
  assertResponse(checklistResponse.error);
  assertResponse(outcomesResponse.error);
  assertResponse(evidenceResponse.error);
  assertResponse(membersResponse.error);
  assertResponse(filesResponse.error);

  const projectRows = projectsResponse.data ?? [];
  const taskRows = (tasksResponse.data ?? []).filter((task) => task.status !== "archived");
  const checklistRows = checklistResponse.data ?? [];
  const outcomeRows = outcomesResponse.data ?? [];
  const evidenceRows = evidenceResponse.data ?? [];
  const memberRows = membersResponse.data ?? [];
  const fileRows = filesResponse.data ?? [];
  const projectById = new Map(projectRows.map((project) => [project.id, project]));
  const outcomeById = new Map(outcomeRows.map((outcome) => [outcome.id, outcome]));

  const checklistByTask = new Map<string, ChecklistProgress>();
  for (const item of checklistRows) {
    const progress = checklistByTask.get(item.task_id) ?? { completed: 0, total: 0 };
    progress.total += 1;
    if (item.completed) progress.completed += 1;
    checklistByTask.set(item.task_id, progress);
  }

  const evidenceCountByOutcome = new Map<string, number>();
  for (const evidence of evidenceRows) {
    evidenceCountByOutcome.set(
      evidence.outcome_id,
      (evidenceCountByOutcome.get(evidence.outcome_id) ?? 0) + 1,
    );
  }

  const remoteTasks = taskRows.flatMap((task) => {
    const project = projectById.get(task.project_id);
    return project ? [mapRemoteTask(task, project, checklistByTask.get(task.id), now)] : [];
  });
  const remoteOutcomes = outcomeRows.map((outcome) =>
    mapRemoteOutcome(outcome, evidenceCountByOutcome.get(outcome.id) ?? 0),
  );
  const remoteEvidence = evidenceRows.flatMap((evidence) => {
    const outcome = outcomeById.get(evidence.outcome_id);
    return outcome ? [mapRemoteEvidence(evidence, outcome.project_id)] : [];
  });
  const remoteFiles = fileRows.map(mapRemoteFile);
  const membersByProject = new Map<string, string[]>();
  for (const member of memberRows) {
    const members = membersByProject.get(member.project_id) ?? [];
    members.push(ROLE_INITIAL[member.role]);
    membersByProject.set(member.project_id, members);
  }

  const projectIds = projectRows.map((project) => project.id);
  const projectIdSet = new Set(projectIds);
  const remoteTaskIds = new Set(remoteTasks.map((task) => task.id));
  const remoteOutcomeIds = new Set(remoteOutcomes.map((outcome) => outcome.id));
  const remoteEvidenceIds = new Set(remoteEvidence.map((evidence) => evidence.id));
  const remoteFileIds = new Set(remoteFiles.map((file) => file.id));

  await db.transaction(
    "rw",
    [
      db.projects,
      db.tasks,
      db.outcomes,
      db.outcomeEvidence,
      db.projectFiles,
      db.mutationQueue,
    ],
    async () => {
      const queue = await db.mutationQueue.toArray();
      const pending = new Set(queue.map((item) => pendingKey(item.entity, item.entityId)));

      const staleProjects = (await db.projects.toArray()).filter(
        (project) => project.source === "remote" && !projectIdSet.has(project.id),
      );
      const staleProjectIds = new Set(staleProjects.map((project) => project.id));
      if (staleProjects.length > 0) {
        const [staleTasks, staleOutcomes, staleEvidence, staleFiles] = await Promise.all([
          db.tasks.filter((task) => staleProjectIds.has(task.projectId)).primaryKeys(),
          db.outcomes.filter((outcome) => staleProjectIds.has(outcome.projectId)).primaryKeys(),
          db.outcomeEvidence.filter((evidence) => staleProjectIds.has(evidence.projectId)).primaryKeys(),
          db.projectFiles.filter((file) => staleProjectIds.has(file.projectId)).primaryKeys(),
        ]);
        await db.tasks.bulkDelete(staleTasks);
        await db.outcomes.bulkDelete(staleOutcomes);
        await db.outcomeEvidence.bulkDelete(staleEvidence);
        await db.projectFiles.bulkDelete(staleFiles);
        await db.projects.bulkDelete(staleProjects.map((project) => project.id));
      }

      const staleTasks = (await db.tasks.toArray()).filter(
        (task) => task.source === "remote"
          && projectIdSet.has(task.projectId)
          && !remoteTaskIds.has(task.id)
          && !pending.has(pendingKey("task", task.id)),
      );
      const staleOutcomes = (await db.outcomes.toArray()).filter(
        (outcome) => outcome.source === "remote"
          && projectIdSet.has(outcome.projectId)
          && !remoteOutcomeIds.has(outcome.id)
          && !pending.has(pendingKey("outcome", outcome.id)),
      );
      const staleEvidence = (await db.outcomeEvidence.toArray()).filter(
        (evidence) => evidence.source === "remote"
          && projectIdSet.has(evidence.projectId)
          && !remoteEvidenceIds.has(evidence.id)
          && !pending.has(pendingKey("outcome", evidence.id)),
      );
      const staleFiles = (await db.projectFiles.toArray()).filter(
        (file) => file.source === "remote"
          && projectIdSet.has(file.projectId)
          && !remoteFileIds.has(file.id)
          && !pending.has(pendingKey("file", file.id)),
      );
      await db.tasks.bulkDelete(staleTasks.map((task) => task.id));
      await db.outcomes.bulkDelete(staleOutcomes.map((outcome) => outcome.id));
      await db.outcomeEvidence.bulkDelete(staleEvidence.map((evidence) => evidence.id));
      await db.projectFiles.bulkDelete(staleFiles.map((file) => file.id));

      const projects: ProjectRecord[] = projectRows.map((project) => ({
        id: project.id,
        title: project.name,
        description: project.description,
        color: project.color,
        taskProgress: 0,
        outcomeProgress: null,
        members: membersByProject.get(project.id) ?? ["У"],
        tasksToday: 0,
        overdue: 0,
        source: "remote",
        remoteUpdatedAt: project.updated_at,
      }));
      await db.projects.bulkPut(
        projects.filter((project) => !pending.has(pendingKey("project", project.id))),
      );
      await db.tasks.bulkPut(
        remoteTasks.filter((task) => !pending.has(pendingKey("task", task.id))),
      );
      await db.outcomes.bulkPut(
        remoteOutcomes.filter((outcome) => !pending.has(pendingKey("outcome", outcome.id))),
      );
      await db.outcomeEvidence.bulkPut(
        remoteEvidence.filter((evidence) => !pending.has(pendingKey("outcome", evidence.id))),
      );
      await db.projectFiles.bulkPut(
        remoteFiles.filter((file) => !pending.has(pendingKey("file", file.id))),
      );

      for (const project of projects) {
        const [tasks, outcomes] = await Promise.all([
          db.tasks.where("projectId").equals(project.id).toArray(),
          db.outcomes.where("projectId").equals(project.id).toArray(),
        ]);
        const progress = projectProgress(
          tasks.map((task) => ({
            weight: task.weight,
            mode: "manual" as const,
            manualPercent: task.progress,
          })),
          outcomes.map((outcome) => ({
            status: outcome.status,
            evidenceCount: outcome.evidenceCount,
          })),
        );
        await db.projects.update(project.id, {
          taskProgress: Math.round(progress.taskProgress),
          outcomeProgress: progress.outcomeProgress === null
            ? null
            : Math.round(progress.outcomeProgress),
          tasksToday: tasks.filter((task) => task.status === "today").length,
          overdue: tasks.filter((task) => task.status === "overdue").length,
        });
      }
    },
  );

  return {
    projectIds,
    projects: projectRows.length,
    tasks: remoteTasks.length,
    outcomes: remoteOutcomes.length,
    evidence: remoteEvidence.length,
    files: remoteFiles.length,
    syncedAt: new Date().toISOString(),
  };
}
