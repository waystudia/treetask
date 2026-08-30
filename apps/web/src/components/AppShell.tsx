import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Files,
  FolderKanban,
  Home,
  Menu,
  PanelsTopLeft,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trees,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../data/db";
import type { ProjectModule, ProjectRecord } from "../data/types";
import { useUiStore } from "../store/ui";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { MutationSync } from "./MutationSync";
import { OnlineStatus } from "./OnlineStatus";
import { QuickTaskDialog } from "./QuickTaskDialog";
import { RemoteDataSync } from "./RemoteDataSync";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: readonly NavItem[] = [
  { label: "Сегодня", to: "/", icon: Home },
  { label: "Мои задачи", to: "/tasks", icon: CheckSquare2 },
  { label: "Календарь", to: "/calendar", icon: CalendarDays },
  { label: "Команда", to: "/team", icon: Users },
];

const LIBRARY_NAV: readonly NavItem[] = [
  { label: "Все проекты", to: "/projects", icon: FolderKanban },
  { label: "Все холсты", to: "/boards", icon: PanelsTopLeft },
  { label: "Файлы", to: "/files", icon: Files },
];

const MOBILE_ITEMS: readonly NavItem[] = [
  { label: "Сегодня", to: "/", icon: Home },
  { label: "Задачи", to: "/tasks", icon: CheckSquare2 },
  { label: "Проекты", to: "/projects", icon: FolderKanban },
  { label: "Календарь", to: "/calendar", icon: CalendarDays },
];

const PROJECT_MODULES: readonly {
  id: ProjectModule;
  label: string;
  icon: LucideIcon;
  path: (projectId: string) => string;
}[] = [
  { id: "tasks", label: "Задачи", icon: CheckSquare2, path: (projectId) => `/project/${projectId}/tasks` },
  { id: "canvas", label: "Холст", icon: PanelsTopLeft, path: (projectId) => `/project/${projectId}/canvas` },
  { id: "calendar", label: "Календарь", icon: CalendarDays, path: (projectId) => `/project/${projectId}/calendar` },
];

function projectSpace(project: ProjectRecord): "personal" | "team" {
  return project.spaceType ?? (project.members.length > 1 ? "team" : "personal");
}

interface ProjectSectionProps {
  title: string;
  projects: readonly ProjectRecord[];
  open: boolean;
  onToggle: () => void;
  pathname: string;
  onNavigate: () => void;
}

