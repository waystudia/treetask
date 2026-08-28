import { useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { ProjectWorkspaceHeader } from "../components/ProjectWorkspaceHeader";
import { db } from "../data/db";
import { useUiStore } from "../store/ui";

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDays(month: Date): Date[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (start.getDay() + 6) % 7;
  const first = new Date(start);
  first.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function ProjectCalendarPage() {
  const { projectId } = useParams({ from: "/project/$projectId/calendar" });
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const area = useLiveQuery(() => project?.areaId ? db.areas.get(project.areaId) : undefined, [project?.areaId]);
  const tasks = useLiveQuery(() => db.tasks.where("projectId").equals(projectId).toArray(), [projectId], []);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const setQuickTaskProjectId = useUiStore((state) => state.setQuickTaskProjectId);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);
  const days = useMemo(() => calendarDays(month), [month]);
  const tasksByDay = useMemo(() => {
    const grouped = new Map<string, typeof tasks>();
    tasks.forEach((task) => {
      if (!task.dueAt) return;
      const key = dateKey(new Date(task.dueAt));
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    });
    return grouped;
  }, [tasks]);
  const selectedTasks = tasksByDay.get(selectedDay) ?? [];

  if (project === undefined) return <div className="route-loader">Открываем календарь…</div>;
  if (!project) return <section className="empty-state large"><Target size={34} /><h2>Проект не найден</h2><p>Возможно, он был удалён на другом устройстве.</p></section>;

  const openTask = () => {
    setQuickTaskProjectId(project.id);
    setQuickTaskOpen(true);
  };
  const moveMonth = (direction: -1 | 1) => {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };
  const selectedDate = new Date(`${selectedDay}T12:00:00`);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(month);
  const selectedLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate);

  return (
    <div className="page workspace-project-page project-calendar-page">
      <ProjectWorkspaceHeader
        project={project}
        areaTitle={area?.title}
        active="calendar"
        actions={<button className="button primary" type="button" onClick={openTask}><Plus size={18} />Добавить задачу</button>}
      />
      <div className="project-calendar-layout">
        <section className="workspace-calendar-card">
          <header>
            <div><span className="eyebrow">Сроки проекта</span><h2>{monthLabel}</h2></div>
            <div><button className="icon-button" type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={19} /></button><button className="calendar-today-button" type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(dateKey(today)); }}>Сегодня</button><button className="icon-button" type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц"><ChevronRight size={19} /></button></div>
          </header>
          <div className="workspace-calendar-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="workspace-calendar-grid">
            {days.map((day) => {
              const key = dateKey(day);
              const dayTasks = tasksByDay.get(key) ?? [];
              const muted = day.getMonth() !== month.getMonth();
              return (
                <button key={key} className={`${muted ? "muted" : ""} ${selectedDay === key ? "selected" : ""} ${key === dateKey(new Date()) ? "today" : ""}`} type="button" onClick={() => setSelectedDay(key)} aria-label={new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(day)}>
                  <span>{day.getDate()}</span>
                  <div>{dayTasks.slice(0, 2).map((task) => <i key={task.id} style={{ background: task.accent }} title={task.title} />)}{dayTasks.length > 2 ? <small>+{dayTasks.length - 2}</small> : null}</div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="workspace-agenda-card">
          <header><div><span className="eyebrow">Выбранный день</span><h2>{selectedLabel}</h2></div><span>{selectedTasks.length}</span></header>
          <div className="workspace-agenda-list">
            {selectedTasks.map((task) => <article key={task.id} style={{ borderLeftColor: task.accent }}><time>{task.dueAt ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(task.dueAt)) : "Без времени"}</time><strong>{task.title}</strong><p>{task.assigneeName ? `Исполнитель: ${task.assigneeName}` : "Исполнитель не назначен"}</p></article>)}
            {selectedTasks.length === 0 ? <div className="workspace-calendar-empty"><CalendarDays size={24} /><strong>На этот день ничего нет</strong><p>Добавьте задачу — она сразу появится в календаре.</p><button className="button secondary" type="button" onClick={openTask}><Plus size={17} />Добавить задачу</button></div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
