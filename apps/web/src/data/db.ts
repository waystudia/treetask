import Dexie, { type EntityTable } from "dexie";
import { projectProgress } from "@treetask/domain";
import {
  DEMO_AREAS,
  DEMO_PROFILES,
  DEMO_FILES,
  DEMO_OUTCOMES,
  DEMO_PROJECT_MEMBERS,
  DEMO_PROJECTS,
  DEMO_TASKS,
} from "./demo";
import type {
  AreaRecord,
  CanvasSnapshot,
  FileRecord,
  MutationQueueItem,
  OutcomeEvidenceRecord,
  OutcomeRecord,
  PhotoAnnotationRecord,
  ProfileRecord,
  ProjectJoinInviteRecord,
  ProjectRecord,
  ProjectMemberRecord,
  TaskRecord,
} from "./types";

class TreeTaskDatabase extends Dexie {
  profiles!: EntityTable<ProfileRecord, "id">;
  projectMembers!: EntityTable<ProjectMemberRecord, "id">;
  projectJoinInvites!: EntityTable<ProjectJoinInviteRecord, "id">;
  areas!: EntityTable<AreaRecord, "id">;
  projects!: EntityTable<ProjectRecord, "id">;
  tasks!: EntityTable<TaskRecord, "id">;
  outcomes!: EntityTable<OutcomeRecord, "id">;
  outcomeEvidence!: EntityTable<OutcomeEvidenceRecord, "id">;
  mutationQueue!: EntityTable<MutationQueueItem, "id">;
  canvasSnapshots!: EntityTable<CanvasSnapshot, "id">;
  photoAnnotations!: EntityTable<PhotoAnnotationRecord, "id">;
  projectFiles!: EntityTable<FileRecord, "id">;

  constructor() {
    super("treetask");
    this.version(1).stores({
      projects: "id, title",
      tasks: "id, projectId, status, updatedAt",
      outcomes: "id, projectId, status",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
    });
    this.version(2).stores({
      projects: "id, title",
      tasks: "id, projectId, status, updatedAt",
      outcomes: "id, projectId, status",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
    });
    this.version(3).stores({
      projects: "id, title",
      tasks: "id, projectId, status, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
    });
    this.version(4).stores({
      projects: "id, title",
      tasks: "id, projectId, status, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, kind, updatedAt",
    });
    this.version(5).stores({
      areas: "id, position, title",
      projects: "id, areaId, title",
      tasks: "id, projectId, status, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, kind, updatedAt",
    });
    this.version(6).stores({
      profiles: "id, displayName, department, workStatus",
      projectMembers: "id, projectId, userId, role",
      areas: "id, position, title",
      projects: "id, areaId, title",
      tasks: "id, projectId, status, workflowStatus, assignedTo, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, kind, updatedAt",
    }).upgrade(async (transaction) => {
      await transaction.table<ProjectRecord, string>("projects").toCollection().modify((project) => {
        project.wipLimit ??= 3;
      });
      await transaction.table<TaskRecord, string>("tasks").toCollection().modify((task) => {
        task.workflowStatus ??= task.status === "done"
          ? "done"
          : task.status === "overdue"
            ? "backlog"
            : "in_progress";
      });
    });
    this.version(7).stores({
      profiles: "id, displayName, department, workStatus",
      projectMembers: "id, projectId, userId, role",
      projectJoinInvites: "id, &code, projectId, expiresAt",
      areas: "id, position, title",
      projects: "id, areaId, title",
      tasks: "id, projectId, status, workflowStatus, assignedTo, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, kind, updatedAt",
    });
    this.version(8).stores({
      profiles: "id, displayName, department, workStatus",
      projectMembers: "id, projectId, userId, role",
      projectJoinInvites: "id, &code, projectId, expiresAt",
      areas: "id, position, title",
      projects: "id, areaId, spaceType, title",
      tasks: "id, projectId, status, workflowStatus, assignedTo, dueAt, assigneeId, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, kind, updatedAt",
    }).upgrade(async (transaction) => {
      await transaction.table<ProjectRecord, string>("projects").toCollection().modify((project) => {
        project.spaceType ??= project.members.length > 1 ? "team" : "personal";
        project.enabledViews ??= ["tasks", "canvas", "calendar"];
      });
    });
    this.version(9).stores({
      profiles: "id, displayName, department, workStatus",
      projectMembers: "id, projectId, userId, role",
      projectJoinInvites: "id, &code, projectId, expiresAt",
      areas: "id, position, title",
      projects: "id, areaId, spaceType, title",
      tasks: "id, projectId, status, workflowStatus, assignedTo, dueAt, assigneeId, updatedAt",
      outcomes: "id, projectId, status",
      outcomeEvidence: "id, projectId, outcomeId, createdAt",
      mutationQueue: "++id, entity, entityId, createdAt",
      canvasSnapshots: "id, projectId, updatedAt",
      photoAnnotations: "id, projectId, updatedAt",
      projectFiles: "id, projectId, taskId, kind, updatedAt",
    });
  }
}

