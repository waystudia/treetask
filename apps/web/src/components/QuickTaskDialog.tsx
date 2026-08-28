import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { X } from "lucide-react";
import { useEffect, useLayoutEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { db, saveTaskOffline } from "../data/db";
import { useUiStore } from "../store/ui";

const schema = z.object({
  title: z.string().trim().min(2, "Введите название задачи"),
  projectId: z.string().min(1, "Выберите проект"),
  weight: z.number().refine((value) => [1, 2, 3, 5, 8, 13].includes(value)),
  workflowStatus: z.enum(["backlog", "planned", "in_progress", "blocked"]),
  assignedTo: z.string(),
  dueDate: z.string().min(1, "Выберите дату"),
  dueLabel: z.string().min(1, "Выберите время"),
});

type FormValues = z.infer<typeof schema>;

function localDateValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function visibleDueLabel(dateValue: string, timeValue: string): string {
  const today = localDateValue();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  if (dateValue === today) return `Сегодня, ${timeValue}`;
  if (dateValue === localDateValue(tomorrowDate)) return `Завтра, ${timeValue}`;
  const date = new Date(`${dateValue}T${timeValue}:00`);
  return `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date)}, ${timeValue}`;
}

export function QuickTaskDialog() {
  const open = useUiStore((state) => state.quickTaskOpen);
  const setOpen = useUiStore((state) => state.setQuickTaskOpen);
  const preferredProjectId = useUiStore((state) => state.quickTaskProjectId);
  const setPreferredProjectId = useUiStore((state) => state.setQuickTaskProjectId);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectMembers = useLiveQuery(() => db.projectMembers.toArray(), [], []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      projectId: "",
      weight: 3,
      workflowStatus: "planned",
      assignedTo: "",
      dueDate: localDateValue(),
      dueLabel: "18:00",
    },
  });
  const selectedProjectId = watch("projectId");
  const defaultProjectId = preferredProjectId && projects.some((project) => project.id === preferredProjectId)
    ? preferredProjectId
    : projects[0]?.id ?? "";
  const availableMembers = projectMembers
    .filter((member) => member.projectId === selectedProjectId)
    .flatMap((member) => {
      const profile = profiles.find((item) => item.id === member.userId);
      return profile ? [{ member, profile }] : [];
    });
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const memberOptions = availableMembers.length > 0
    ? availableMembers.map(({ profile }) => ({
        userId: profile.id,
        name: profile.displayName,
        initial: profile.displayName.at(0)?.toLocaleUpperCase("ru") ?? "У",
      }))
    : selectedProject?.memberDetails ?? [];

  const close = () => {
    reset();
    setPreferredProjectId(null);
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open) return;
    reset({
      projectId: defaultProjectId,
      weight: 3,
      workflowStatus: "planned",
      assignedTo: "",
      dueDate: localDateValue(),
      dueLabel: "18:00",
      title: "",
    });
  }, [defaultProjectId, open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  if (projects.length === 0) {
    return (
      <div className="dialog-backdrop" role="presentation" onPointerDown={close}>
        <section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-task-empty-title" onPointerDown={(event) => event.stopPropagation()}>
          <header><div><span className="eyebrow">Новая задача</span><h2 id="quick-task-empty-title">Сначала создайте проект</h2></div><button className="icon-button" type="button" onClick={close} aria-label="Закрыть"><X size={20} /></button></header>
          <p className="form-note">Задача всегда относится к проекту, а проект — к выбранной области.</p>
          <footer><button className="button primary" type="button" onClick={close}>Понятно</button></footer>
        </section>
      </div>
    );
  }

  const submit = handleSubmit(async (values) => {
    const project = projects.find((item) => item.id === values.projectId);
    if (!project) return;
    const assignee = memberOptions.find((member) => member.userId === values.assignedTo);
    const now = new Date().toISOString();
    const due = new Date(`${values.dueDate}T${values.dueLabel}:00`);
    await saveTaskOffline({
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.title,
      title: values.title,
      status: "today",
      workflowStatus: values.workflowStatus,
      weight: values.weight as 1 | 2 | 3 | 5 | 8 | 13,
      mode: "binary",
      progress: 0,
      assignedTo: values.assignedTo || undefined,
      dueLabel: visibleDueLabel(values.dueDate, values.dueLabel),
      dueAt: Number.isNaN(due.getTime()) ? undefined : due.toISOString(),
      assigneeId: assignee?.userId,
      assigneeName: assignee?.name,
      assigneeInitial: assignee?.initial,
      accent: project.color,
      createdAt: now,
      updatedAt: now,
    });
    reset();
    setOpen(false);
  });

  return (
    <div className="dialog-backdrop" role="presentation" onPointerDown={close}>
      <section
        className="quick-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-task-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Быстрое действие</span>
            <h2 id="quick-task-title">Новая задача</h2>
          </div>
          <button className="icon-button" type="button" onClick={close} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            Название
            <input autoFocus placeholder="Например, проверить макет" {...register("title")} />
            {errors.title ? <span className="field-error">{errors.title.message}</span> : null}
          </label>
          <label>
            Проект
            <select {...register("projectId")}>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            {errors.projectId ? <span className="field-error">{errors.projectId.message}</span> : null}
          </label>
          <div className="form-grid">
            <label>
              Этап воронки
              <select {...register("workflowStatus")}>
                <option value="backlog">Входящие</option>
                <option value="planned">Запланировано</option>
                <option value="in_progress">В работе</option>
                <option value="blocked">Заблокировано</option>
              </select>
            </label>
            <label>
              Исполнитель
              <select {...register("assignedTo")}>
                <option value="">Не назначен</option>
                {memberOptions.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            <label>
              Вес
              <select {...register("weight", { valueAsNumber: true })}>
                <option value="1">1 — очень маленькая</option>
                <option value="2">2 — маленькая</option>
                <option value="3">3 — обычная</option>
                <option value="5">5 — существенная</option>
                <option value="8">8 — крупная</option>
                <option value="13">13 — критическая</option>
              </select>
            </label>
            <label>
              Дата
              <input type="date" {...register("dueDate")} />
            </label>
            <label>
              Срок
              <input type="time" {...register("dueLabel")} />
            </label>
          </div>
          <footer>
            <button className="button secondary" type="button" onClick={close}>Отмена</button>
            <button className="button primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Сохраняем…" : "Создать задачу"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
