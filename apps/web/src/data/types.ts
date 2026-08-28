import type {
  OutcomeStatus,
  TaskProgressMode,
  TaskWorkflowStatus,
  TaskWeight,
} from "@treetask/domain";

export type TaskStatus = "today" | "overdue" | "done";
export type ProjectRole = "owner" | "admin" | "reviewer" | "member" | "viewer";
export type ProfileWorkStatus = "available" | "focused" | "busy" | "away";
export type ProjectSpaceType = "personal" | "team";
export type ProjectModule = "tasks" | "canvas" | "calendar";

export interface ProfileRecord {
  id: string;
  displayName: string;
  jobTitle: string;
  department: string;
  bio: string;
  skills: readonly string[];
  timezone: string;
  workStatus: ProfileWorkStatus;
  weeklyCapacityHours: number;
  avatarPath?: string;
  source?: "demo" | "remote";
  remoteUpdatedAt?: string;
}

export interface ProjectMemberRecord {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  responsibility: string;
  allocationPercent: number;
  invitedBy?: string;
  joinedAt: string;
  source?: "demo" | "remote";
}

export interface ProjectJoinInviteRecord {
  id: string;
  projectId: string;
  code: string;
  role: Exclude<ProjectRole, "owner">;
  responsibility: string;
  allocationPercent: number;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  usedBy?: string;
  source: "demo";
}

export interface ProjectMemberSummary {
  userId: string;
  name: string;
  initial: string;
  role?: ProjectRole;
}

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
  workflowStatus: TaskWorkflowStatus;
  weight: TaskWeight;
  mode: TaskProgressMode;
  progress: number;
  description?: string;
  assignedTo?: string;
  position?: number;
  dueLabel: string;
  dueAt?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeInitial?: string;
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
  wipLimit: number;
  color: string;
  taskProgress: number;
  outcomeProgress: number | null;
  members: readonly string[];
  memberDetails?: readonly ProjectMemberSummary[];
  spaceType?: ProjectSpaceType;
  enabledViews?: readonly ProjectModule[];
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
  entity: "area" | "project" | "task" | "outcome" | "file" | "canvas" | "profile" | "project_member";
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
