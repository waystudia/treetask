import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { db } from "../data/db";
import type { AreaRecord, CanvasSnapshot, FileRecord, OutcomeEvidenceRecord, OutcomeRecord, ProfileRecord, ProjectMemberRecord, ProjectRecord, TaskRecord } from "../data/types";
import { supabase } from "../lib/supabase";
import { useRemoteSyncStore } from "../store/remote-sync";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTaskRecord(value: unknown): value is TaskRecord {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<TaskRecord>;
  return typeof task.id === "string" && typeof task.projectId === "string" && typeof task.title === "string";
}

function isAreaRecord(value: unknown): value is AreaRecord {
  if (!value || typeof value !== "object") return false;
  const area = value as Partial<AreaRecord>;
  return typeof area.id === "string" && typeof area.title === "string" && typeof area.color === "string";
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectRecord>;
  return typeof project.id === "string" && typeof project.title === "string" && typeof project.color === "string";
}

function isProfileRecord(value: unknown): value is ProfileRecord {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<ProfileRecord>;
  return typeof profile.id === "string" && typeof profile.displayName === "string";
}

function isProjectMemberRecord(value: unknown): value is ProjectMemberRecord {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<ProjectMemberRecord>;
  return typeof member.projectId === "string" && typeof member.userId === "string" && typeof member.role === "string";
}

function isFileRecord(value: unknown): value is FileRecord {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<FileRecord>;
  return typeof file.id === "string" && typeof file.projectId === "string" && typeof file.name === "string";
}

function isOutcomeRecord(value: unknown): value is OutcomeRecord {
  if (!value || typeof value !== "object") return false;
  const outcome = value as Partial<OutcomeRecord>;
  return typeof outcome.id === "string" && typeof outcome.projectId === "string" && typeof outcome.title === "string" && typeof outcome.status === "string";
}

function evidenceFromQueue(value: unknown): OutcomeEvidenceRecord | null {
  if (!value || typeof value !== "object") return null;
  const queued = value as { kind?: unknown; evidence?: Partial<OutcomeEvidenceRecord> };
  const evidence = queued.evidence;
  return queued.kind === "evidence" && evidence && typeof evidence.id === "string" && typeof evidence.outcomeId === "string" && typeof evidence.projectId === "string"
    ? evidence as OutcomeEvidenceRecord
    : null;
}

function photoAnnotationIdFromQueue(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const queued = value as { kind?: unknown; annotationId?: unknown };
  return queued.kind === "photo_annotation" && typeof queued.annotationId === "string"
    ? queued.annotationId
    : null;
}

function canvasSnapshotFromQueue(value: unknown): CanvasSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const queued = value as { kind?: unknown; snapshot?: Partial<CanvasSnapshot> };
  const snapshot = queued.snapshot;
  return queued.kind === "canvas_snapshot"
    && snapshot
    && typeof snapshot.projectId === "string"
    && typeof snapshot.payload === "string"
    && typeof snapshot.updatedAt === "string"
    ? snapshot as CanvasSnapshot
    : null;
}

