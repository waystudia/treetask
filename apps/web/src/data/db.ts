import Dexie, { type EntityTable } from "dexie";
import {
  DEMO_FILES,
  DEMO_OUTCOMES,
  DEMO_PROJECTS,
  DEMO_TASKS,
} from "./demo";
import type {
  CanvasSnapshot,
  FileRecord,
  MutationQueueItem,
  OutcomeEvidenceRecord,
  OutcomeRecord,
  PhotoAnnotationRecord,
  ProjectRecord,
  TaskRecord,
} from "./types";

class TreeTaskDatabase extends Dexie {
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
  }
}

export const db = new TreeTaskDatabase();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function ensureDemoData(): Promise<void> {
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
}

export async function saveProjectOffline(
  project: ProjectRecord,
  operation: "insert" | "update" = "insert",
): Promise<void> {
  if (!UUID_PATTERN.test(project.id)) throw new Error("Project id must be a UUID");
  const createdAt = new Date().toISOString();
  await db.transaction("rw", db.projects, db.mutationQueue, async () => {
    await db.projects.put(project);
    await db.mutationQueue.add({
      entity: "project",
      entityId: project.id,
      operation,
      payload: project,
      createdAt,
      attempts: 0,
    });
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
  const updatedAt = new Date().toISOString();
  await db.transaction("rw", db.canvasSnapshots, async () => {
    await db.canvasSnapshots.put({
      id: `canvas:${projectId}`,
      projectId,
      payload,
      updatedAt,
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
