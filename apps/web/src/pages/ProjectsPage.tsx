import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { PageHeader } from "../components/PageHeader";
import { DEMO_PROJECTS } from "../data/demo";
import { db } from "../data/db";

const columnTitles = ["В разработке", "Дизайн", "Маркетинг"] as const;

export function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const projects = useLiveQuery(() => db.projects.toArray(), [], [...DEMO_PROJECTS]);
  const normalized = search.trim().toLocaleLowerCase("ru");
  const columns = useMemo(() => {
    const buckets = columnTitles.map((title) => ({ title, projects: [] as typeof projects }));
    projects
      .filter((project) => !normalized || project.title.toLocaleLowerCase("ru").includes(normalized))
      .forEach((project, index) => buckets[index % buckets.length]?.projects.push(project));
    return buckets;
  }, [normalized, projects]);

  return (
    <div className="page projects-page">
      <PageHeader title="Проекты" description="Все направления и их реальный прогресс." action={<button className="button primary" type="button" onClick={() => setCreating(true)}><Plus size={18} /> Новый проект</button>} />
      <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Поиск проектов</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" /></label>
      <div className="project-board">
        {columns.map((column) => (
          <section className="project-column" key={column.title}>
            <header><h2>{column.title}</h2><button className="icon-button" type="button" aria-label={`Меню колонки ${column.title}`}><MoreHorizontal size={18} /></button></header>
            <div className="project-stack">
              {column.projects.map((project) => (
                <article className="project-card" key={`${column.title}-${project.id}`}>
                  <div className="project-card-head"><span className="project-color" style={{ background: project.color }} /><button className="icon-button" type="button" aria-label={`Меню проекта ${project.title}`}><MoreHorizontal size={16} /></button></div>
                  <h3>{project.title}</h3><p>{project.description}</p>
                  <div className="project-progress-row"><div className="progress-track"><span style={{ width: `${project.taskProgress}%`, background: project.color }} /></div><strong>{project.taskProgress}%</strong></div>
                  <footer><div className="avatar-stack">{project.members.map((member, index) => <span key={`${member}-${index}`}>{member}</span>)}</div><Link to="/project/$projectId/canvas" params={{ projectId: project.id }}>Открыть</Link></footer>
                </article>
              ))}
              <button className="add-card" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Добавить проект</button>
            </div>
          </section>
        ))}
      </div>
      <CreateProjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
