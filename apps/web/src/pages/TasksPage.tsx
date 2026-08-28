import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DEMO_TASKS } from "../data/demo";
import { db, saveTaskOffline } from "../data/db";
import type { TaskStatus } from "../data/types";
import { useUiStore } from "../store/ui";

const FILTERS: readonly { value: "all" | TaskStatus; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "today", label: "Сегодня" },
  { value: "overdue", label: "Просрочено" },
  { value: "done", label: "Готово" },
];

const GROUP_LABEL: Record<TaskStatus, string> = {
  today: "Сегодня",
  overdue: "Просрочено",
  done: "Готово",
};

export function TasksPage() {
  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [...DEMO_TASKS]);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);

  const visible = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((task) => task.status === filter)),
    [filter, tasks],
  );

  const toggleTask = async (id: string, current: TaskStatus) => {
    const nextStatus = current === "done" ? "today" : "done";
    const task = await db.tasks.get(id);
    if (!task) return;
    await saveTaskOffline({
      ...task,
      status: nextStatus,
      progress: nextStatus === "done" ? 100 : 0,
      updatedAt: new Date().toISOString(),
    }, "update");
  };

  return (
    <div className="page tasks-page">
      <PageHeader
        title="Мои задачи"
        description="Работа, которая сегодня двигает проекты вперёд."
        action={<button className="button primary" type="button" onClick={() => setQuickTaskOpen(true)}><Plus size={18} /> Новая задача</button>}
      />
      <div className="segmented" aria-label="Фильтр задач">
        {FILTERS.map((item) => (
          <button key={item.value} className={filter === item.value ? "active" : ""} type="button" onClick={() => setFilter(item.value)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="task-groups">
        {(["today", "overdue", "done"] as const).map((status) => {
          const grouped = visible.filter((task) => task.status === status);
          if (grouped.length === 0) return null;
          return (
            <section key={status}>
              <div className="section-title-row"><h2>{GROUP_LABEL[status]}</h2><span>{grouped.length}</span></div>
              <div className="task-list-card">
                {grouped.map((task) => (
                  <article className={`task-row ${task.status === "done" ? "completed" : ""}`} key={task.id}>
                    <button className="task-check" style={{ borderColor: task.accent }} type="button" aria-label={task.status === "done" ? `Вернуть задачу ${task.title}` : `Завершить задачу ${task.title}`} onClick={() => void toggleTask(task.id, task.status)}>
                      {task.status === "done" ? <Check size={14} /> : null}
                    </button>
                    <div className="task-main"><strong>{task.title}</strong><span style={{ color: task.accent }}>{task.projectName}</span></div>
                    <span className="weight-badge" title="Вес задачи">{task.weight}</span>
                    <time className={task.status === "overdue" ? "overdue" : ""}>{task.dueLabel}</time>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
        {visible.length === 0 ? <div className="empty-state"><Check size={26} /><h2>Здесь всё готово</h2><p>Для выбранного фильтра задач нет.</p></div> : null}
      </div>
    </div>
  );
}
