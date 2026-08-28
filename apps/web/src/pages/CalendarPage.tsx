import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "../components/PageHeader";

const days = Array.from({ length: 35 }, (_, index) => {
  const values = [27, 28, 29, 30, 31, ...Array.from({ length: 30 }, (__, day) => day + 1)];
  return values[index] ?? index;
});

const events = [
  { title: "Дизайн главного экрана", time: "10:00–12:00", color: "#9a64ef" },
  { title: "Обсуждение проекта", time: "13:00–14:00", color: "#42b7c4" },
  { title: "Презентация для клиента", time: "16:00–17:00", color: "#f2a252" },
];

export function CalendarPage() {
  return (
    <div className="page calendar-page">
      <PageHeader title="Календарь" description="Сроки, встречи и фокус команды." action={<button className="button primary" type="button"><Plus size={18} /> Событие</button>} />
      <div className="calendar-layout">
        <section className="calendar-card">
          <header><button className="icon-button" type="button" aria-label="Предыдущий месяц"><ChevronLeft size={19} /></button><h2>Август 2026</h2><button className="icon-button" type="button" aria-label="Следующий месяц"><ChevronRight size={19} /></button></header>
          <div className="weekdays">{["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {days.map((day, index) => <button type="button" className={`${index < 5 ? "muted" : ""} ${day === 27 && index > 4 ? "selected" : ""}`} key={`${day}-${index}`}><span>{day}</span>{[10, 17, 20, 26].includes(day) && index > 4 ? <i /> : null}</button>)}
          </div>
        </section>
        <section className="agenda-card">
          <div className="card-heading-row"><div><span className="eyebrow">27 августа</span><h2>Расписание</h2></div><span className="event-count">3 события</span></div>
          <div className="agenda-list">{events.map((event) => <article key={event.title} style={{ borderColor: event.color }}><time>{event.time}</time><h3>{event.title}</h3><p>WayYaam · Команда проекта</p></article>)}</div>
        </section>
      </div>
    </div>
  );
}
