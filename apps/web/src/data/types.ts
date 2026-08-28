import type {
  OutcomeStatus,
  TaskProgressMode,
  TaskWeight,
} from "@treetask/domain";

export type TaskStatus = "today" | "overdue" | "done";

export interface AreaRecord {
  id: string;
  title: string;
  description: string;
  color: string;
  position: number;
  source?: "demo" | "remote";
  remoteUpdatedAt?: string;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  title: string;
  projectName: string;
  status: TaskStatus;
  weight: TaskWeight;
  mode: TaskProgressMode;
  progress: number;
  dueLabel: string;
  accent: string;
  createdAt: string;
  updatedAt: string;
  annotationId?: string;
  sourceHash?: string;
  source?: "demo" | "remote";
}

export interface ProjectRecord {
  id: string;
  areaId?: string;
  title: string;
  description: string;
  goal?: string;
  currentStage?: string;
  plan?: string;
  color: string;
  taskProgress: number;
  outcomeProgress: number | null;
  members: readonly string[];
  tasksToday: number;
  overdue: number;
  source?: "demo" | "remote";
  remoteUpdatedAt?: string;
}

export interface OutcomeRecord {
  id: string;
  projectId: string;
  title: string;
  status: OutcomeStatus;
  evidenceCount: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewComment?: string;
  source?: "demo" | "remote";
}

export interface OutcomeEvidenceRecord {
  id: string;
  projectId: string;
  outcomeId: string;
  kind: "photo" | "file" | "link" | "document" | "screenshot" | "review_comment";
  name: string;
  externalUrl?: string;
  comment?: string;
  blob?: Blob;
  mimeType?: string;
  createdAt: string;
  source?: "demo" | "remote";
}

export interface FileRecord {
  id: string;
  projectId: string;
  name: string;
  kind: "pdf" | "figma" | "document" | "image" | "spreadsheet";
  size: string;
  updatedAt: string;
  folder?: string;
  blob?: Blob;
  mimeType?: string;
  sizeBytes?: number;
  storagePath?: string;
  source?: "demo" | "remote";
}

export interface ActivityRecord {
  id: string;
  actor: string;
  action: string;
  time: string;
  tone: string;
}

export interface MutationQueueItem {
  id?: number;
  entity: "area" | "project" | "task" | "outcome" | "file" | "canvas";
  entityId: string;
  operation: "insert" | "update" | "delete";
  payload: unknown;
  createdAt: string;
  attempts: number;
}

export interface CanvasSnapshot {
  id: string;
  projectId: string;
  payload: string;
  updatedAt: string;
}

export type AnnotationTool = "pen" | "circle" | "arrow" | "text";

export interface PhotoAnnotationVector {
  id: string;
  tool: AnnotationTool;
  points: readonly number[];
  color: string;
  text?: string;
  strokeWidth: number;
}

export interface PhotoAnnotationRecord {
  id: string;
  projectId: string;
  sourceName: string;
  sourceDataUrl: string;
  sourceHash: string;
  vectors: readonly PhotoAnnotationVector[];
  createdAt: string;
  updatedAt: string;
}
