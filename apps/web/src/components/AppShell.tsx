import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarDays,
  CheckSquare2,
  Files,
  FolderKanban,
  Home,
  Menu,
  Plus,
  Settings,
  Star,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { OnlineStatus } from "./OnlineStatus";
import { MutationSync } from "./MutationSync";
import { QuickTaskDialog } from "./QuickTaskDialog";
import { RemoteDataSync } from "./RemoteDataSync";
import { useUiStore } from "../store/ui";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Главная", to: "/", icon: Home },
  { label: "Мои задачи", to: "/tasks", icon: CheckSquare2 },
  { label: "Проекты", to: "/projects", icon: FolderKanban },
  { label: "Календарь", to: "/calendar", icon: CalendarDays },
  { label: "Команда", to: "/section/team", icon: Users },
  { label: "Файлы", to: "/files", icon: Files },
  { label: "Избранное", to: "/section/favorites", icon: Star },
  { label: "Уведомления", to: "/section/notifications", icon: Bell },
];

const MOBILE_ITEMS = NAV_ITEMS.slice(0, 4);

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const mobileMenuOpen = useUiStore((state) => state.mobileMenuOpen);
  const setMobileMenuOpen = useUiStore((state) => state.setMobileMenuOpen);
  const setQuickTaskOpen = useUiStore((state) => state.setQuickTaskOpen);

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <div className="app-frame">
      <MutationSync />
      <RemoteDataSync />
      <OnlineStatus />
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`} aria-label="Основная навигация">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">🌳</div>
          <div>
            <strong>TreeTask</strong>
            <span>WayYaam</span>
          </div>
          <button className="icon-button mobile-only" type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`nav-link ${isActive(to) ? "active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="avatar">М</span>
          <div>
            <strong>Магомед</strong>
            <span>Владелец</span>
          </div>
          <Link to="/settings" className="icon-button" aria-label="Настройки">
            <Settings size={18} />
          </Link>
        </div>
      </aside>

      {mobileMenuOpen ? <button className="sidebar-scrim" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню" /> : null}

      <div className="main-column">
        <header className="mobile-header">
          <button className="icon-button" type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Открыть меню">
            <Menu size={22} />
          </button>
          <strong>TreeTask</strong>
          <Link to="/section/$sectionId" params={{ sectionId: "notifications" }} className="icon-button" aria-label="Уведомления">
            <Bell size={20} />
          </Link>
        </header>
        <main className={pathname.includes("/canvas") ? "main-content canvas-route" : "main-content"}>
          <Outlet />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {MOBILE_ITEMS.map(({ label, to, icon: Icon }) => (
          <Link key={to} to={to} className={isActive(to) ? "active" : ""}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      <button className="floating-add" type="button" onClick={() => setQuickTaskOpen(true)} aria-label="Создать задачу">
        <Plus size={24} />
      </button>
      <QuickTaskDialog />
    </div>
  );
}
