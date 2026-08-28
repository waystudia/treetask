import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  CheckSquare2,
  Home,
  LockKeyhole,
  PanelsTopLeft,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectModule, ProjectRecord } from "../data/types";

type WorkspaceView = "overview" | ProjectModule;

interface ProjectWorkspaceHeaderProps {
  project: ProjectRecord;
  areaTitle?: string;
  active: WorkspaceView;
  actions?: ReactNode;
}

const MODULE_LABELS: Record<ProjectModule, string> = {
  tasks: "Задачи",
  canvas: "Холст",
  calendar: "Календарь",
};

export function ProjectWorkspaceHeader({ project, areaTitle, active, actions }: ProjectWorkspaceHeaderProps) {
  const enabledViews = project.enabledViews ?? ["tasks", "canvas", "calendar"];
  const isPersonal = (project.spaceType ?? (project.members.length > 1 ? "team" : "personal")) === "personal";

  return (
    <header className="workspace-project-header">
      <div className="workspace-project-breadcrumb">
        <span>{isPersonal ? <LockKeyhole size={14} /> : <Users size={14} />}{isPersonal ? "Личное" : "Командное"}</span>
        {areaTitle ? <><i>/</i><span>{areaTitle}</span></> : null}
      </div>
      <div className="workspace-project-title-row">
        <div className="workspace-project-title">
          <span className="workspace-project-dot" style={{ background: project.color }} />
          <div><h1>{project.title}</h1><p>{project.description || "Добавьте короткое описание, чтобы всем была понятна цель проекта."}</p></div>
        </div>
        <div className="workspace-project-actions">
          <div className="avatar-stack" aria-label={`${project.members.length} участников`}>
            {project.members.slice(0, 4).map((member, index) => <span key={`${member}-${index}`}>{member}</span>)}
          </div>
          {actions}
        </div>
      </div>
      <nav className="workspace-project-tabs" aria-label={`Разделы проекта ${project.title}`}>
        <Link className={active === "overview" ? "active" : ""} to="/project/$projectId" params={{ projectId: project.id }}><Home size={17} />Обзор</Link>
        {enabledViews.includes("tasks") ? <Link className={active === "tasks" ? "active" : ""} to="/project/$projectId/tasks" params={{ projectId: project.id }}><CheckSquare2 size={17} />{MODULE_LABELS.tasks}</Link> : null}
        {enabledViews.includes("canvas") ? <Link className={active === "canvas" ? "active" : ""} to="/project/$projectId/canvas" params={{ projectId: project.id }}><PanelsTopLeft size={17} />{MODULE_LABELS.canvas}</Link> : null}
        {enabledViews.includes("calendar") ? <Link className={active === "calendar" ? "active" : ""} to="/project/$projectId/calendar" params={{ projectId: project.id }}><CalendarDays size={17} />{MODULE_LABELS.calendar}</Link> : null}
      </nav>
    </header>
  );
}