export const db = new TreeTaskDatabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEMO_SEED_DISABLED_KEY = "treetask:demo-seed-disabled";

export async function ensureDemoData(): Promise<void> {
  if (window.localStorage.getItem(DEMO_SEED_DISABLED_KEY) === "true") return;
  if ((await db.profiles.count()) === 0) {
    await db.profiles.bulkPut([...DEMO_PROFILES]);
  }
  if ((await db.projectMembers.count()) === 0) {
    await db.projectMembers.bulkPut([...DEMO_PROJECT_MEMBERS]);
  }
  if ((await db.areas.count()) === 0) {
    await db.areas.bulkPut([...DEMO_AREAS]);
    for (const project of DEMO_PROJECTS) {
      if (project.areaId && await db.projects.get(project.id)) {
        await db.projects.update(project.id, { areaId: project.areaId });
      }
    }
  }
  if ((await db.projects.count()) === 0) {
    await db.transaction(
      "rw",
      db.projects,
      db.tasks,
      db.outcomes,
      async () => {
        await db.projects.bulkPut([...DEMO_PROJECTS]);
        await db.tasks.bulkPut([...DEMO_TASKS]);
        await db.outcomes.bulkPut([...DEMO_OUTCOMES]);
      },
    );
  }
  if ((await db.projectFiles.count()) === 0) {
    await db.projectFiles.bulkPut([...DEMO_FILES]);
  }
}

export async function clearAllLocalData(): Promise<void> {
  window.localStorage.setItem(DEMO_SEED_DISABLED_KEY, "true");
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
  window.dispatchEvent(new Event("treetask:data-cleared"));
}

export async function saveAreaOffline(
  area: AreaRecord,
  operation: "insert" | "update" = "insert",
): Promise<void> {
  if (!UUID_PATTERN.test(area.id)) throw new Error("Area id must be a UUID");
  const createdAt = new Date().toISOString();
  await db.transaction("rw", db.areas, db.mutationQueue, async () => {
    await db.areas.put(area);
    await db.mutationQueue.add({
      entity: "area",
      entityId: area.id,
      operation,
      payload: area,
      createdAt,
      attempts: 0,
    });
  });
}

export async function deleteAreaOffline(areaId: string): Promise<void> {
  const projects = await db.projects.where("areaId").equals(areaId).toArray();
  const updatedAt = new Date().toISOString();
  await db.transaction("rw", db.areas, db.projects, db.mutationQueue, async () => {
    await db.areas.delete(areaId);
    for (const project of projects) {
      const next = { ...project, areaId: undefined };
      await db.projects.put(next);
      if (UUID_PATTERN.test(project.id)) {
        await db.mutationQueue.add({
          entity: "project",
          entityId: project.id,
          operation: "update",
          payload: next,
          createdAt: updatedAt,
          attempts: 0,
        });
      }
    }
    if (UUID_PATTERN.test(areaId)) {
      await db.mutationQueue.add({
        entity: "area",
        entityId: areaId,
        operation: "delete",
        payload: { areaId },
        createdAt: updatedAt,
        attempts: 0,
      });
    }
  });
}

function queuedProjectId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { projectId?: unknown };
  return typeof value.projectId === "string" ? value.projectId : null;
}

