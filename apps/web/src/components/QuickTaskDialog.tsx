import { zodResolver } from "@hookform/resolvers/zod";
import { useLiveQuery } from "dexie-react-hooks";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { DEMO_PROJECTS } from "../data/demo";
import { db, saveTaskOffline } from "../data/db";
import { useUiStore } from "../store/ui";

const schema = z.object({
  title: z.string().trim().min(2, "Введите название задачи"),
  projectId: z.string().min(1, "Выберите проект"),
  weight: z.number().refine((value) => [1, 2, 3, 5, 8, 13].includes(value)),
  dueLabel: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

export function QuickTaskDialog() {
  const open = useUiStore((state) => state.quickTaskOpen);
  const setOpen = useUiStore((state) => state.setQuickTaskOpen);
  const projects = useLiveQuery(() => db.projects.toArray(), [], [...DEMO_PROJECTS]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { projectId: "wayyaam", weight: 3, dueLabel: "Сегодня" },
  });

  if (!open) return null;

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
      weight: values.weight as 1 | 2 | 3 | 5 | 8 | 13,
      mode: "binary",
      progress: 0,
      dueLabel: values.dueLabel,
      accent: project.color,
      createdAt: now,
      updatedAt: now,
    });
    reset();
    setOpen(false);
  });

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section
        className="quick-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="eyebrow">Быстрое действие</span>
            <h2 id="quick-task-title">Новая задача</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Закрыть">
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
            <button className="button secondary" type="button" onClick={() => setOpen(false)}>Отмена</button>
            <button className="button primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Сохраняем…" : "Создать задачу"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
