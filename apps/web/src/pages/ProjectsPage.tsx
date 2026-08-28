import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  FolderPlus,
  MoreHorizontal,
  PanelsTopLeft,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CreateAreaDialog } from "../components/CreateAreaDialog";
import { CreateProjectDialog } from "../components/CreateProjectDialog";
import { PageHeader } from "../components/PageHeader";
import { db, deleteAreaOffline, deleteProjectOffline } from "../data/db";
import type { AreaRecord, ProjectRecord } from "../data/types";

interface AreaSection {
  id: string;
  area?: AreaRecord;
  title: string;
  description: string;
  color: string;
  projects: ProjectRecord[];
}

function ProjectToolLink({ project }: { project: ProjectRecord }) {
  const views = project.enabledViews ?? ["tasks", "canvas", "calendar"];
  if (views.includes("canvas")) {
    return <Link to="/project/$projectId/canvas" params={{ projectId: project.id }}><PanelsTopLeft size={14} /> Холст</Link>;
  }
  if (views.includes("tasks")) {
    return <Link to="/project/$projectId/tasks" params={{ projectId: project.id }}><CheckSquare2 size={14} /> Задачи</Link>;
  }
  return <Link to="/project/$projectId/calendar" params={{ projectId: project.id }}><CalendarDays size={14} /> Календарь</Link>;
}