function encodeCanvasSnapshot(snapshot: CanvasSnapshot): string {
  const document = new Y.Doc();
  try {
    document.getMap<string>("canvas").set("snapshot", snapshot.payload);
    const update = Y.encodeStateAsUpdate(document);
    return `\\x${Array.from(update, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  } finally {
    document.destroy();
  }
}

function functionMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { ok?: unknown; message?: unknown };
  return response.ok === false && typeof response.message === "string" ? response.message : null;
}

export function MutationSync() {
  const syncingRef = useRef(false);
  const setRemoteSync = useRemoteSyncStore((state) => state.setRemoteSync);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const flush = async () => {
      if (syncingRef.current || !navigator.onLine) return;
      syncingRef.current = true;
      try {
        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        const queue = await db.mutationQueue.orderBy("createdAt").toArray();
        if (!user) {
          if (queue.length > 0) setRemoteSync(
            "signed_out",
            `${queue.length} ${queue.length === 1 ? "изменение сохранено" : "изменений сохранено"} на устройстве; войдите для синхронизации`,
          );
          return;
        }
        if (queue.length === 0) return;
        setRemoteSync("syncing", `Отправляем изменения: ${queue.length}`);
        let flushedAny = false;
        let failed = 0;
        for (const item of queue) {
          let error: { message: string } | null = null;
          if (item.entity === "profile" && isProfileRecord(item.payload)) {
            const profile = item.payload;
            if (profile.id !== user.id) continue;
            ({ error } = await client.from("profiles").upsert({
              id: user.id,
              display_name: profile.displayName,
              job_title: profile.jobTitle,
              department: profile.department,
              bio: profile.bio,
              skills: [...profile.skills],
              timezone: profile.timezone,
              work_status: profile.workStatus,
              weekly_capacity_hours: profile.weeklyCapacityHours,
            }));
            if (!error) {
              const authUpdate = await client.auth.updateUser({
                data: { display_name: profile.displayName },
              });
              error = authUpdate.error;
            }
          } else if (item.entity === "project_member" && item.operation === "delete" && isProjectMemberRecord(item.payload)) {
            const member = item.payload;
            ({ error } = await client.from("project_members").delete()
              .eq("project_id", member.projectId)
              .eq("user_id", member.userId));
          } else if (item.entity === "project_member" && isProjectMemberRecord(item.payload)) {
            const member = item.payload;
            ({ error } = await client.from("project_members").upsert({
              project_id: member.projectId,
              user_id: member.userId,
              role: member.role,
              responsibility: member.responsibility,
              allocation_percent: member.allocationPercent,
              invited_by: member.invitedBy ?? user.id,
            }));
          } else if (item.entity === "area" && item.operation === "delete") {
            if (!UUID_PATTERN.test(item.entityId)) continue;
            ({ error } = await client.from("areas").delete().eq("id", item.entityId));
          } else if (item.entity === "area" && isAreaRecord(item.payload)) {
            const area = item.payload;
            if (!UUID_PATTERN.test(area.id)) continue;
            const values = {
              name: area.title,
              description: area.description,
              color: area.color,
              position: area.position,
            } as const;
            if (item.operation === "insert") {
              ({ error } = await client.from("areas").upsert({ id: area.id, owner_id: user.id, ...values }));
            } else {
              ({ error } = await client.from("areas").update(values).eq("id", area.id));
            }
          } else if (item.entity === "project" && item.operation === "delete") {
            if (!UUID_PATTERN.test(item.entityId)) continue;
            const response = await client.functions.invoke("account-management", {
              body: { action: "delete_project", projectId: item.entityId },
            });
            error = response.error
              ? { message: response.error.message }
              : functionMessage(response.data)
                ? { message: functionMessage(response.data) ?? "Не удалось удалить проект" }
                : null;
          } else if (item.entity === "project" && isProjectRecord(item.payload)) {
            const project = item.payload;
            if (!UUID_PATTERN.test(project.id)) continue;
            const values = {
              area_id: project.areaId && UUID_PATTERN.test(project.areaId) ? project.areaId : null,
              name: project.title,
              description: project.description,
              goal: project.goal ?? "",
              current_stage: project.currentStage ?? "",
              plan: project.plan ?? "",
              space_type: project.spaceType ?? (project.members.length > 1 ? "team" : "personal"),
              enabled_views: Array.from(project.enabledViews ?? ["tasks", "canvas", "calendar"]) as Array<"tasks" | "canvas" | "calendar">,
              color: project.color,
              icon: "tree",
              task_ratio: 0.7,
              outcome_ratio: 0.3,
              wip_limit: project.wipLimit,
            } as const;
            if (item.operation === "insert") {
              ({ error } = await client.from("projects").upsert({
                id: project.id,
                owner_id: user.id,
                ...values,
              }));
            } else {
              ({ error } = await client.from("projects").update(values).eq("id", project.id));
            }
          } else if (item.entity === "task" && isTaskRecord(item.payload)) {
            const task = item.payload;
            if (!UUID_PATTERN.test(task.id) || !UUID_PATTERN.test(task.projectId)) continue;
            const values = {
              title: task.title,
              description: task.description ?? "",
              status: task.workflowStatus,
              assigned_to: task.assignedTo && UUID_PATTERN.test(task.assignedTo) ? task.assignedTo : null,
              weight: task.weight,
              progress_mode: task.mode,
              manual_progress: task.progress,
              due_at: task.dueAt ?? null,
              position: task.position ?? 0,
              completed_at: task.workflowStatus === "done" ? task.updatedAt : null,
              updated_at: task.updatedAt,
            } as const;
            if (item.operation === "insert") {
              ({ error } = await client.from("tasks").upsert({
                id: task.id,
                project_id: task.projectId,
                created_by: user.id,
                ...values,
              }));
            } else {
              ({ error } = await client.from("tasks").update(values)
                .eq("id", task.id)
                .eq("project_id", task.projectId));
            }
          } else if (item.entity === "outcome" && isOutcomeRecord(item.payload)) {
            const outcome = item.payload;
            if (!UUID_PATTERN.test(outcome.id) || !UUID_PATTERN.test(outcome.projectId)) continue;
            const reviewed = outcome.status === "confirmed" || outcome.status === "rejected";
            const values = {
              title: outcome.title,
              description: outcome.description ?? "",
              status: outcome.status,
              submitted_at: outcome.status === "submitted" ? outcome.updatedAt ?? new Date().toISOString() : null,
              reviewer_id: reviewed ? user.id : null,
              reviewed_at: reviewed ? outcome.updatedAt ?? new Date().toISOString() : null,
              review_comment: outcome.reviewComment ?? null,
              updated_at: outcome.updatedAt ?? new Date().toISOString(),
            } as const;
            if (item.operation === "insert") {
              ({ error } = await client.from("outcomes").upsert({
                id: outcome.id,
                project_id: outcome.projectId,
                created_by: user.id,
                ...values,
              }));
            } else {
              ({ error } = await client.from("outcomes").update(values)
                .eq("id", outcome.id)
                .eq("project_id", outcome.projectId));
            }
          } else if (item.entity === "outcome") {
            const evidence = evidenceFromQueue(item.payload);
            if (!evidence || !UUID_PATTERN.test(evidence.id) || !UUID_PATTERN.test(evidence.outcomeId) || !UUID_PATTERN.test(evidence.projectId)) continue;
            let storagePath: string | null = null;
            if (evidence.blob instanceof Blob) {
              const safeName = evidence.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120);
              storagePath = `${evidence.projectId}/${evidence.outcomeId}/${evidence.id}-${safeName}`;
              const upload = await client.storage.from("outcome-evidence").upload(storagePath, evidence.blob, {
                contentType: evidence.mimeType,
                upsert: true,
              });
              error = upload.error;
            }
            if (!error) {
              ({ error } = await client.from("outcome_evidence").upsert({
                id: evidence.id,
                outcome_id: evidence.outcomeId,
                created_by: user.id,
                kind: evidence.kind,
                storage_path: storagePath,
                external_url: evidence.externalUrl ?? null,
                comment: evidence.comment ?? evidence.name,
                metadata: { name: evidence.name, mimeType: evidence.mimeType ?? null },
              }));
            }
          } else if (item.entity === "file" && isFileRecord(item.payload)) {
            const file = item.payload;
            if (!UUID_PATTERN.test(file.id) || !UUID_PATTERN.test(file.projectId)) continue;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "file";
            const storagePath = file.storagePath ?? `${file.projectId}/files/${file.id}-${safeName}`;
            if (file.blob instanceof Blob) {
              const upload = await client.storage.from("project-files").upload(storagePath, file.blob, {
                contentType: file.mimeType || file.blob.type || "application/octet-stream",
                upsert: true,
              });
              error = upload.error;
            } else if (!file.storagePath) {
              continue;
            }
            if (!error) {
              ({ error } = await client.from("project_files").upsert({
                id: file.id,
                project_id: file.projectId,
                task_id: file.taskId && UUID_PATTERN.test(file.taskId) ? file.taskId : null,
                uploaded_by: user.id,
                name: file.name,
                storage_path: storagePath,
                mime_type: file.mimeType || "application/octet-stream",
                size_bytes: file.sizeBytes ?? file.blob?.size ?? 0,
                folder: file.folder ?? "",
                updated_at: file.updatedAt,
              }));
            }
          } else if (item.entity === "canvas" && canvasSnapshotFromQueue(item.payload)) {
            const snapshot = canvasSnapshotFromQueue(item.payload);
            if (!snapshot || !UUID_PATTERN.test(snapshot.projectId)) continue;
            const remote = await client
              .from("canvas_documents")
              .select("id,updated_at")
              .eq("project_id", snapshot.projectId)
              .maybeSingle();
            error = remote.error;
            if (!error) {
              const remoteUpdatedAt = remote.data?.updated_at
                ? Date.parse(remote.data.updated_at)
                : Number.NEGATIVE_INFINITY;
              if (remoteUpdatedAt < Date.parse(snapshot.updatedAt)) {
                const values = {
                  project_id: snapshot.projectId,
                  name: "Основная доска",
                  yjs_snapshot: encodeCanvasSnapshot(snapshot),
                  snapshot_version: Date.now(),
                  updated_by: user.id,
                  updated_at: snapshot.updatedAt,
                };
                if (remote.data?.id) {
                  ({ error } = await client.from("canvas_documents").update(values).eq("id", remote.data.id));
                } else {
                  ({ error } = await client.from("canvas_documents").insert({ id: snapshot.projectId, ...values }));
                }
              }
            }
          } else if (item.entity === "canvas") {
            const annotationId = photoAnnotationIdFromQueue(item.payload);
            if (!annotationId || !UUID_PATTERN.test(annotationId)) continue;
            const annotation = await db.photoAnnotations.get(annotationId);
            if (!annotation || !UUID_PATTERN.test(annotation.projectId)) continue;
            const sourceResponse = await fetch(annotation.sourceDataUrl);
            const sourceBlob = await sourceResponse.blob();
            const safeName = annotation.sourceName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "source-image";
            const storagePath = `${annotation.projectId}/annotations/${annotation.id}-${safeName}`;
            const upload = await client.storage.from("project-media").upload(storagePath, sourceBlob, {
              contentType: sourceBlob.type || "image/jpeg",
              upsert: true,
            });
            error = upload.error;
            if (!error) {
              ({ error } = await client.from("project_files").upsert({
                id: annotation.id,
                project_id: annotation.projectId,
                uploaded_by: user.id,
                name: annotation.sourceName,
                storage_path: storagePath,
                mime_type: sourceBlob.type || "image/jpeg",
                size_bytes: sourceBlob.size,
                folder: "annotations",
              }));
            }
            if (!error) {
              ({ error } = await client.from("photo_annotations").upsert({
                id: annotation.id,
                project_id: annotation.projectId,
                source_file_id: annotation.id,
                created_by: user.id,
                source_sha256: annotation.sourceHash,
                annotation_data: {
                  version: 1,
                  objects: annotation.vectors.map((vector) => ({
                    ...vector,
                    points: [...vector.points],
                  })),
                },
                created_at: annotation.createdAt,
                updated_at: annotation.updatedAt,
              }));
            }
          } else {
            continue;
          }
          if (error) {
            failed += 1;
            if (item.id !== undefined) await db.mutationQueue.update(item.id, { attempts: item.attempts + 1 });
            continue;
          }
          if (item.id !== undefined) {
            await db.mutationQueue.delete(item.id);
            flushedAny = true;
          }
        }
        const remaining = await db.mutationQueue.count();
        if (failed > 0) {
          setRemoteSync("error", `${remaining} изменений не отправлено; повторим автоматически`);
        } else if (flushedAny) {
          setRemoteSync("syncing", "Изменения отправлены; обновляем данные…");
          window.dispatchEvent(new Event("treetask:mutation-flushed"));
        }
      } catch (error) {
        const remaining = await db.mutationQueue.count();
        setRemoteSync(
          "error",
          `${remaining} изменений ожидают отправки; повторим автоматически${error instanceof Error ? `: ${error.message}` : ""}`,
        );
      } finally {
        syncingRef.current = false;
      }
    };

    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    const interval = window.setInterval(() => void flush(), 15_000);
    const { data: authListener } = client.auth.onAuthStateChange(() => void flush());
    void flush();
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
      authListener.subscription.unsubscribe();
    };
  }, [setRemoteSync]);

  return null;
}
