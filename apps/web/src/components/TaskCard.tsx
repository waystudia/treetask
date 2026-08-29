import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  File,
  FolderKanban,
  Paperclip,
  UserRound,
  X,
} from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { db, saveFileOffline, saveTaskOffline } from "../data/db";
import { fileKind, formatFileSize } from "../data/remote-sync";
import type {
  FileRecord,
  ProfileRecord,
  ProjectMemberRecord,
  ProjectRecord,
  TaskRecord,
} from "../data/types";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

function localDateValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function dateAndTime(task: TaskRecord): { date: string; time: string } {
  const parsed = task.dueAt ? new Date(task.dueAt) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return { date: localDateValue(), time: "18:00" };
  return {
    date: localDateValue(parsed),
    time: `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`,
  };
}

function visibleDueLabel(dateValue: string, timeValue: string): string {
  const today = localDateValue();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateValue === today) return `Сегодня, ${timeValue}`;
  if (dateValue === localDateValue(tomorrow)) return `Завтра, ${timeValue}`;
  return `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${dateValue}T${timeValue}:00`))}, ${timeValue}`;
}

function profileInitial(name: string): string {
  return name.trim().at(0)?.toLocaleUpperCase("ru") ?? "У";
}

interface TaskCardProps {
  task: TaskRecord;
  projects: readonly ProjectRecord[];
  projectMembers: readonly ProjectMemberRecord[];
  profiles: readonly ProfileRecord[];
  files: readonly FileRecord[];
  startRenaming?: boolean;
  onRenamingStarted?: () => void;
  onToggle: (task: TaskRecord) => void;
}

export function TaskCard({
  task,
  projects,
  projectMembers,
  profiles,
  files,
  startRenaming = false,
  onRenamingStarted,
  onToggle,
}: TaskCardProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(startRenaming);
  const [renaming, setRenaming] = useState(startRenaming);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadlineOpen, setDeadlineOpen] = useState(false);
  const initialDeadline = useMemo(() => dateAndTime(task), [task]);
  const [dueDate, setDueDate] = useState(initialDeadline.date);
  const [dueTime, setDueTime] = useState(initialDeadline.time);
  const [notice, setNotice] = useState("");
  const attachments = files.filter((file) => file.taskId === task.id);
  const members = projectMembers
    .filter((member) => member.projectId === task.projectId)
    .flatMap((member) => {
      const profile = profiles.find((item) => item.id === member.userId);
      return profile ? [{ member, profile }] : [];
    });

  useEffect(() => {
    if (!startRenaming) return;
    setExpanded(true);
    setRenaming(true);
    const frame = window.requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
      onRenamingStarted?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onRenamingStarted, startRenaming]);

  const updateTask = async (patch: Partial<TaskRecord>) => {
    const current = await db.tasks.get(task.id) ?? task;
    await saveTaskOffline({ ...current, ...patch, updatedAt: new Date().toISOString() }, "update");
  };

  const beginRenaming = () => {
    setTitle(task.title);
    setRenaming(true);
    window.requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    });
  };

  const saveTitle = async () => {
    const nextTitle = title.trim() || "Новая задача";
    setTitle(nextTitle);
    setRenaming(false);
    if (nextTitle !== task.title) await updateTask({ title: nextTitle });
  };

  const saveDeadline = async () => {
    const due = new Date(`${dueDate}T${dueTime}:00`);
    if (Number.isNaN(due.getTime())) return;
    const nextStatus = task.status === "done"
      ? "done"
      : dueDate < localDateValue()
        ? "overdue"
        : "today";
    await updateTask({
      dueAt: due.toISOString(),
      dueLabel: visibleDueLabel(dueDate, dueTime),
      status: nextStatus,
    });
    setDeadlineOpen(false);
  };

  const changeProject = async (projectId: string) => {
    const nextProject = projects.find((item) => item.id === projectId);
    if (!nextProject) return;
    await updateTask({
      projectId: nextProject.id,
      projectName: nextProject.title,
      accent: nextProject.color,
      assignedTo: undefined,
      assigneeId: undefined,
      assigneeName: undefined,
      assigneeInitial: undefined,
    });
  };

  const changeAssignee = async (userId: string) => {
    const profile = profiles.find((item) => item.id === userId);
    await updateTask({
      assignedTo: profile?.id,
      assigneeId: profile?.id,
      assigneeName: profile?.displayName,
      assigneeInitial: profile ? profileInitial(profile.displayName) : undefined,
    });
  };

  const attachFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNotice("Файл больше 25 МБ");
      return;
    }
    const now = new Date().toISOString();
    await saveFileOffline({
      id: crypto.randomUUID(),
      projectId: task.projectId,
      taskId: task.id,
      name: file.name,
      kind: fileKind(file.name, file.type),
      size: formatFileSize(file.size),
      updatedAt: now,
      folder: "Задачи",
      blob: file,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    setNotice("Файл прикреплён и доступен offline");
  };

  const detachFile = async (file: FileRecord) => {
    await saveFileOffline({ ...file, taskId: undefined, updatedAt: new Date().toISOString() });
  };

  return (
    <article className={`task-row task-card ${task.status === "done" ? "completed" : ""} ${expanded ? "expanded" : ""}`}>
      <div className="task-card-summary">
        <button
          className="task-check"
          style={{ borderColor: task.accent }}
          type="button"
          aria-label={task.status === "done" ? `Вернуть задачу ${task.title}` : `Завершить задачу ${task.title}`}
          onClick={() => onToggle(task)}
        >
          {task.status === "done" ? <Check size={16} /> : null}
        </button>

        <div className="task-main">
          {renaming ? (
            <input
              ref={titleRef}
              className="task-title-input"
              value={title}
              aria-label="Название задачи"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveTitle();
                if (event.key === "Escape") { setTitle(task.title); setRenaming(false); }
              }}
            />
          ) : (
            <button className="task-open-button" type="button" aria-label={`Переименовать задачу ${task.title}`} onClick={beginRenaming}>
              <strong>{task.title}</strong>
              <span>{task.description?.trim() || "Нажмите, чтобы переименовать"}</span>
            </button>
          )}
        </div>

        <label className="task-project-control" title={attachments.length > 0 ? "Открепите файлы, чтобы сменить проект" : "Проект задачи"}>
          <FolderKanban size={16} aria-hidden="true" />
          <span className="sr-only">Проект задачи {task.title}</span>
          <select value={task.projectId} disabled={attachments.length > 0} onChange={(event) => void changeProject(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>

        <div className="task-deadline-wrap">
          <button className={`task-deadline-button ${task.status === "overdue" ? "overdue" : ""}`} type="button" aria-label={`Дедлайн задачи ${task.title}: ${task.dueLabel}`} aria-expanded={deadlineOpen} onClick={() => setDeadlineOpen((value) => !value)}>
            <Bell size={16} aria-hidden="true" />
            <span>{task.dueLabel}</span>
          </button>
          {deadlineOpen ? (
            <div className="task-deadline-popover" aria-label={`Дедлайн задачи ${task.title}`}>
              <label>Дата<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
              <label>Время<input type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} /></label>
              <button className="button primary" type="button" onClick={() => void saveDeadline()}>Готово</button>
            </div>
          ) : null}
        </div>

        <button className="task-expand-button" type="button" aria-label={`${expanded ? "Свернуть" : "Открыть"} задачу ${task.title}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          <ChevronDown size={18} />
        </button>
      </div>

      {expanded ? (
        <div className="task-card-details">
          <label className="task-description-field">
            <span>Описание</span>
            <textarea
              value={description}
              rows={3}
              placeholder="Добавьте контекст, ссылки или ожидаемый результат…"
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => { if (description !== (task.description ?? "")) void updateTask({ description }); }}
            />
          </label>

          <div className="task-detail-grid">
            <label className="task-assignee-control">
              <span><UserRound size={16} /> Передать задачу</span>
              <select value={task.assignedTo ?? ""} onChange={(event) => void changeAssignee(event.target.value)}>
                <option value="">Не назначена</option>
                {members.map(({ member, profile }) => <option key={member.id} value={profile.id}>{profile.displayName}</option>)}
              </select>
            </label>

            <div className="task-attachment-control">
              <span><Paperclip size={16} /> Файлы и медиа</span>
              <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()}><Paperclip size={16} /> Прикрепить</button>
              <input ref={fileInputRef} className="sr-only" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={(event) => void attachFile(event)} />
            </div>
          </div>

          {attachments.length > 0 ? (
            <div className="task-attachments" aria-label={`Файлы задачи ${task.title}`}>
              {attachments.map((file) => (
                <span key={file.id}><File size={15} /><b>{file.name}</b><small>{file.size}</small><button type="button" aria-label={`Открепить файл ${file.name}`} onClick={() => void detachFile(file)}><X size={14} /></button></span>
              ))}
            </div>
          ) : <p className="task-attachments-empty"><CalendarDays size={15} /> Всё по задаче хранится здесь и доступно без сети.</p>}
          {notice ? <p className="task-card-notice" role="status">{notice}</p> : null}
        </div>
      ) : null}
    </article>
  );
}
