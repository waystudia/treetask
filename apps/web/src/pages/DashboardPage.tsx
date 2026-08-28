import { Link } from "@tanstack/react-router";
import { projectProgress } from "@treetask/domain";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, CheckCircle2, Clock3, PanelsTopLeft, Target, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { DEMO_ACTIVITY, DEMO_OUTCOMES, DEMO_TASKS } from "../data/demo";
import { db } from "../data/db";
import { isSupabaseConfigured } from "../lib/supabase";

export function DashboardPage() {
  const { user } = useAuth();
  const [authHintHidden, setAuthHintHidden] = useState(() => window.localStorage.getItem("treetask:auth-hint-hidden") === "true");
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [...DEMO_TASKS]);
  const outcomes = useLiveQuery(
    () => db.outcomes.where("projectId").equals("wayyaam").toArray(),
    [],
    [...DEMO_OUTCOMES],
  );

  const progress = projectProgress(
    tasks.map((task) => ({
      weight: task.weight,
      mode: "manual",
      manualPercent: task.progress,
    })),
    outcomes.map((outcome) => ({
      status: outcome.status,
      evidenceCount: outcome.evidenceCount,
    })),
  );
  const roundedProgress = Math.round(progress.totalProgress);
  const treeColumn = progress.treeStage % 7;
  const treeRow = Math.floor(progress.treeStage / 7);
  const treePositionX = (treeColumn / 6) * 100;
  const treePositionY = (treeRow / 2) * 100;
  const today = tasks.filter((task) => task.status === "today").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const overdue = tasks.filter((task) => task.status === "overdue").length;
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const displayName = user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Магомед";
  const hideAuthHint = () => {
    window.localStorage.setItem("treetask:auth-hint-hidden", "true");
    setAuthHintHidden(true);
  };

  return (
    <div className="page dashboard-page">
      {!user && isSupabaseConfigured && !authHintHidden ? <section className="auth-hint"><span><UserPlus size={18} /></span><div><strong>Первый вход?</strong><p>Создайте аккаунт или войдите, чтобы синхронизировать данные между устройствами.</p></div><Link className="button primary" to="/settings">Войти или зарегистрироваться</Link><button className="icon-button" type="button" onClick={hideAuthHint} aria-label="Закрыть подсказку"><X size={18} /></button></section> : null}
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">{dateLabel}</span>
          <h1>Добрый вечер, {displayName}</h1>
          <p>Продолжайте в своём темпе — дерево уже заметно выросло.</p>
        </div>
        <div className="page-action">
          <Link to="/project/$projectId/canvas" params={{ projectId: "wayyaam" }} className="button primary"><PanelsTopLeft size={18} /> Открыть доску</Link>
          <Link to="/project/$projectId/outcomes" params={{ projectId: "wayyaam" }} className="button secondary"><Target size={18} /> Результаты</Link>
        </div>
      </header>

      <section className="dashboard-grid">
        <article className="tree-card">
          <div className="tree-copy">
            <span className="project-kicker"><span /> WayYaam</span>
            <div className="progress-number">{roundedProgress}%</div>
            <p>Общий прогресс проекта</p>
            <div className="progress-track" aria-label={`Прогресс ${roundedProgress}%`}>
              <span style={{ width: `${roundedProgress}%` }} />
            </div>
            <dl className="progress-breakdown">
              <div><dt>Задачи</dt><dd>{Math.round(progress.taskProgress)}%</dd></div>
              <div><dt>Результаты</dt><dd>{progress.outcomeProgress === null ? "—" : `${Math.round(progress.outcomeProgress)}%`}</dd></div>
            </dl>
            {progress.outcomeProgress === null ? (
              <Link className="outcome-hint" to="/project/$projectId/outcomes" params={{ projectId: "wayyaam" }}>
                Добавьте измеримый результат проекта.
              </Link>
            ) : null}
          </div>
          <div className="tree-visual">
            <div className="tree-glow" aria-hidden="true" />
            <div className="tree-stage-wrap">
              <div
                className="tree-stage-sprite"
                role="img"
                aria-label={`Зелёное дерево проекта: стадия ${progress.treeStage} из 20, рост по задачам ${Math.round(progress.taskProgress)}%, общий прогресс ${roundedProgress}%`}
                style={{ backgroundPosition: `${treePositionX}% ${treePositionY}%` }}
              />
              {progress.outcomeLayer > 0 ? (
                <div
                  className={`fruit-layer fruit-layer-${progress.outcomeLayer}`}
                  aria-label={`Уровень цветов и плодов ${progress.outcomeLayer} из 5`}
                >
                  {Array.from({ length: progress.outcomeLayer * 3 }, (_, index) => <span key={index} />)}
                </div>
              ) : null}
            </div>
          </div>
        </article>

        <article className="focus-card">
          <div className="card-heading-row">
            <div>
              <span className="eyebrow">Фокус дня</span>
              <h2>Сегодня</h2>
            </div>
            <Link to="/tasks">Все задачи <ArrowRight size={16} /></Link>
          </div>
          <div className="metric-grid">
            <div><span className="metric-icon blue"><Clock3 size={18} /></span><strong>{today}</strong><small>На сегодня</small></div>
            <div><span className="metric-icon green"><CheckCircle2 size={18} /></span><strong>{done}</strong><small>Выполнено</small></div>
            <div><span className="metric-icon red"><Target size={18} /></span><strong>{overdue}</strong><small>Просрочено</small></div>
          </div>
          <div className="today-list">
            {tasks.filter((task) => task.status === "today").slice(0, 3).map((task) => (
              <div className="compact-task" key={task.id}>
                <span className="task-ring" style={{ borderColor: task.accent }} />
                <div><strong>{task.title}</strong><small>{task.projectName}</small></div>
                <time>{task.dueLabel}</time>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="activity-card">
        <div className="card-heading-row">
          <div><span className="eyebrow">Команда</span><h2>Последняя активность</h2></div>
          <Link to="/section/$sectionId" params={{ sectionId: "activity" }}>Показать всё <ArrowRight size={16} /></Link>
        </div>
        <div className="activity-list">
          {DEMO_ACTIVITY.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="activity-avatar" style={{ background: item.tone }}>{item.actor.at(0)}</span>
              <p><strong>{item.actor}</strong> {item.action}</p>
              <time>{item.time}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
