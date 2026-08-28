import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "./components/AppShell";
import { CalendarPage } from "./pages/CalendarPage";
import { AdminAccountsPage } from "./pages/AdminAccountsPage";
import { BoardsPage } from "./pages/BoardsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { FilesPage } from "./pages/FilesPage";
import { OutcomesPage } from "./pages/OutcomesPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TasksPage } from "./pages/TasksPage";

const LazyCanvasPage = lazy(async () => {
  const module = await import("./pages/CanvasPage");
  return { default: module.CanvasPage };
});

const LazyPhotoAnnotationPage = lazy(async () => {
  const module = await import("./pages/PhotoAnnotationPage");
  return { default: module.PhotoAnnotationPage };
});

function CanvasRoutePage() {
  return <Suspense fallback={<div className="route-loader">Открываем Canvas…</div>}><LazyCanvasPage /></Suspense>;
}

function PhotoAnnotationRoutePage() {
  return <Suspense fallback={<div className="route-loader">Открываем аннотацию…</div>}><LazyPhotoAnnotationPage /></Suspense>;
}

const rootRoute = createRootRoute({ component: AppShell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId",
  component: ProjectDetailPage,
});

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/calendar",
  component: CalendarPage,
});

const boardsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boards",
  component: BoardsPage,
});

const adminAccountsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/accounts",
  component: AdminAccountsPage,
});

const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/files",
  component: FilesPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const canvasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId/canvas",
  component: CanvasRoutePage,
});

const photoAnnotationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId/annotate",
  component: PhotoAnnotationRoutePage,
});

const outcomesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/project/$projectId/outcomes",
  component: OutcomesPage,
});

const placeholderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/section/$sectionId",
  component: PlaceholderPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  tasksRoute,
  projectsRoute,
  projectDetailRoute,
  calendarRoute,
  boardsRoute,
  adminAccountsRoute,
  filesRoute,
  settingsRoute,
  canvasRoute,
  photoAnnotationRoute,
  outcomesRoute,
  placeholderRoute,
]);

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