export function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [spaceFilter, setSpaceFilter] = useState<"all" | "personal" | "team">("all");
  const [creatingArea, setCreatingArea] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [defaultAreaId, setDefaultAreaId] = useState<string | undefined>();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectRecord | null>(null);
  const [deleteArea, setDeleteArea] = useState<AreaRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const areas = useLiveQuery(() => db.areas.orderBy("position").toArray(), [], []);
  const normalized = search.trim().toLocaleLowerCase("ru");

  const sections = useMemo<AreaSection[]>(() => {
    const scopedProjects = projects.filter((project) => {
      if (spaceFilter === "all") return true;
      const projectSpace = project.spaceType ?? (project.members.length > 1 ? "team" : "personal");
      return projectSpace === spaceFilter;
    });
    const knownAreaIds = new Set(areas.map((area) => area.id));
    const visibleAreas: AreaSection[] = areas.map((area) => {
      const areaMatches = area.title.toLocaleLowerCase("ru").includes(normalized);
      const nested = scopedProjects.filter((project) => project.areaId === area.id && (
        !normalized || areaMatches || `${project.title} ${project.description}`.toLocaleLowerCase("ru").includes(normalized)
      ));
      return { id: area.id, area, title: area.title, description: area.description, color: area.color, projects: nested };
    }).filter((section) => (
      (spaceFilter === "all" || section.projects.length > 0)
      && (!normalized || section.projects.length > 0 || section.title.toLocaleLowerCase("ru").includes(normalized))
    ));
    const unassigned = scopedProjects.filter((project) => (!project.areaId || !knownAreaIds.has(project.areaId)) && (
      !normalized || `${project.title} ${project.description}`.toLocaleLowerCase("ru").includes(normalized)
    ));
    if (unassigned.length > 0) visibleAreas.push({
      id: "unassigned",
      title: "Без области",
      description: "Проекты, которым ещё нужно выбрать постоянную сферу",
      color: "#8e8e93",
      projects: unassigned,
    });
    return visibleAreas;
  }, [areas, normalized, projects, spaceFilter]);

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

  const openProjectDialog = (areaId?: string) => {
    setOpenMenuId(null);
    setDefaultAreaId(areaId);
    setCreatingProject(true);
  };

  const removeProject = async () => {
    if (!deleteProject) return;
    setDeleting(true);
    await deleteProjectOffline(deleteProject.id);
    setDeleting(false);
    setDeleteProject(null);
  };

  const removeArea = async () => {
    if (!deleteArea) return;
    setDeleting(true);
    await deleteAreaOffline(deleteArea.id);
    setDeleting(false);
    setDeleteArea(null);
  };

  return (
    <div className="page projects-page">
      <PageHeader
        title="Проекты"
        description="Личные планы остаются только вашими, командные проекты объединяют участников, задачи и общий холст."
        action={<div className="project-page-actions"><button className="button secondary" type="button" onClick={() => setCreatingArea(true)}><FolderPlus size={18} /> Новая область</button><button className="button primary" type="button" onClick={() => openProjectDialog()}><Plus size={18} /> Новый проект</button></div>}
      />
      <div className="projects-filter-row">
        <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Поиск областей и проектов</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Найти проект" /></label>
        <div className="project-space-filter" aria-label="Тип проектов">
          <button className={spaceFilter === "all" ? "active" : ""} type="button" onClick={() => setSpaceFilter("all")}>Все</button>
          <button className={spaceFilter === "personal" ? "active" : ""} type="button" onClick={() => setSpaceFilter("personal")}>Личные</button>
          <button className={spaceFilter === "team" ? "active" : ""} type="button" onClick={() => setSpaceFilter("team")}>Командные</button>
        </div>
      </div>

      {sections.length > 0 ? <div className="area-list">{sections.map((section) => (
        <section className="area-section" key={section.id} data-area-id={section.id}>
          <header className="area-header">
            <span className="area-symbol" style={{ color: section.color, background: `color-mix(in srgb, ${section.color} 12%, white)` }}><span style={{ background: section.color }} /></span>
            <div><div className="area-title-row"><h2>{section.title}</h2><span>{section.projects.length}</span></div><p>{section.description}</p></div>
            <button className="icon-button" type="button" onClick={() => openProjectDialog(section.area?.id)} aria-label={`Добавить проект в область ${section.title}`}><Plus size={19} /></button>
            {section.area ? <div className="project-menu-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button" type="button" aria-label={`Меню области ${section.title}`} aria-expanded={openMenuId === `area:${section.id}`} onClick={() => setOpenMenuId((current) => current === `area:${section.id}` ? null : `area:${section.id}`)}><MoreHorizontal size={18} /></button>{openMenuId === `area:${section.id}` ? <div className="project-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleteArea(section.area ?? null); }}><Trash2 size={16} /> Удалить область</button></div> : null}</div> : null}
          </header>
          {section.projects.length > 0 ? <div className="area-project-grid">{section.projects.map((project) => (
            <article className="project-card hierarchy-project-card" key={project.id}>
              <div className="project-card-head"><span className="project-color" style={{ background: project.color }} /><span className="project-space-badge">{(project.spaceType ?? (project.members.length > 1 ? "team" : "personal")) === "personal" ? "Личный" : "Командный"}</span><div className="project-menu-wrap" onPointerDown={(event) => event.stopPropagation()}><button className="icon-button" type="button" aria-label={`Меню проекта ${project.title}`} aria-expanded={openMenuId === `project:${project.id}`} onClick={() => setOpenMenuId((current) => current === `project:${project.id}` ? null : `project:${project.id}`)}><MoreHorizontal size={16} /></button>{openMenuId === `project:${project.id}` ? <div className="project-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setOpenMenuId(null); setDeleteProject(project); }}><Trash2 size={16} /> Удалить проект</button></div> : null}</div></div>
              <Link className="project-open-link" to="/project/$projectId" params={{ projectId: project.id }}><h3>{project.title}</h3><p>{project.description || "Без описания"}</p><span>{project.currentStage || "Планирование"}<ChevronRight size={15} /></span></Link>
              <div className="project-progress-row"><div className="progress-track"><span style={{ width: `${project.taskProgress}%`, background: project.color }} /></div><strong>{project.taskProgress}%</strong></div>
              <footer><div><small>{project.tasksToday} сегодня</small>{project.overdue > 0 ? <small className="overdue">{project.overdue} просрочено</small> : null}</div><ProjectToolLink project={project} /></footer>
            </article>
          ))}<button className="add-project-tile" type="button" onClick={() => openProjectDialog(section.area?.id)}><Plus size={20} /><span><strong>Новый проект</strong><small>в области «{section.title}»</small></span></button></div> : <button className="empty-area-project" type="button" onClick={() => openProjectDialog(section.area?.id)}><Plus size={19} /> Создать первый проект в этой области</button>}
        </section>
      ))}</div> : <section className="empty-state large"><FolderPlus size={34} /><h2>{normalized ? "Ничего не найдено" : "Создайте первую область"}</h2><p>{normalized ? "Измените запрос или создайте новый проект." : "Например, «Работа», «Семья» или «Здоровье», а внутри добавьте проекты и задачи."}</p>{!normalized ? <button className="button primary" type="button" onClick={() => setCreatingArea(true)}>Создать область</button> : null}</section>}

      <CreateAreaDialog open={creatingArea} onClose={() => setCreatingArea(false)} />
      <CreateProjectDialog open={creatingProject} defaultAreaId={defaultAreaId} onClose={() => { setCreatingProject(false); setDefaultAreaId(undefined); }} />

      {deleteProject ? <div className="dialog-backdrop" onMouseDown={() => !deleting && setDeleteProject(null)}><section className="quick-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-project-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Удаление</span><h2 id="delete-project-title">Удалить «{deleteProject.title}»?</h2></div><button className="icon-button" type="button" onClick={() => setDeleteProject(null)} aria-label="Закрыть"><X size={20} /></button></header><p>Задачи, результаты, файлы и доска этого проекта будут удалены локально и из облака. Действие нельзя отменить.</p><footer><button className="button secondary" type="button" onClick={() => setDeleteProject(null)}>Отмена</button><button className="button danger-button" type="button" disabled={deleting} onClick={() => void removeProject()}>{deleting ? "Удаляем…" : "Удалить проект"}</button></footer></section></div> : null}
      {deleteArea ? <div className="dialog-backdrop" onMouseDown={() => !deleting && setDeleteArea(null)}><section className="quick-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-area-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Удаление области</span><h2 id="delete-area-title">Удалить «{deleteArea.title}»?</h2></div><button className="icon-button" type="button" onClick={() => setDeleteArea(null)} aria-label="Закрыть"><X size={20} /></button></header><p>Область будет удалена. Проекты и их данные сохранятся и перейдут в раздел «Без области».</p><footer><button className="button secondary" type="button" onClick={() => setDeleteArea(null)}>Отмена</button><button className="button danger-button" type="button" disabled={deleting} onClick={() => void removeArea()}>{deleting ? "Удаляем…" : "Удалить область"}</button></footer></section></div> : null}
    </div>
  );
}
