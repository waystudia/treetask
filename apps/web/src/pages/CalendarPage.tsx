import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
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
  const first = new Date(start);
  first.setDate(first.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
}

export function CalendarPage() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
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
  const selectedDate = new Date(`${selectedDay}T12:00:00`);
  const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(month);
  const selectedLabel = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate);
  const moveMonth = (direction: -1 | 1) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));

  return (
    <div className="page calendar-page">
      <PageHeader title="Календарь" description="Все личные и командные сроки в одном месте." action={<button className="button primary" type="button" onClick={() => setQuickTaskOpen(true)}><Plus size={18} /> Новая задача</button>} />
      <div className="project-calendar-layout">
        <section className="workspace-calendar-card">
          <header>
            <div><span className="eyebrow">Все проекты</span><h2>{monthLabel}</h2></div>
            <div><button className="icon-button" type="button" onClick={() => moveMonth(-1)} aria-label="Предыдущий месяц"><ChevronLeft size={19} /></button><button className="calendar-today-button" type="button" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(dateKey(today)); }}>Сегодня</button><button className="icon-button" type="button" onClick={() => moveMonth(1)} aria-label="Следующий месяц"><ChevronRight size={19} /></button></div>
          </header>
          <div className="workspace-calendar-weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="workspace-calendar-grid">
            {days.map((day) => {
              const key = dateKey(day);
              const dayTasks = tasksByDay.get(key) ?? [];
              return (
                <button key={key} className={`${day.getMonth() !== month.getMonth() ? "muted" : ""} ${selectedDay === key ? "selected" : ""} ${key === dateKey(new Date()) ? "today" : ""}`} type="button" onClick={() => setSelectedDay(key)} aria-label={new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(day)}>
                  <span>{day.getDate()}</span>
                  <div>{dayTasks.slice(0, 3).map((task) => <i key={task.id} style={{ background: task.accent }} title={`${task.projectName}: ${task.title}`} />)}{dayTasks.length > 3 ? <small>+{dayTasks.length - 3}</small> : null}</div>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="workspace-agenda-card">
          <header><div><span className="eyebrow">Выбранный день</span><h2>{selectedLabel}</h2></div><span>{selectedTasks.length}</span></header>
          <div className="workspace-agenda-list">
            {selectedTasks.map((task) => <article key={task.id} style={{ borderLeftColor: task.accent }}><time>{task.dueAt ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(task.dueAt)) : "Без времени"}</time><strong>{task.title}</strong><p>{task.projectName}{task.assigneeName ? ` · ${task.assigneeName}` : " · Не назначена"}</p></article>)}
            {selectedTasks.length === 0 ? <div className="workspace-calendar-empty"><CalendarDays size={24} /><strong>На этот день ничего нет</strong><p>Создайте задачу и укажите дату — она появится здесь автоматически.</p><button className="button secondary" type="button" onClick={() => setQuickTaskOpen(true)}><Plus size={17} />Добавить задачу</button></div> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
