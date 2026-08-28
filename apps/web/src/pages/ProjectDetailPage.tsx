import { Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Gauge,
  ListChecks,
  Plus,
  Send,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ProjectWorkspaceHeader } from "../components/ProjectWorkspaceHeader";
import { db, saveProjectOffline } from "../data/db";
import type { ProjectRecord, TaskRecord } from "../data/types";
import { useUiStore } from "../store/ui";

const TASK_STATUS: Record<TaskRecord["status"], string> = {
  today: "в работе",
  overdue: "просрочена",
  done: "готово",
};

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function projectContext(
  project: ProjectRecord,
  areaTitle: string,
  tasks: readonly TaskRecord[],
  question: string,
): string {
  const taskLines = tasks.length > 0
    ? tasks.map((task, index) => `${index + 1}. ${task.title} — ${TASK_STATUS[task.status]}, прогресс ${task.progress}%, вес ${task.weight}`)
    : ["Задач пока нет."];
  const nextQuestion = question.trim() || "Помоги определить следующие 3 практических шага по этому проекту.";
  return [
    "# Контекст проекта TreeTask",
    "",
    `Область: ${areaTitle}`,
    `Проект: ${project.title}`,
    `Описание: ${project.description || "не заполнено"}`,
    `Цель: ${project.goal || "не заполнена"}`,
    `Текущий этап: ${project.currentStage || "не указан"}`,
    `Прогресс задач: ${project.taskProgress}%`,
    `Прогресс результатов: ${project.outcomeProgress === null ? "результаты ещё не добавлены" : `${project.outcomeProgress}%`}`,
    "",
    "## План",
    project.plan?.trim() || "План пока не заполнен.",
    "",
    "## Задачи",
    ...taskLines,
    "",
    "## Что хочу обсудить с ChatGPT",
    nextQuestion,
    "",
    "Сначала кратко перескажи своё понимание текущего состояния, затем предложи конкретные следующие шаги и отметь риски или недостающие данные.",
  ].join("\n");
}

