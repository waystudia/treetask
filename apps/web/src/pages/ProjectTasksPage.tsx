import { useParams } from "@tanstack/react-router";
import { projectProgress } from "@treetask/domain";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  Check,
  Columns3,
  List,
  Plus,
  Target,
} from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectWorkspaceHeader } from "../components/ProjectWorkspaceHeader";
import { TaskCard } from "../components/TaskCard";
import { TreeStagePreview } from "../components/TreeStagePreview";
import { db, saveTaskOffline } from "../data/db";
import type { TaskRecord, TaskStatus } from "../data/types";
import { useUiStore } from "../store/ui";

const STATUS_LABEL: Record<TaskStatus, string> = {
  today: "Сегодня",
  overdue: "Просрочено",
  done: "Готово",
};

export function ProjectTasksPage() {
  const { projectId } = useParams({ from: "/project/$projectId/tasks" });
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const area = useLiveQuery(() => project?.areaId ? db.areas.get(project.areaId) : undefined, [project?.areaId]);
  const tasks = useLiveQuery(() => db.tasks.where("projectId").equals(projectId).toArray(), [projectId], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectMembers = useLiveQuery(() => db.projectMembers.toArray(), [], []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const files = useLiveQuery(() => db.projectFiles.toArray(), [], []);
  const outcomes = useLiveQuery(() => db.outcomes.where("projectId").equals(projectId).toArray(), [projectId], []);
  const [view, setView] = useState<"list" | "board">("list");
  const setQuickTaskProjectId = useUiStore((state) => state.setQuickTaskProjectId);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);

  const progress = useMemo(() => projectProgress(
    tasks.map((task) => ({ weight: task.weight, mode: "manual" as const, manualPercent: task.progress })),
    outcomes.map((outcome) => ({ status: outcome.status, evidenceCount: outcome.evidenceCount })),
  ), [outcomes, tasks]);

  if (project === undefined) return <div className="route-loader">Открываем задачи…</div>;
  if (!project) return <section className="empty-state large"><Target size={34} /><h2>Проект не найден</h2><p>Возможно, он был удалён на другом устройстве.</p></section>;

  const openTask = () => {
    setQuickTaskProjectId(project.id);
    setQuickTaskOpen(true);
  };

  const toggleTask = async (task: TaskRecord) => {
    const status = task.status === "done" ? "today" : "done";
    await saveTaskOffline({
      ...task,
      status,
      progress: status === "done" ? 100 : 0,
      updatedAt: new Date().toISOString(),
    }, "update");
  };

  const activeTasks = tasks.filter((task) => task.status !== "done").length;
  const roundedProgress = Math.round(progress.totalProgress);

  return (
    <div className="page workspace-project-page project-tasks-page">
      <ProjectWorkspaceHeader
        project={project}
        areaTitle={area?.title}
        active="tasks"
        actions={<button className="button primary" type="button" onClick={openTask}><Plus size={18} />Добавить задачу</button>}
      />

      <div className="workspace-view-toolbar">
        <div className="workspace-view-switcher" aria-label="Вид задач">
          <button className={view === "list" ? "active" : ""} type="button" onClick={() => setView("list")}><List size={17} />Список</button>
          <button className={view === "board" ? "active" : ""} type="button" onClick={() => setView("board")}><Columns3 size={17} />Доска</button>
        </div>
        <span>{activeTasks} активных · {project.members.length} участников</span>
      </div>

      <div className="project-tasks-layout">
        <section className="project-tasks-content" aria-label="Задачи проекта">
          {view === "list" ? (
            <div className="workspace-task-groups">
              {(["overdue", "today", "done"] as const).map((status) => {
                const group = tasks.filter((task) => task.status === status);
                if (group.length === 0) return null;
                return (
                  <section key={status}>
                    <div className="workspace-group-title"><h2>{STATUS_LABEL[status]}</h2><span>{group.length}</span></div>
                    <div className="task-list-card">{group.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        projects={projects}
                        projectMembers={projectMembers}
                        profiles={profiles}
                        files={files}
                        onToggle={(item) => void toggleTask(item)}
                      />
                    ))}</div>
                  </section>
                );
              })}
              {tasks.length === 0 ? <button className="workspace-empty-action" type="button" onClick={openTask}><Plus size={20} /><span><strong>Добавьте первую задачу</strong><small>Укажите исполнителя, дату и время — она появится здесь и в календаре.</small></span></button> : null}
            </div>
          ) : (
            <div className="workspace-task-board">
              {(["overdue", "today", "done"] as const).map((status) => {
                const group = tasks.filter((task) => task.status === status);
                return (
                  <section key={status}>
                    <header><span className={`board-status-dot ${status}`} /><h2>{STATUS_LABEL[status]}</h2><b>{group.length}</b></header>
                    <div>{group.map((task) => <article className="workspace-board-card" key={task.id}><button className="task-check" style={{ borderColor: task.accent }} type="button" aria-label={task.status === "done" ? `Вернуть задачу ${task.title}` : `Завершить задачу ${task.title}`} onClick={() => void toggleTask(task)}>{task.status === "done" ? <Check size={14} /> : null}</button><strong>{task.title}</strong><footer>{task.assigneeInitial ? <span className="task-assignee">{task.assigneeInitial}</span> : <span /> }<time>{task.dueLabel}</time></footer></article>)}</div>
                    <button className="board-add-task" type="button" onClick={openTask}><Plus size={16} />Добавить</button>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <aside className="project-progress-panel" aria-label="Прогресс проекта">
          <header><span className="eyebrow">Прогресс проекта</span><strong>{roundedProgress}%</strong></header>
          <div className="project-tree-comparison" aria-label="Начальное, текущее и конечное дерево проекта">
            <TreeStagePreview stage={0} outcomeLayer={0} label="Старт" description="Начальное дерево проекта, стадия 0 из 20" variant="start" />
            <TreeStagePreview stage={progress.treeStage} outcomeLayer={progress.outcomeLayer} label="Сейчас" description={`Дерево проекта, стадия ${progress.treeStage} из 20`} variant="current" />
            <TreeStagePreview stage={20} outcomeLayer={5} label="Цель" description="Конечное дерево проекта, стадия 20 из 20" variant="goal" />
          </div>
          <div className="progress-track"><span style={{ width: `${roundedProgress}%` }} /></div>
          <dl><div><dt>Задачи</dt><dd>{Math.round(progress.taskProgress)}%</dd></div><div><dt>Результаты</dt><dd>{progress.outcomeProgress === null ? "—" : `${Math.round(progress.outcomeProgress)}%`}</dd></div></dl>
          <p><CalendarDays size={17} /><span><small>Следующий шаг</small><strong>{tasks.find((task) => task.status === "overdue")?.title ?? tasks.find((task) => task.status === "today")?.title ?? "Добавить новую задачу"}</strong></span></p>
        </aside>
      </div>
    </div>
  );
}
