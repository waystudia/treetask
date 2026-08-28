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
  dueLabel: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

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
    defaultValues: { projectId: "", weight: 3, workflowStatus: "planned", assignedTo: "", dueLabel: "Сегодня" },
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
      dueLabel: "Сегодня",
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
    const now = new Date().toISOString();
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
      dueLabel: values.dueLabel,
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
                {availableMembers.map(({ member, profile }) => <option key={member.id} value={profile.id}>{profile.displayName}</option>)}
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
              Срок
              <input {...register("dueLabel")} />
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