function ProjectSection({ title, projects, open, onToggle, pathname, onNavigate }: ProjectSectionProps) {
  return (
    <section className="sidebar-space-section" aria-label={title}>
      <button className="sidebar-section-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        <span>{title}</span>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {open ? (
        <div className="sidebar-project-list">
          {projects.length > 0 ? projects.map((project) => {
            const projectRoot = `/project/${project.id}`;
            const active = pathname === projectRoot || pathname.startsWith(`${projectRoot}/`);
            const enabledViews = project.enabledViews ?? ["tasks", "canvas", "calendar"];
            return (
              <div className={`sidebar-project ${active ? "active" : ""}`} key={project.id}>
                <Link className="sidebar-project-link" to="/project/$projectId" params={{ projectId: project.id }} onClick={onNavigate}>
                  <span className="project-nav-dot" style={{ background: project.color }} />
                  <span>{project.title}</span>
                  <ChevronRight size={14} />
                </Link>
                {active ? (
                  <div className="sidebar-project-pages" aria-label={`Разделы проекта ${project.title}`}>
                    <Link className={pathname === projectRoot ? "active" : ""} to="/project/$projectId" params={{ projectId: project.id }} onClick={onNavigate}>
                      <Home size={15} /><span>Обзор</span>
                    </Link>
                    {PROJECT_MODULES.filter((module) => enabledViews.includes(module.id)).map(({ id, label, icon: Icon, path }) => {
                      const target = path(project.id);
                      return (
                        <Link key={id} className={pathname === target ? "active" : ""} to={target} onClick={onNavigate}>
                          <Icon size={15} /><span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }) : <p className="sidebar-empty-space">Здесь пока нет проектов</p>}
        </div>
      ) : null}
    </section>
  );
}

export function AppShell() {
  const { user, isPlatformAdmin } = useAuth();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projects = useLiveQuery(() => db.projects.orderBy("title").toArray(), [], []);
  const mobileMenuOpen = useUiStore((state) => state.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((state) => state.setMobileMenuOpen);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);
  const profileId = user?.id;
  const profile = useLiveQuery(() => profileId ? db.profiles.get(profileId) : undefined, [profileId]);
  const isProjectControl = /^\/project\/[^/]+\/control$/.test(pathname);
  const [personalOpen, setPersonalOpen] = useState(true);
  const [teamOpen, setTeamOpen] = useState(true);
  const [creatingProject, setCreatingProject] = useState(false);
  const accountLabel = profile?.displayName
    ?? user?.user_metadata?.display_name
    ?? user?.email?.split("@")[0]
    ?? "Гостевой режим";
  const accountInitial = accountLabel.at(0)?.toLocaleUpperCase("ru") ?? "Г";

  const { personalProjects, teamProjects } = useMemo(() => ({
    personalProjects: projects.filter((project) => projectSpace(project) === "personal"),
    teamProjects: projects.filter((project) => projectSpace(project) === "team"),
  }), [projects]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname.startsWith(to);
  const closeMobile = () => setMobileMenuOpen(false);

  return (
    <div className="app-frame">
      <MutationSync />
      <RemoteDataSync />
      <OnlineStatus />
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`} aria-label="Основная навигация">
        <div className="brand-row">
          <span className="brand-mark" aria-hidden="true"><Trees size={21} /></span>
          <div><strong>TreeTask</strong><span>Проекты растут здесь</span></div>
          <button className="icon-button mobile-only" type="button" onClick={closeMobile} aria-label="Закрыть меню"><X size={20} /></button>
        </div>

        <button className="workspace-switcher" type="button" aria-label="Рабочее пространство TreeTask">
          <span className="workspace-symbol"><Trees size={17} /></span>
          <span><strong>Моё пространство</strong><small>Личные и командные проекты</small></span>
          <ChevronDown size={16} />
        </button>

        <nav className="sidebar-nav primary-nav" aria-label="Быстрый доступ">
          <Link to="/projects" className="nav-link search-link" onClick={closeMobile}><Search size={18} /><span>Поиск</span><kbd>⌘ K</kbd></Link>
          {PRIMARY_NAV.map(({ label, to, icon: Icon }) => (
            <Link key={to} to={to} className={`nav-link ${isActive(to) ? "active" : ""}`} onClick={closeMobile}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-spaces">
          <div className="sidebar-projects-head">
            <strong>Проекты</strong>
            <button type="button" onClick={() => setCreatingProject(true)} aria-label="Создать рабочее пространство"><Plus size={16} /><span>Создать</span></button>
          </div>
          <ProjectSection title="Личное" projects={personalProjects} open={personalOpen} onToggle={() => setPersonalOpen((value) => !value)} pathname={pathname} onNavigate={closeMobile} />
          <ProjectSection title="Командное" projects={teamProjects} open={teamOpen} onToggle={() => setTeamOpen((value) => !value)} pathname={pathname} onNavigate={closeMobile} />
        </div>

        <nav className="sidebar-nav library-nav" aria-label="Библиотека">
          {LIBRARY_NAV.map(({ label, to, icon: Icon }) => (
            <Link key={to} to={to} className={`nav-link ${isActive(to) ? "active" : ""}`} onClick={closeMobile}>
              <Icon size={17} aria-hidden="true" /><span>{label}</span>
            </Link>
          ))}
          {isPlatformAdmin ? <Link to="/admin/accounts" className={`nav-link ${isActive("/admin/accounts") ? "active" : ""}`} onClick={closeMobile}><ShieldCheck size={17} /><span>Аккаунты</span></Link> : null}
        </nav>

        <div className="sidebar-account">
          <Link className="sidebar-profile-link" to="/profile">
            <span className="avatar">{accountInitial}</span>
            <span className="sidebar-profile-copy">
              <strong>{accountLabel}</strong>
              <small>{profile?.jobTitle || (isPlatformAdmin ? "Суперадминистратор" : user ? "Аккаунт подключён" : "Offline-first")}</small>
            </span>
          </Link>
          <Link to="/settings" className="icon-button" aria-label="Настройки">
            <Settings size={18} />
          </Link>
        </div>
      </aside>

      {mobileMenuOpen ? <button className="sidebar-scrim" onClick={closeMobile} aria-label="Закрыть меню" /> : null}

      <div className="main-column">
        <header className="mobile-header">
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Открыть меню"><Menu size={22} /></button>
          <strong>TreeTask</strong>
          <Link to="/section/$sectionId" params={{ sectionId: "notifications" }} className="icon-button" aria-label="Уведомления"><Bell size={20} /></Link>
        </header>
        <main className={pathname.includes("/canvas") ? "main-content canvas-route" : "main-content"}><Outlet /></main>
      </div>

      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {MOBILE_ITEMS.map(({ label, to, icon: Icon }) => (
          <Link key={to} to={to} className={isActive(to) ? "active" : ""}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>
        ))}
      </nav>

      {!isProjectControl ? <button className="floating-add" type="button" onClick={() => { setMobileMenuOpen(false); setQuickTaskOpen(true); }} aria-label="Создать задачу">
        <Plus size={24} />
      </button> : null}
      <QuickTaskDialog />
      <CreateProjectDialog open={creatingProject} onClose={() => setCreatingProject(false)} />
    </div>
  );
}