export function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/project/$projectId" });
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const area = useLiveQuery(
    () => project?.areaId ? db.areas.get(project.areaId) : undefined,
    [project?.areaId],
  );
  const tasks = useLiveQuery(
    () => db.tasks.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const outcomes = useLiveQuery(
    () => db.outcomes.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);
  const setQuickTaskProjectId = useUiStore((state) => state.setQuickTaskProjectId);
  const [goal, setGoal] = useState("");
  const [currentStage, setCurrentStage] = useState("");
  const [plan, setPlan] = useState("");
  const [sharing, setSharing] = useState(false);
  const [question, setQuestion] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) return;
    setGoal(project.goal ?? "");
    setCurrentStage(project.currentStage ?? "");
    setPlan(project.plan ?? "");
  }, [project]);

  useEffect(() => {
    if (!sharing) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSharing(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [sharing]);

  const context = useMemo(
    () => project ? projectContext(project, area?.title ?? "Без области", tasks, question) : "",
    [area?.title, project, question, tasks],
  );

  if (project === undefined) return <div className="route-loader">Открываем проект…</div>;
  if (!project) {
    return <section className="empty-state large"><Target size={34} /><h2>Проект не найден</h2><p>Возможно, он был удалён на другом устройстве.</p><Link className="button primary" to="/projects">К проектам</Link></section>;
  }

  const saveContext = async () => {
    setSaving(true);
    try {
      await saveProjectOffline({ ...project, goal, currentStage, plan }, "update");
      setMessage("Контекст проекта сохранён");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить контекст");
    } finally {
      setSaving(false);
    }
  };

  const copyContext = async () => {
    await copyText(context);
    setMessage("Контекст скопирован — его можно вставить в ChatGPT");
  };

  const openChatGpt = async () => {
    window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
    await copyContext();
    setMessage("Контекст скопирован, ChatGPT открыт в новой вкладке");
  };

  const shareContext = async () => {
    if (!navigator.share) {
      await copyContext();
      return;
    }
    try {
      await navigator.share({ title: `TreeTask — ${project.title}`, text: context });
      setMessage("Контекст передан в выбранное приложение");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Не удалось открыть системное меню — контекст можно скопировать");
    }
  };

  const addTask = () => {
    setQuickTaskProjectId(project.id);
    setQuickTaskOpen(true);
  };

  return (
    <div className="page project-detail-page">
      <ProjectWorkspaceHeader
        project={project}
        areaTitle={area?.title}
        active="overview"
        actions={<><Link className="button secondary" to="/project/$projectId/control" params={{ projectId }}><Gauge size={17} /> Управление</Link><button className="button secondary" type="button" onClick={() => setSharing(true)}><Sparkles size={17} /> Передать в ChatGPT</button></>}
      />

      <section className="project-context-card">
        <header><div><span className="eyebrow">Контекст проекта</span><h2>Где мы сейчас и куда идём</h2></div><span className="context-safety">Ничего не отправляется автоматически</span></header>
        <div className="project-context-grid">
          <label><span><Target size={16} /> Цель</span><textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Какой измеримый результат должен дать проект?" /></label>
          <label><span><CheckCircle2 size={16} /> Текущий этап</span><input value={currentStage} onChange={(event) => setCurrentStage(event.target.value)} placeholder="Например, проверка MVP" /></label>
          <label className="project-plan-field"><span><ListChecks size={16} /> План и следующие шаги</span><textarea value={plan} onChange={(event) => setPlan(event.target.value)} placeholder="Каждый шаг — с новой строки" /></label>
        </div>
        <footer><span role="status">{message}</span><button className="button primary" type="button" disabled={saving} onClick={() => void saveContext()}>{saving ? "Сохраняем…" : "Сохранить контекст"}</button></footer>
      </section>

      <div className="project-detail-grid">
        <section className="project-task-card">
          <header><div><span className="eyebrow">Внутри проекта</span><h2>Задачи</h2></div><button className="icon-button" type="button" onClick={addTask} aria-label="Добавить задачу в проект"><Plus size={19} /></button></header>
          {tasks.length > 0 ? <div className="project-task-list">{tasks.map((task) => <article key={task.id}><span className={`project-task-dot ${task.status}`} /><div><strong>{task.title}</strong><small>{TASK_STATUS[task.status]} · вес {task.weight}</small></div><b>{task.progress}%</b></article>)}</div> : <div className="compact-empty">Задач пока нет. Добавьте первый конкретный шаг.</div>}
        </section>
        <section className="project-summary-card">
          <span className="eyebrow">Результат</span><h2>{project.taskProgress}%</h2><p>прогресс по задачам</p>
          <div className="progress-track"><span style={{ width: `${project.taskProgress}%`, background: project.color }} /></div>
          <dl><div><dt>Задач</dt><dd>{tasks.length}</dd></div><div><dt>Результатов</dt><dd>{outcomes.length}</dd></div><div><dt>Просрочено</dt><dd>{tasks.filter((task) => task.status === "overdue").length}</dd></div></dl>
          <Link className="text-button" to="/project/$projectId/outcomes" params={{ projectId }}>Открыть результаты <ExternalLink size={14} /></Link>
        </section>
      </div>

      {sharing ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSharing(false); }}>
          <section className="quick-dialog chatgpt-dialog" role="dialog" aria-modal="true" aria-labelledby="chatgpt-context-title">
            <header><div><span className="eyebrow">Совместная работа</span><h2 id="chatgpt-context-title">Передать контекст в ChatGPT</h2></div><button className="icon-button" type="button" onClick={() => setSharing(false)} aria-label="Закрыть"><X size={20} /></button></header>
            <p className="form-note">Проверьте текст перед отправкой. TreeTask не передаёт данные автоматически и не хранит ключ OpenAI в браузере.</p>
            <label>Что хотите обсудить<textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Например, помоги расставить приоритеты на неделю" /></label>
            <label>Готовый контекст<textarea className="context-preview" readOnly value={context} /></label>
            <footer className="chatgpt-actions">
              <button className="button secondary" type="button" onClick={() => void copyContext()}><Clipboard size={16} /> Скопировать</button>
              <button className="button secondary" type="button" onClick={() => void shareContext()}><Send size={16} /> Поделиться</button>
              <button className="button primary" type="button" onClick={() => void openChatGpt()}><Sparkles size={16} /> Скопировать и открыть ChatGPT</button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
