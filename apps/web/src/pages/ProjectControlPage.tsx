import { Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Gauge,
  Plus,
  Save,
  ShieldAlert,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { projectControlMetrics, TASK_WORKFLOW_STATUSES, type TaskWorkflowStatus } from "@treetask/domain";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db, saveProjectOffline, saveTaskOffline } from "../data/db";
import { DEMO_CURRENT_PROFILE_ID } from "../data/demo";
import type { TaskRecord } from "../data/types";
import { useUiStore } from "../store/ui";

const STAGE_META: Record<TaskWorkflowStatus, { label: string; hint: string; tone: string }> = {
  backlog: { label: "Входящие", hint: "Нужно разобрать", tone: "neutral" },
  planned: { label: "Запланировано", hint: "Есть приоритет", tone: "planned" },
  in_progress: { label: "В работе", hint: "Ограничено WIP", tone: "active" },
  blocked: { label: "Заблокировано", hint: "Нужно решение", tone: "blocked" },
  done: { label: "Готово", hint: "Работа завершена", tone: "done" },
};

const HEALTH_META = {
  stable: { label: "Стабильно", text: "Поток задач под контролем", tone: "stable" },
  attention: { label: "Нужно внимание", text: "Есть очередь, просрочка или перегрузка WIP", tone: "attention" },
  risk: { label: "Есть риск", text: "Блокировки уже влияют на движение проекта", tone: "risk" },
} as const;

function profileInitial(name: string): string {
  return name.trim().at(0)?.toLocaleUpperCase("ru") ?? "У";
}

