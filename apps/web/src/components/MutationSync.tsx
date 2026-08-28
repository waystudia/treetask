import { useEffect, useRef } from "react";
import { db } from "../data/db";
import type { FileRecord, OutcomeEvidenceRecord, OutcomeRecord, ProjectRecord, TaskRecord } from "../data/types";
import { supabase } from "../lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTaskRecord(value: unknown): value is TaskRecord {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<TaskRecord>;
  return typeof task.id === "string" && typeof task.projectId === "string" && typeof task.title === "string";
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<ProjectRecord>;
  return typeof project.id === "string" && typeof project.title === "string" && typeof project.color === "string";
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

export function MutationSync() {
  const syncingRef = useRef(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const flush = async () => {
      if (syncingRef.current || !navigator.onLine) return;
      syncingRef.current = true;
      try {
        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        if (!user) return;
        const queue = await db.mutationQueue.orderBy("createdAt").toArray();
        let flushedAny = false;
        for (const item of queue) {
          let error: { message: string } | null = null;
          if (item.entity === "project" && isProjectRecord(item.payload)) {
            const project = item.payload;
            if (!UUID_PATTERN.test(project.id)) continue;
            const values = {
              name: project.title,
              description: project.description,
              color: project.color,
              icon: "tree",
              task_ratio: 0.7,
              outcome_ratio: 0.3,
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
              status: task.status === "done" ? "done" : task.status === "today" ? "in_progress" : "backlog",
              weight: task.weight,
              progress_mode: task.mode,
              manual_progress: task.progress,
              completed_at: task.status === "done" ? task.updatedAt : null,
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
                uploaded_by: user.id,
                name: file.name,
                storage_path: storagePath,
                mime_type: file.mimeType || "application/octet-stream",
                size_bytes: file.sizeBytes ?? file.blob?.size ?? 0,
                folder: file.folder ?? "",
                updated_at: file.updatedAt,
              }));
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
            if (item.id !== undefined) await db.mutationQueue.update(item.id, { attempts: item.attempts + 1 });
            continue;
          }
          if (item.id !== undefined) {
            await db.mutationQueue.delete(item.id);
            flushedAny = true;
          }
        }
        if (flushedAny) window.dispatchEvent(new Event("treetask:mutation-flushed"));
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
  }, []);

  return null;
}
