import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, PanelsTopLeft, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { PageHeader } from "../components/PageHeader";
import { db } from "../data/db";

export function BoardsPage() {
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);

  return (
    <div className="page boards-page">
      <PageHeader title="Доски" description="Визуальное пространство каждого проекта — доступно и без сети." action={<Link className="button secondary" to="/projects"><Plus size={18} /> Новый проект</Link>} />
      {projects.length > 0 ? (
        <div className="boards-grid">
          {projects.map((project) => (
            <Link className="board-card" key={project.id} to="/project/$projectId/canvas" params={{ projectId: project.id }}>
              <div className="board-preview" style={{ "--board-accent": project.color } as CSSProperties}>
                <span /><span /><span /><span />
                <PanelsTopLeft size={25} />
              </div>
              <div><span className="project-color" style={{ background: project.color }} /><strong>{project.title}</strong><small>Основная доска · сохранение offline-first</small></div>
              <ArrowUpRight size={19} />
            </Link>
          ))}
        </div>
      ) : (
        <section className="empty-state large"><PanelsTopLeft size={34} /><h2>Создайте первую доску</h2><p>Доска появится автоматически вместе с проектом.</p><Link className="button primary" to="/projects">Перейти к проектам</Link></section>
      )}
    </div>
  );
}
