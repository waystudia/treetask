import { useLiveQuery } from "dexie-react-hooks";
import { Check, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { TaskCard } from "../components/TaskCard";
import { db, saveTaskOffline } from "../data/db";
import type { TaskStatus } from "../data/types";

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
  const [renamingTaskId, setRenamingTaskId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectMembers = useLiveQuery(() => db.projectMembers.toArray(), [], []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const files = useLiveQuery(() => db.projectFiles.toArray(), [], []);

  const visible = useMemo(
    () => (filter === "all" ? tasks : tasks.filter((task) => task.status === filter)),
    [filter, tasks],
  );

  const toggleTask = async (task: (typeof tasks)[number]) => {
    const nextStatus = task.status === "done" ? "today" : "done";
    await saveTaskOffline({
      ...task,
      status: nextStatus,
      workflowStatus: nextStatus === "done" ? "done" : "in_progress",
      progress: nextStatus === "done" ? 100 : 0,
      updatedAt: new Date().toISOString(),
    }, "update");
  };

  const addTask = async () => {
    if (adding || projects.length === 0) return;
    setAdding(true);
    try {
      const contextProjectId = visible.find((task) => task.status !== "done")?.projectId
        ?? tasks.find((task) => task.status !== "done")?.projectId;
      const project = projects.find((item) => item.id === contextProjectId) ?? projects[0];
      if (!project) return;
      const now = new Date();
      const due = new Date(now);
      due.setHours(18, 0, 0, 0);
      const id = crypto.randomUUID();
      await saveTaskOffline({
        id,
        projectId: project.id,
        projectName: project.title,
        title: "Новая задача",
        status: "today",
        workflowStatus: "planned",
        weight: 3,
        mode: "binary",
        progress: 0,
        dueLabel: "Сегодня, 18:00",
        dueAt: due.toISOString(),
        accent: project.color,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      setFilter("today");
      setRenamingTaskId(id);
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="page tasks-page">
      <PageHeader
        title="Мои задачи"
        description="Работа, которая сегодня двигает проекты вперёд."
        action={<button className="button primary" type="button" disabled={adding} onClick={() => void addTask()}><Plus size={18} /> {adding ? "Добавляем…" : "Новая задача"}</button>}
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
          const grouped = visible
            .filter((task) => task.status === status)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
          if (grouped.length === 0) return null;
          return (
            <section key={status}>
              <div className="section-title-row"><h2>{GROUP_LABEL[status]}</h2><span>{grouped.length}</span></div>
              <div className="task-list-card">
                {grouped.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    projects={projects}
                    projectMembers={projectMembers}
                    profiles={profiles}
                    files={files}
                    startRenaming={renamingTaskId === task.id}
                    onRenamingStarted={() => setRenamingTaskId(null)}
                    onToggle={(item) => void toggleTask(item)}
                  />
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
