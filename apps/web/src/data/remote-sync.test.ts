import { describe, expect, it } from "vitest";
import { fileKind, formatFileSize, mapRemoteTask, remoteTaskStatus } from "./remote-sync";

const task = {
  id: "10000000-0000-4000-8000-000000000001",
  project_id: "10000000-0000-4000-8000-000000000002",
  parent_task_id: null,
  created_by: "10000000-0000-4000-8000-000000000003",
  assigned_to: null,
  title: "Проверить синхронизацию",
  description: "",
  status: "in_progress" as const,
  weight: 5,
  progress_mode: "checklist" as const,
  manual_progress: 0,
  due_at: "2026-08-28T12:00:00.000Z",
  completed_at: null,
  position: 0,
  created_at: "2026-08-27T10:00:00.000Z",
  updated_at: "2026-08-28T09:00:00.000Z",
};

describe("remote task mapping", () => {
  it("maps checklist progress and project presentation fields", () => {
    const mapped = mapRemoteTask(
      task,
      { name: "Remote project", color: "#123456" },
      { completed: 3, total: 4 },
      new Date("2026-08-28T10:00:00.000Z"),
    );

    expect(mapped).toMatchObject({
      projectName: "Remote project",
      accent: "#123456",
      mode: "checklist",
      progress: 75,
      status: "today",
      workflowStatus: "in_progress",
      assignedTo: undefined,
      source: "remote",
    });
  });

  it("maps overdue and completed states deterministically", () => {
    const now = new Date("2026-08-28T13:00:00.000Z");
    expect(remoteTaskStatus(task, now)).toBe("overdue");
    expect(remoteTaskStatus({ status: "done", due_at: task.due_at }, now)).toBe("done");
  });
});

describe("remote file mapping helpers", () => {
  it("classifies common project files and formats their size", () => {
    expect(fileKind("report.pdf", "application/octet-stream")).toBe("pdf");
    expect(fileKind("table.xlsx", "application/vnd.ms-excel")).toBe("spreadsheet");
    expect(fileKind("photo.webp", "image/webp")).toBe("image");
    expect(formatFileSize(2_621_440)).toBe("2,5 МБ");
  });
});