export function ProjectControlPage() {
  const { projectId } = useParams({ from: "/project/$projectId/control" });
  const { user } = useAuth();
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const tasks = useLiveQuery(() => db.tasks.where("projectId").equals(projectId).toArray(), [projectId], []);
  const members = useLiveQuery(() => db.projectMembers.where("projectId").equals(projectId).toArray(), [projectId], []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const [wipLimit, setWipLimit] = useState(3);
  const [message, setMessage] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);
  const setQuickTaskProjectId = useUiStore((state) => state.setQuickTaskProjectId);
  const currentUserId = user?.id ?? DEMO_CURRENT_PROFILE_ID;
  const currentMembership = members.find((member) => member.userId === currentUserId);
  const canEdit = Boolean(currentMembership && currentMembership.role !== "viewer");
  const canManage = currentMembership?.role === "owner" || currentMembership?.role === "admin";

  useEffect(() => {
    if (project) setWipLimit(project.wipLimit);
  }, [project]);

  const metrics = useMemo(() => projectControlMetrics(tasks.map((task) => ({
    workflowStatus: task.workflowStatus,
    timingStatus: task.status,
    assignedTo: task.assignedTo,
    weight: task.weight,
  })), project?.wipLimit ?? 3), [project?.wipLimit, tasks]);
  const health = HEALTH_META[metrics.health];

  if (project === undefined) return <div className="route-loader">Открываем центр управления…</div>;
  if (!project) return <section className="empty-state large"><Gauge size={34} /><h2>Проект не найден</h2><p>Возможно, доступ к проекту изменился.</p><Link className="button primary" to="/projects">К проектам</Link></section>;

  const memberOptions = members.flatMap((member) => {
    const profile = profiles.find((item) => item.id === member.userId);
    return profile ? [{ member, profile }] : [];
  });

  const moveTask = async (task: TaskRecord, direction: -1 | 1) => {
    const currentIndex = TASK_WORKFLOW_STATUSES.indexOf(task.workflowStatus);
    const nextStatus = TASK_WORKFLOW_STATUSES[currentIndex + direction];
    if (!nextStatus) return;
    const nextTiming = nextStatus === "done" ? "done" : task.status === "done" ? "today" : task.status;
    await saveTaskOffline({
      ...task,
      workflowStatus: nextStatus,
      status: nextTiming,
      progress: nextStatus === "done" ? 100 : task.mode === "binary" && task.workflowStatus === "done" ? 0 : task.progress,
      updatedAt: new Date().toISOString(),
    }, "update");
    setMessage(`Задача «${task.title}» перемещена: ${STAGE_META[nextStatus].label}`);
  };

  const assignTask = async (task: TaskRecord, assignedTo: string) => {
    await saveTaskOffline({ ...task, assignedTo: assignedTo || undefined, updatedAt: new Date().toISOString() }, "update");
    setMessage(assignedTo ? `Исполнитель задачи «${task.title}» обновлён` : `Задача «${task.title}» возвращена без исполнителя`);
  };

  const saveWipLimit = async () => {
    setSavingLimit(true);
    try {
      const nextLimit = Math.min(50, Math.max(1, Math.round(wipLimit)));
      await saveProjectOffline({ ...project, wipLimit: nextLimit }, "update");
      setWipLimit(nextLimit);
      setMessage(`Лимит одновременной работы: ${nextLimit}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить WIP-лимит");
    } finally {
      setSavingLimit(false);
    }
  };

  const addTask = () => {
    setQuickTaskProjectId(project.id);
    setQuickTaskOpen(true);
  };

  return (
    <div className="page control-page">
      <Link className="project-back" to="/project/$projectId" params={{ projectId }}><ArrowLeft size={17} /> Обзор проекта</Link>
      <header className="control-heading">
        <div><span className="area-path"><i style={{ background: project.color }} />Центр управления</span><h1>{project.title}</h1><p>Воронка показывает движение работы, команда — ответственность, сигналы — то, что требует решения.</p></div>
        <div className="control-heading-actions"><Link className="button secondary" to="/team"><Users size={17} /> Команда</Link><button className="button primary" type="button" onClick={addTask}><Plus size={17} /> Новая задача</button></div>
      </header>

      <section className={`project-health-banner ${health.tone}`}>
        <span><ShieldAlert size={21} /></span><div><strong>{health.label}</strong><p>{health.text}</p></div><div className="health-bottleneck"><small>Самая большая очередь</small><b>{metrics.bottleneckStatus ? STAGE_META[metrics.bottleneckStatus].label : "Нет задач"}</b></div>
      </section>

      <div className="control-metrics" aria-label="Показатели управления проектом">
        <article><CircleDot size={18} /><span><strong>{metrics.active}</strong><small>активных задач</small></span></article>
        <article className={metrics.overdue > 0 ? "warning" : ""}><Clock3 size={18} /><span><strong>{metrics.overdue}</strong><small>просрочено</small></span></article>
        <article className={metrics.blocked > 0 ? "danger" : ""}><AlertTriangle size={18} /><span><strong>{metrics.blocked}</strong><small>заблокировано</small></span></article>
        <article className={metrics.unassigned > 0 ? "warning" : ""}><UserRoundCheck size={18} /><span><strong>{metrics.unassigned}</strong><small>без исполнителя</small></span></article>
        <article><CheckCircle2 size={18} /><span><strong>{metrics.completionPercent}%</strong><small>веса завершено</small></span></article>
      </div>

      <section className="funnel-section">
        <header><div><span className="eyebrow">Поток работы</span><h2>Воронка задач</h2></div><div className={`wip-control ${metrics.wip > metrics.wipLimit ? "exceeded" : ""}`}><span>В работе {metrics.wip} из</span><input aria-label="WIP-лимит проекта" type="number" min="1" max="50" value={wipLimit} disabled={!canManage} onChange={(event) => setWipLimit(Number(event.target.value))} /><button className="icon-button" type="button" disabled={!canManage || savingLimit || wipLimit === project.wipLimit} onClick={() => void saveWipLimit()} aria-label="Сохранить WIP-лимит"><Save size={17} /></button></div></header>
        <p className="control-message" role="status">{message}</p>
        <div className="task-funnel">{TASK_WORKFLOW_STATUSES.map((stage) => {
          const stageTasks = tasks.filter((task) => task.workflowStatus === stage).sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
          const meta = STAGE_META[stage];
          return <section className={`funnel-column ${meta.tone}`} key={stage} aria-labelledby={`stage-${stage}`}><header><span><i /><h3 id={`stage-${stage}`}>{meta.label}</h3><small>{meta.hint}</small></span><b>{stageTasks.length}</b></header><div className="funnel-stack">{stageTasks.map((task) => {
            const assignee = profiles.find((profile) => profile.id === task.assignedTo);
            const index = TASK_WORKFLOW_STATUSES.indexOf(stage);
            return <article className={`funnel-task ${task.status === "overdue" ? "overdue" : ""}`} key={task.id}><div className="funnel-task-top"><span className="task-weight">{task.weight}</span><span className="task-due">{task.dueLabel}</span></div><h3>{task.title}</h3><select value={task.assignedTo ?? ""} disabled={!canEdit} aria-label={`Исполнитель задачи ${task.title}`} onChange={(event) => void assignTask(task, event.target.value)}><option value="">Без исполнителя</option>{memberOptions.map(({ member, profile }) => <option key={member.id} value={profile.id}>{profile.displayName}</option>)}</select><footer><span className="mini-assignee" title={assignee?.displayName ?? "Без исполнителя"}>{assignee ? profileInitial(assignee.displayName) : "?"}</span><span className="funnel-move"><button className="icon-button" type="button" disabled={!canEdit || index === 0} onClick={() => void moveTask(task, -1)} aria-label={`Переместить задачу ${task.title} назад`}><ChevronLeft size={17} /></button><button className="icon-button" type="button" disabled={!canEdit || index === TASK_WORKFLOW_STATUSES.length - 1} onClick={() => void moveTask(task, 1)} aria-label={`Переместить задачу ${task.title} вперёд`}><ChevronRight size={17} /></button></span></footer></article>;
          })}{stageTasks.length === 0 ? <div className="funnel-empty">Нет задач</div> : null}</div></section>;
        })}</div>
      </section>

      <section className="project-team-control">
        <header><div><span className="eyebrow">Люди и ответственность</span><h2>Команда проекта</h2></div><Link className="text-button" to="/team">Управлять командой <ArrowRight size={15} /></Link></header>
        {memberOptions.length > 0 ? <div className="project-member-strip">{memberOptions.map(({ member, profile }) => {
          const assigned = tasks.filter((task) => task.assignedTo === profile.id && task.workflowStatus !== "done");
          const capacity = Math.round(profile.weeklyCapacityHours * member.allocationPercent / 100);
          return <Link key={member.id} to="/profile/$profileId" params={{ profileId: profile.id }}><span className="team-avatar">{profileInitial(profile.displayName)}</span><span><strong>{profile.displayName}</strong><small>{member.responsibility || "Ответственность не указана"}</small></span><span><b>{assigned.length} задач · {assigned.reduce((sum, task) => sum + task.weight, 0)} баллов</b><small>{member.allocationPercent}% · около {capacity} ч/нед.</small></span></Link>;
        })}</div> : <div className="compact-empty">Добавьте участников, чтобы назначать ответственность и видеть загрузку.</div>}
      </section>
    </div>
  );
}
