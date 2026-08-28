import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreHorizontal, PanelsTopLeft, Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { PageHeader } from "../components/PageHeader";
import { DEMO_PROJECTS } from "../data/demo";
import { db, deleteProjectOffline } from "../data/db";
import type { ProjectRecord } from "../data/types";

const columnTitles = ["В разработке", "Дизайн", "Маркетинг"] as const;

export function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const projects = useLiveQuery(() => db.projects.toArray(), [], [...DEMO_PROJECTS]);
  const normalized = search.trim().toLocaleLowerCase("ru");
  const columns = useMemo(() => {
    const buckets = columnTitles.map((title) => ({ title, projects: [] as typeof projects }));
    projects
      .filter((project) => !normalized || project.title.toLocaleLowerCase("ru").includes(normalized))
      .forEach((project, index) => buckets[index % buckets.length]?.projects.push(project));
    return buckets;
  }, [normalized, projects]);

  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuId]);

  const removeProject = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await deleteProjectOffline(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <div className="page projects-page">
      <PageHeader title="Проекты" description="Все направления и их реальный прогресс." action={<button className="button primary" type="button" onClick={() => setCreating(true)}><Plus size={18} /> Новый проект</button>} />
      <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Поиск проектов</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск" /></label>
      <div className="project-board">
        {columns.map((column) => (
          <section className="project-column" key={column.title}>
            <header><h2>{column.title}</h2><span>{column.projects.length}</span></header>
            <div className="project-stack">
              {column.projects.map((project) => (
                <article className="project-card" key={`${column.title}-${project.id}`}>
                  <div className="project-card-head"><span className="project-color" style={{ background: project.color }} /><div className="project-menu-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button" type="button" aria-label={`Меню проекта ${project.title}`} aria-expanded={openMenuId === project.id} onClick={() => setOpenMenuId((current) => current === project.id ? null : project.id)}><MoreHorizontal size={16} /></button>{openMenuId === project.id ? <div className="project-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleteTarget(project); }}><Trash2 size={16} /> Удалить проект</button></div> : null}</div></div>
                  <h3>{project.title}</h3><p>{project.description}</p>
                  <div className="project-progress-row"><div className="progress-track"><span style={{ width: `${project.taskProgress}%`, background: project.color }} /></div><strong>{project.taskProgress}%</strong></div>
                  <footer><div className="avatar-stack">{project.members.map((member, index) => <span key={`${member}-${index}`}>{member}</span>)}</div><Link to="/project/$projectId/canvas" params={{ projectId: project.id }}><PanelsTopLeft size={14} /> Доска</Link></footer>
                </article>
              ))}
              <button className="add-card" type="button" onClick={() => setCreating(true)}><Plus size={16} /> Добавить проект</button>
            </div>
          </section>
        ))}
      </div>
      <CreateProjectDialog open={creating} onClose={() => setCreating(false)} />
      {deleteTarget ? <div className="dialog-backdrop" onMouseDown={() => !deleting && setDeleteTarget(null)}><section className="quick-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Удаление</span><h2 id="delete-project-title">Удалить «{deleteTarget.title}»?</h2></div><button className="icon-button" type="button" onClick={() => setDeleteTarget(null)} aria-label="Закрыть"><X size={20} /></button></header><p>Задачи, результаты, файлы и доска этого проекта будут удалены. Действие нельзя отменить.</p><footer><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Отмена</button><button className="button danger-button" type="button" disabled={deleting} onClick={() => void removeProject()}>{deleting ? "Удаляем…" : "Удалить проект"}</button></footer></section></div> : null}
    </div>
  );
}