export async function deleteProjectOffline(projectId: string): Promise<void> {
  const [tasks, outcomes, queue] = await Promise.all([
    db.tasks.where("projectId").equals(projectId).toArray(),
    db.outcomes.where("projectId").equals(projectId).toArray(),
    db.mutationQueue.toArray(),
  ]);
  const taskIds = tasks.map((task) => task.id);
  const outcomeIds = outcomes.map((outcome) => outcome.id);
  const queueIds = queue.flatMap((item) => (
    item.id !== undefined
      && (item.entityId === projectId || queuedProjectId(item.payload) === projectId)
      ? [item.id]
      : []
  ));

  await db.transaction("rw", db.tables, async () => {
    await Promise.all([
      db.projects.delete(projectId),
      db.tasks.bulkDelete(taskIds),
      db.outcomes.bulkDelete(outcomeIds),
      db.outcomeEvidence.where("projectId").equals(projectId).delete(),
      db.projectFiles.where("projectId").equals(projectId).delete(),
      db.canvasSnapshots.where("projectId").equals(projectId).delete(),
      db.photoAnnotations.where("projectId").equals(projectId).delete(),
      db.projectMembers.where("projectId").equals(projectId).delete(),
      db.projectJoinInvites.where("projectId").equals(projectId).delete(),
      db.mutationQueue.bulkDelete(queueIds),
    ]);
    if (UUID_PATTERN.test(projectId)) {
      await db.mutationQueue.add({
        entity: "project",
        entityId: projectId,
        operation: "delete",
        payload: { projectId },
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
}

export async function saveTaskOffline(
  task: TaskRecord,
  operation: "insert" | "update" = "insert",
): Promise<void> {
  await db.transaction("rw", db.tasks, db.mutationQueue, async () => {
    await db.tasks.put(task);
    if (UUID_PATTERN.test(task.projectId)) {
      await db.mutationQueue.add({
        entity: "task",
        entityId: task.id,
        operation,
        payload: task,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
  await refreshProjectMetrics(task.projectId);
}

export async function saveProjectOffline(
  project: ProjectRecord,
  operation: "insert" | "update" = "insert",
): Promise<void> {
  const createdAt = new Date().toISOString();
  await db.transaction("rw", db.projects, db.mutationQueue, async () => {
    await db.projects.put(project);
    if (UUID_PATTERN.test(project.id)) {
      await db.mutationQueue.add({
        entity: "project",
        entityId: project.id,
        operation,
        payload: project,
        createdAt,
        attempts: 0,
      });
    }
  });
}

export async function saveFileOffline(file: FileRecord): Promise<void> {
  await db.transaction("rw", db.projectFiles, db.mutationQueue, async () => {
    await db.projectFiles.put(file);
    if (UUID_PATTERN.test(file.projectId)) {
      await db.mutationQueue.add({
        entity: "file",
        entityId: file.id,
        operation: "insert",
        payload: file,
        createdAt: file.updatedAt,
        attempts: 0,
      });
    }
  });
}

export async function saveOutcomeOffline(
  outcome: OutcomeRecord,
  operation: "insert" | "update" = "insert",
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const record = {
    ...outcome,
    createdAt: outcome.createdAt ?? updatedAt,
    updatedAt,
  };
  await db.transaction("rw", db.outcomes, db.mutationQueue, async () => {
    await db.outcomes.put(record);
    if (UUID_PATTERN.test(record.projectId)) {
      await db.mutationQueue.add({
        entity: "outcome",
        entityId: record.id,
        operation,
        payload: record,
        createdAt: updatedAt,
        attempts: 0,
      });
    }
  });
  await refreshProjectMetrics(record.projectId);
}

export async function saveProfileOffline(profile: ProfileRecord): Promise<void> {
  await db.transaction("rw", db.profiles, db.mutationQueue, async () => {
    await db.profiles.put(profile);
    if (UUID_PATTERN.test(profile.id)) {
      await db.mutationQueue.add({
        entity: "profile",
        entityId: profile.id,
        operation: "update",
        payload: profile,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
}

export async function saveProjectMemberOffline(
  member: ProjectMemberRecord,
  operation: "insert" | "update" = "update",
): Promise<void> {
  await db.transaction("rw", db.projectMembers, db.mutationQueue, async () => {
    await db.projectMembers.put(member);
    if (UUID_PATTERN.test(member.projectId) && UUID_PATTERN.test(member.userId)) {
      await db.mutationQueue.add({
        entity: "project_member",
        entityId: member.id,
        operation,
        payload: member,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
}

export async function deleteProjectMemberOffline(member: ProjectMemberRecord): Promise<void> {
  if (member.role === "owner") throw new Error("Владельца проекта нельзя удалить из команды");
  await db.transaction("rw", db.projectMembers, db.mutationQueue, async () => {
    await db.projectMembers.delete(member.id);
    if (UUID_PATTERN.test(member.projectId) && UUID_PATTERN.test(member.userId)) {
      await db.mutationQueue.add({
        entity: "project_member",
        entityId: member.id,
        operation: "delete",
        payload: member,
        createdAt: new Date().toISOString(),
        attempts: 0,
      });
    }
  });
}

export async function refreshProjectMetrics(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) return;
  const [tasks, outcomes] = await Promise.all([
    db.tasks.where("projectId").equals(projectId).toArray(),
    db.outcomes.where("projectId").equals(projectId).toArray(),
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
  await db.projects.update(projectId, {
    taskProgress: Math.round(progress.taskProgress),
    outcomeProgress: progress.outcomeProgress === null ? null : Math.round(progress.outcomeProgress),
    tasksToday: tasks.filter((task) => task.status === "today").length,
    overdue: tasks.filter((task) => task.status === "overdue").length,
  });
}

export async function addOutcomeEvidenceOffline(
  evidence: OutcomeEvidenceRecord,
): Promise<void> {
  await db.transaction(
    "rw",
    db.outcomes,
    db.outcomeEvidence,
    db.mutationQueue,
    async () => {
      const outcome = await db.outcomes.get(evidence.outcomeId);
      if (!outcome) throw new Error("Результат не найден");
      const updatedAt = new Date().toISOString();
      const updatedOutcome: OutcomeRecord = {
        ...outcome,
        status: "submitted",
        evidenceCount: outcome.evidenceCount + 1,
        updatedAt,
      };
      await db.outcomeEvidence.put(evidence);
      await db.outcomes.put(updatedOutcome);
      if (UUID_PATTERN.test(evidence.projectId)) await db.mutationQueue.bulkAdd([
        {
          entity: "outcome",
          entityId: outcome.id,
          operation: "update",
          payload: updatedOutcome,
          createdAt: updatedAt,
          attempts: 0,
        },
        {
          entity: "outcome",
          entityId: evidence.id,
          operation: "insert",
          payload: { kind: "evidence", evidence },
          createdAt: updatedAt,
          attempts: 0,
        },
      ]);
    },
  );
}

export async function saveCanvasOffline(
  projectId: string,
  payload: string,
): Promise<void> {
  let updatedAt = new Date().toISOString();
  try {
    const parsed = JSON.parse(payload) as { updatedAt?: unknown };
    if (typeof parsed.updatedAt === "string" && !Number.isNaN(Date.parse(parsed.updatedAt))) {
      updatedAt = parsed.updatedAt;
    }
  } catch {
    // Invalid Canvas JSON is still preserved locally and can be repaired by the editor.
  }
  const snapshot: CanvasSnapshot = {
      id: `canvas:${projectId}`,
      projectId,
      payload,
      updatedAt,
  };
  await db.transaction("rw", db.canvasSnapshots, db.mutationQueue, async () => {
    await db.canvasSnapshots.put(snapshot);
    if (!UUID_PATTERN.test(projectId)) return;

    const queued = await db.mutationQueue
      .where("entity")
      .equals("canvas")
      .and((item) => item.entityId === projectId && (
        item.payload as { kind?: unknown } | null
      )?.kind === "canvas_snapshot")
      .toArray();
    const latest = queued.at(-1);
    if (latest?.id !== undefined) {
      await db.mutationQueue.update(latest.id, {
        operation: "update",
        payload: { kind: "canvas_snapshot", snapshot },
        createdAt: updatedAt,
        attempts: 0,
      });
      const staleIds = queued
        .slice(0, -1)
        .flatMap((item) => item.id === undefined ? [] : [item.id]);
      if (staleIds.length > 0) await db.mutationQueue.bulkDelete(staleIds);
      return;
    }
    await db.mutationQueue.add({
      entity: "canvas",
      entityId: projectId,
      operation: "update",
      payload: { kind: "canvas_snapshot", snapshot },
      createdAt: updatedAt,
      attempts: 0,
    });
  });
}

export async function savePhotoAnnotationOffline(
  annotation: PhotoAnnotationRecord,
): Promise<void> {
  await db.transaction("rw", db.photoAnnotations, db.mutationQueue, async () => {
    await db.photoAnnotations.put(annotation);
    if (UUID_PATTERN.test(annotation.projectId)) {
      await db.mutationQueue.add({
        entity: "canvas",
        entityId: annotation.id,
        operation: "update",
        payload: {
          kind: "photo_annotation",
          annotationId: annotation.id,
          projectId: annotation.projectId,
          sourceName: annotation.sourceName,
          sourceHash: annotation.sourceHash,
          vectors: annotation.vectors,
        },
        createdAt: annotation.updatedAt,
        attempts: 0,
      });
    }
  });
}
