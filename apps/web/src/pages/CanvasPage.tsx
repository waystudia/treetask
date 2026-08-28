import { useParams } from "@tanstack/react-router";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useLiveQuery } from "dexie-react-hooks";
import {
  eraseStrokePoints,
  recognizeShape,
  type RecognizedShape,
} from "@treetask/domain";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  BringToFront,
  Copy,
  Download,
  Eraser,
  FileText,
  Group as GroupIcon,
  Hand,
  Image as ImageIcon,
  GitBranchPlus,
  LayoutTemplate,
  LockKeyhole,
  MousePointer2,
  PencilLine,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  SendToBack,
  Share2,
  SquareDashedMousePointer,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type ChangeEvent, type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Arrow,
  Ellipse,
  Group,
  Image as KonvaImage,
  Layer,
  Line,
  Path,
  Rect,
  Stage,
  Text,
} from "react-konva";
import { strokeToSvgPath, type Point } from "../canvas/stroke";
import { canvasDocumentName, shouldPublishLocalCanvasSnapshot } from "../canvas/document-name";
import { db, saveCanvasOffline } from "../data/db";
import { supabase } from "../lib/supabase";
import { useUiStore, type CanvasTool } from "../store/ui";
import * as Y from "yjs";

type ItemType = "sticky" | "rectangle" | "ellipse" | "text" | "photo" | "task" | "subproject" | "file";

interface BoardItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  text: string;
  groupId?: string;
  imageSrc?: string;
  locked?: boolean;
  linkedEntityId?: string;
  linkedEntityType?: "task" | "project" | "file";
  parentId?: string;
  note?: string;
  fontSize?: number;
  textColor?: string;
  borderColor?: string;
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface StrokeItem {
  id: string;
  points: Point[];
  color: string;
  width?: number;
  hardness?: number;
  usePressure?: boolean;
  simulatePressure?: boolean;
  perfected?: RecognizedShape;
  originalPoints?: Point[];
}

interface BoardSnapshot {
  version?: 2;
  items: BoardItem[];
  strokes: StrokeItem[];
  updatedAt?: string;
}

type MindMapTemplateId = "project" | "steps" | "ideas" | "blank";

interface MindMapTemplate {
  id: MindMapTemplateId;
  title: string;
  description: string;
  accent: string;
}

interface RemoteCursor {
  clientId: number;
  x: number;
  y: number;
  name: string;
  color: string;
}

const INITIAL_ITEMS: readonly BoardItem[] = [
  { id: "center", type: "sticky", x: 460, y: 250, width: 170, height: 150, fill: "#ffeba0", text: "WayYaam" },
  { id: "client", type: "sticky", x: 180, y: 130, width: 170, height: 120, fill: "#bce9f0", text: "Приложение\nклиента", parentId: "center" },
  { id: "driver", type: "sticky", x: 760, y: 130, width: 180, height: 120, fill: "#c6edb5", text: "Приложение\nводителя", parentId: "center" },
  { id: "marketing", type: "sticky", x: 390, y: 520, width: 170, height: 120, fill: "#f5b4cf", text: "Маркетинг", parentId: "center" },
  { id: "infra", type: "sticky", x: 650, y: 500, width: 185, height: 125, fill: "#ffe69a", text: "Инфраструктура", parentId: "center" },
  { id: "restaurants", type: "sticky", x: 900, y: 360, width: 165, height: 105, fill: "#dfc3f5", text: "Рестораны", parentId: "center" },
  { id: "brief", type: "photo", x: 190, y: 410, width: 175, height: 230, fill: "#ffffff", text: "📄\nКарта экранов", parentId: "client" },
  { id: "team", type: "photo", x: 190, y: 720, width: 240, height: 160, fill: "#dde9f6", text: "👩🏻‍💻\nКоманда продукта", parentId: "brief" },
  { id: "building", type: "photo", x: 650, y: 710, width: 260, height: 170, fill: "#d7e9f3", text: "🏗️\nСтроительство", parentId: "infra" },
];

const MIND_MAP_TEMPLATES: readonly MindMapTemplate[] = [
  { id: "project", title: "Карта проекта", description: "Цель, этапы, задачи, результат и риски", accent: "#007aff" },
  { id: "steps", title: "План по этапам", description: "Сейчас, дальше, риски и готовые шаги", accent: "#34c759" },
  { id: "ideas", title: "Разбор идеи", description: "Пользователь, проблема, решение и вопросы", accent: "#af52de" },
  { id: "blank", title: "Чистая карта", description: "Одна центральная тема без лишнего", accent: "#8e8e93" },
];

const LEGACY_PARENT_IDS: Readonly<Record<string, string>> = {
  client: "center",
  driver: "center",
  marketing: "center",
  infra: "center",
  restaurants: "center",
  brief: "client",
  team: "brief",
  building: "infra",
};

const TOOLBAR: readonly { tool: CanvasTool; label: string; icon: typeof MousePointer2 }[] = [
  { tool: "select", label: "Выбор", icon: MousePointer2 },
  { tool: "lasso", label: "Лассо", icon: SquareDashedMousePointer },
  { tool: "hand", label: "Перемещение", icon: Hand },
  { tool: "text", label: "Текст", icon: Type },
  { tool: "sticky", label: "Стикер", icon: StickyNote },
  { tool: "pen", label: "Рисование", icon: Pencil },
  { tool: "eraser", label: "Ластик", icon: Eraser },
];

const BRUSH_COLORS = ["#17191f", "#4d4fea", "#e22f2f", "#2563eb", "#16a34a", "#f59e0b"] as const;

const clampScale = (value: number): number => Math.min(8, Math.max(0.05, value));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function intersects(item: BoardItem, rect: SelectionRect): boolean {
  return (
    item.x < rect.x + rect.width &&
    item.x + item.width > rect.x &&
    item.y < rect.y + rect.height &&
    item.y + item.height > rect.y
  );
}

function strokeBounds(stroke: StrokeItem): SelectionRect {
  const points = stroke.perfected?.points.length
    ? stroke.perfected.points
    : stroke.originalPoints ?? stroke.points;
  if (stroke.perfected && points.length === 0) return stroke.perfected.bounds;
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const padding = Math.max(4, (stroke.width ?? 5) / 2);
  const x = Math.min(...xs) - padding;
  const y = Math.min(...ys) - padding;
  return {
    x,
    y,
    width: Math.max(...xs) - x + padding,
    height: Math.max(...ys) - y + padding,
  };
}

function intersectsStroke(stroke: StrokeItem, rect: SelectionRect): boolean {
  const bounds = strokeBounds(stroke);
  return bounds.x < rect.x + rect.width
    && bounds.x + bounds.width > rect.x
    && bounds.y < rect.y + rect.height
    && bounds.y + bounds.height > rect.y;
}

function translateStroke(stroke: StrokeItem, x: number, y: number): StrokeItem {
  const translatePoints = (points: readonly Point[] | undefined) => points?.map(
    (point) => [point[0] + x, point[1] + y, point[2]] as Point,
  );
  const perfected = stroke.perfected ? {
    ...stroke.perfected,
    points: stroke.perfected.points.map((point) => [point[0] + x, point[1] + y] as const),
    bounds: {
      ...stroke.perfected.bounds,
      x: stroke.perfected.bounds.x + x,
      y: stroke.perfected.bounds.y + y,
    },
  } : undefined;
  return {
    ...stroke,
    points: translatePoints(stroke.points) ?? [],
    originalPoints: translatePoints(stroke.originalPoints),
    perfected,
  };
}

function parseBoardSnapshot(value: string | undefined): BoardSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BoardSnapshot>;
    return Array.isArray(parsed.items) && Array.isArray(parsed.strokes)
      ? {
          version: 2,
          items: (parsed.items as BoardItem[]).map((item) => parsed.version === 2 || item.parentId || !LEGACY_PARENT_IDS[item.id]
            ? item
            : { ...item, parentId: LEGACY_PARENT_IDS[item.id] }),
          strokes: parsed.strokes,
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
        }
      : null;
  } catch {
    return null;
  }
}

function itemCenter(item: BoardItem): [number, number] {
  return [item.x + item.width / 2, item.y + item.height / 2];
}

function isItemDescendant(items: readonly BoardItem[], candidateId: string, ancestorId: string): boolean {
  let current = items.find((item) => item.id === candidateId);
  const visited = new Set<string>();
  while (current?.parentId && !visited.has(current.parentId)) {
    if (current.parentId === ancestorId) return true;
    visited.add(current.parentId);
    current = items.find((item) => item.id === current?.parentId);
  }
  return false;
}

function createTemplateItems(templateId: MindMapTemplateId, projectTitle: string): BoardItem[] {
  const centerId: string = crypto.randomUUID();
  const center: BoardItem = {
    id: centerId,
    type: "rectangle",
    x: 470,
    y: 315,
    width: 220,
    height: 94,
    fill: "#007aff",
    text: projectTitle || "Главная тема",
    textColor: "#ffffff",
    fontSize: 22,
    borderColor: "#007aff",
  };
  if (templateId === "blank") return [center];

  const makeBranch = (
    text: string,
    x: number,
    y: number,
    fill: string,
    parentId: string = centerId,
    note?: string,
  ): BoardItem => ({
    id: crypto.randomUUID(),
    type: "rectangle",
    x,
    y,
    width: 205,
    height: 78,
    fill,
    text,
    parentId,
    note,
    fontSize: 17,
    textColor: "#1d1d1f",
    borderColor: "rgba(0, 0, 0, 0.06)",
  });

  if (templateId === "project") {
    return [
      center,
      makeBranch("Цель", 110, 90, "#dff1ff", centerId, "Какой измеримый результат должен дать проект?"),
      makeBranch("Пользователи", 110, 315, "#e8e5ff"),
      makeBranch("Риски", 110, 540, "#ffe9e7"),
      makeBranch("Текущий этап", 830, 80, "#e5f7ea"),
      makeBranch("Следующие шаги", 830, 275, "#fff0c7"),
      makeBranch("Результаты", 830, 500, "#f4e6ff"),
    ];
  }

  if (templateId === "steps") {
    const now = makeBranch("Сейчас", 115, 170, "#dff1ff");
    const next = makeBranch("Дальше", 830, 170, "#e5f7ea");
    const risks = makeBranch("Риски", 115, 500, "#ffe9e7");
    const done = makeBranch("Готово", 830, 500, "#f0ebff");
    return [
      center,
      now,
      makeBranch("Первый шаг", 80, 290, "#f5f9ff", now.id),
      next,
      makeBranch("Следующий шаг", 865, 290, "#f5fff7", next.id),
      risks,
      done,
    ];
  }

  const problem = makeBranch("Проблема", 105, 115, "#ffe9e7");
  const solution = makeBranch("Решение", 835, 115, "#e5f7ea");
  const people = makeBranch("Для кого", 105, 500, "#e8e5ff");
  const questions = makeBranch("Вопросы", 835, 500, "#fff0c7");
  return [
    { ...center, fill: "#af52de", borderColor: "#af52de" },
    problem,
    makeBranch("Что болит?", 75, 235, "#fff7f6", problem.id),
    solution,
    makeBranch("Как проверим?", 865, 235, "#f5fff7", solution.id),
    people,
    questions,
  ];
}

function CanvasImage({ src, width, height }: { src: string; width: number; height: number }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    const next = new window.Image();
    next.onload = () => setImage(next);
    next.src = src;
    return () => {
      next.onload = null;
    };
  }, [src]);
  return image ? <KonvaImage image={image} width={width} height={height} cornerRadius={12} /> : null;
}

async function encodeCanvasImage(file: File): Promise<{ src: string; width: number; height: number }> {
  if (!file.type.startsWith("image/")) throw new Error("Выберите изображение");
  if (file.size > 15 * 1024 * 1024) throw new Error("Изображение больше 15 МБ");
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не удалось прочитать изображение"));
      image.src = objectUrl;
    });
    const scale = Math.min(1, 1000 / Math.max(source.naturalWidth, source.naturalHeight));
    const pixelWidth = Math.max(1, Math.round(source.naturalWidth * scale));
    const pixelHeight = Math.max(1, Math.round(source.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas недоступен");
    context.drawImage(source, 0, 0, pixelWidth, pixelHeight);
    const displayScale = Math.min(1, 320 / pixelWidth, 240 / pixelHeight);
    return {
      src: canvas.toDataURL("image/webp", 0.78),
      width: Math.max(120, Math.round(pixelWidth * displayScale)),
      height: Math.max(90, Math.round(pixelHeight * displayScale)),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CanvasPage() {
  const { projectId } = useParams({ from: "/project/$projectId/canvas" });
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const objectMenuRef = useRef<HTMLDivElement>(null);
  const brushPanelRef = useRef<HTMLElement>(null);
  const eraserPanelRef = useRef<HTMLElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const lastPointerCenter = useRef<{ x: number; y: number } | null>(null);
  const lastPointerDistance = useRef<number | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const drawingRef = useRef(false);
  const erasingRef = useRef(false);
  const eraserChangedRef = useRef(false);
  const holdTimerRef = useRef<number | null>(null);
  const lassoStartRef = useRef<{ x: number; y: number } | null>(null);
  const lassoRectRef = useRef<SelectionRect | null>(null);
  const hadLocalSnapshotOnLoadRef = useRef(false);
  const strokesRef = useRef<StrokeItem[]>([]);
  const providerRef = useRef<HocuspocusProvider | null>(null);
  const sharedStateRef = useRef<Y.Map<string> | null>(null);
  const [size, setSize] = useState({ width: 1200, height: 760 });
  const [items, setItems] = useState<BoardItem[]>([...INITIAL_ITEMS]);
  const [strokes, setStrokes] = useState<StrokeItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const [lassoRect, setLassoRect] = useState<SelectionRect | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 0.78 });
  const [history, setHistory] = useState<BoardSnapshot[]>([{ items: [...INITIAL_ITEMS], strokes: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [boardUpdatedAt, setBoardUpdatedAt] = useState(() => new Date().toISOString());
  const [hydrated, setHydrated] = useState(false);
  const [syncLabel, setSyncLabel] = useState("Локальное сохранение");
  const [canvasNotice, setCanvasNotice] = useState<string | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);
  const [brushWidth, setBrushWidth] = useState(8);
  const [brushHardness, setBrushHardness] = useState(70);
  const [brushColor, setBrushColor] = useState<string>("#4d4fea");
  const [brushPressure, setBrushPressure] = useState(true);
  const [eraserSize, setEraserSize] = useState(28);
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null);
  const [objectMenuOpen, setObjectMenuOpen] = useState(false);
  const [brushPanelOpen, setBrushPanelOpen] = useState(false);
  const [eraserPanelOpen, setEraserPanelOpen] = useState(false);
  const [cardPicker, setCardPicker] = useState<"task" | "subproject" | "file" | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<MindMapTemplateId>("project");
  const [itemDraft, setItemDraft] = useState<BoardItem | null>(null);
  const tool = useUiStore((state) => state.canvasTool);
  const setTool = useUiStore((state) => state.setCanvasTool);
  const projectTasks = useLiveQuery(
    () => db.tasks.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const projectFiles = useLiveQuery(
    () => db.projectFiles.where("projectId").equals(projectId).toArray(),
    [projectId],
    [],
  );
  const currentProject = projects.find((project) => project.id === projectId);

  useEffect(() => {
    if (!objectMenuOpen && !brushPanelOpen && !eraserPanelOpen && !cardPicker) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        toolbarRef.current?.contains(target)
        || objectMenuRef.current?.contains(target)
        || brushPanelRef.current?.contains(target)
        || eraserPanelRef.current?.contains(target)
      ) return;
      setObjectMenuOpen(false);
      setBrushPanelOpen(false);
      setEraserPanelOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setObjectMenuOpen(false);
      setBrushPanelOpen(false);
      setEraserPanelOpen(false);
      setCardPicker(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [brushPanelOpen, cardPicker, eraserPanelOpen, objectMenuOpen]);

  const chooseTool = (nextTool: CanvasTool) => {
    setObjectMenuOpen(false);
    setBrushPanelOpen(nextTool === "pen" ? tool !== "pen" || !brushPanelOpen : false);
    setEraserPanelOpen(nextTool === "eraser" ? tool !== "eraser" || !eraserPanelOpen : false);
    setTool(nextTool);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
  }, []);

  useEffect(() => {
    if (!canvasNotice) return;
    const timer = window.setTimeout(() => setCanvasNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [canvasNotice]);

  useEffect(() => {
    const animationFrame = requestAnimationFrame(() => stageRef.current?.batchDraw());
    return () => cancelAnimationFrame(animationFrame);
  }, [items, size, strokes, viewport]);

  useEffect(() => {
    let active = true;
    setHydrated(false);
    setSelectedIds([]);
    setSelectedStrokeIds([]);
    setItemDraft(null);
    setTemplateDialogOpen(false);
    hadLocalSnapshotOnLoadRef.current = false;
    void db.canvasSnapshots.get(`canvas:${projectId}`).then((record) => {
      if (!active) return;
      const snapshot = parseBoardSnapshot(record?.payload);
      if (snapshot) {
        hadLocalSnapshotOnLoadRef.current = true;
        setItems(snapshot.items);
        setStrokes(snapshot.strokes);
        setHistory([snapshot]);
        setHistoryIndex(0);
        setBoardUpdatedAt(snapshot.updatedAt ?? record?.updatedAt ?? new Date().toISOString());
      } else {
        setBoardUpdatedAt(new Date().toISOString());
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const serializedBoard = useMemo(
    () => JSON.stringify({ version: 2, items, strokes, updatedAt: boardUpdatedAt } satisfies BoardSnapshot),
    [boardUpdatedAt, items, strokes],
  );
  const serializedBoardRef = useRef(serializedBoard);

  useEffect(() => {
    serializedBoardRef.current = serializedBoard;
  }, [serializedBoard]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveCanvasOffline(projectId, serializedBoard);
      const sharedState = sharedStateRef.current;
      if (sharedState?.get("snapshot") !== serializedBoard) {
        sharedState?.set("snapshot", serializedBoard);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [hydrated, projectId, serializedBoard]);

  useEffect(() => {
    if (!hydrated) return;
    const websocketUrl = import.meta.env.VITE_COLLAB_WS_URL?.trim();
    const client = supabase;
    if (!client || !websocketUrl || !UUID_PATTERN.test(projectId)) {
      setSyncLabel("Сохранено на устройстве");
      return;
    }

    let active = true;
    let provider: HocuspocusProvider | null = null;
    let document: Y.Doc | null = null;
    let sharedState: Y.Map<string> | null = null;
    const connect = async () => {
      const { data } = await client.auth.getSession();
      if (!active) return;
      const token = data.session?.access_token;
      if (!token) {
        setSyncLabel("Войдите для совместной работы");
        return;
      }
      document = new Y.Doc();
      sharedState = document.getMap<string>("canvas");
      sharedStateRef.current = sharedState;
      sharedState.observe((event) => {
        if (event.transaction.local || !active) return;
        const snapshot = parseBoardSnapshot(sharedState?.get("snapshot"));
        if (!snapshot) return;
        const localSnapshot = parseBoardSnapshot(serializedBoardRef.current);
        if (shouldPublishLocalCanvasSnapshot(
          hadLocalSnapshotOnLoadRef.current,
          localSnapshot?.updatedAt,
          snapshot.updatedAt,
        )) return;
        setItems(snapshot.items);
        setStrokes(snapshot.strokes);
        strokesRef.current = snapshot.strokes;
        setHistory([snapshot]);
        setHistoryIndex(0);
        setBoardUpdatedAt(snapshot.updatedAt ?? new Date().toISOString());
      });
      provider = new HocuspocusProvider({
        url: websocketUrl,
        name: canvasDocumentName(projectId),
        document,
        token: () => token,
        flushDelay: 120,
        onStatus: ({ status }) => setSyncLabel(
          status === "connected" ? "Онлайн · синхронизировано" : "Подключение…",
        ),
        onSynced: ({ state }) => {
          if (!state || !sharedState) return;
          const remoteValue = sharedState.get("snapshot");
          const localSnapshot = parseBoardSnapshot(serializedBoardRef.current);
          const remoteSnapshot = parseBoardSnapshot(remoteValue);
          if (
            !remoteValue ||
            shouldPublishLocalCanvasSnapshot(
              hadLocalSnapshotOnLoadRef.current,
              localSnapshot?.updatedAt,
              remoteSnapshot?.updatedAt,
            )
          ) sharedState.set("snapshot", serializedBoardRef.current);
        },
        onAuthenticationFailed: () => setSyncLabel("Нет доступа к Canvas"),
        onAwarenessChange: ({ states }) => {
          if (!active || !document) return;
          setRemoteCursors(states.flatMap((state) => {
            const cursor = state.cursor as { x?: unknown; y?: unknown } | undefined;
            const user = state.user as { name?: unknown; color?: unknown } | undefined;
            if (
              state.clientId === document?.clientID ||
              typeof cursor?.x !== "number" ||
              typeof cursor.y !== "number"
            ) return [];
            return [{
              clientId: state.clientId,
              x: cursor.x,
              y: cursor.y,
              name: typeof user?.name === "string" ? user.name : "Участник",
              color: typeof user?.color === "string" ? user.color : "#5758eb",
            }];
          }));
        },
      });
      provider.awareness?.setLocalStateField("user", {
        name: "Магомед",
        color: "#5758eb",
      });
      providerRef.current = provider;
    };
    void connect();

    return () => {
      active = false;
      provider?.destroy();
      document?.destroy();
      providerRef.current = null;
      sharedStateRef.current = null;
      setRemoteCursors([]);
    };
  }, [hydrated, projectId]);

  const persistBoardSnapshot = useCallback((snapshot: BoardSnapshot) => {
    const payload = JSON.stringify(snapshot);
    void saveCanvasOffline(projectId, payload).then(() => {
      if (!providerRef.current) setSyncLabel("Сохранено на устройстве");
    });
    const sharedState = sharedStateRef.current;
    if (sharedState?.get("snapshot") !== payload) sharedState?.set("snapshot", payload);
  }, [projectId]);

  const pushHistory = useCallback((snapshot: BoardSnapshot) => {
    setHistory((current) => [...current.slice(0, historyIndex + 1), snapshot]);
    setHistoryIndex((current) => current + 1);
  }, [historyIndex]);

  const commitBoard = useCallback((nextItems: BoardItem[], nextStrokes: StrokeItem[]) => {
    const updatedAt = new Date().toISOString();
    const snapshot = { version: 2, items: nextItems, strokes: nextStrokes, updatedAt } satisfies BoardSnapshot;
    persistBoardSnapshot(snapshot);
    setItems(nextItems);
    setStrokes(nextStrokes);
    strokesRef.current = nextStrokes;
    setBoardUpdatedAt(updatedAt);
    pushHistory(snapshot);
  }, [persistBoardSnapshot, pushHistory]);

  const commitItems = useCallback((next: BoardItem[]) => {
    commitBoard(next, strokesRef.current);
  }, [commitBoard]);

  const commitStrokes = useCallback((next: StrokeItem[]) => {
    commitBoard(items, next);
  }, [commitBoard, items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );
  const selectedStrokes = useMemo(
    () => strokes.filter((stroke) => selectedStrokeIds.includes(stroke.id)),
    [selectedStrokeIds, strokes],
  );
  const selectedCount = selectedIds.length + selectedStrokeIds.length;

  const openItemEditor = (item: BoardItem) => {
    setObjectMenuOpen(false);
    setBrushPanelOpen(false);
    setEraserPanelOpen(false);
    setItemDraft({ ...item });
  };

  const createTopic = (parent: BoardItem | undefined, siblingOf?: BoardItem) => {
    const parentId = siblingOf ? siblingOf.parentId : parent?.id;
    const siblings = items.filter((item) => item.parentId === parentId);
    const index = siblings.length;
    const origin = siblingOf ?? parent;
    const center = viewportCenter();
    const rootChild = Boolean(parent && !parent.parentId && !siblingOf);
    const direction = rootChild && index % 2 === 0 ? -1 : 1;
    const column = rootChild
      ? (direction < 0 ? parent!.x - 350 : parent!.x + parent!.width + 150)
      : (origin?.x ?? center.x) + (siblingOf ? 0 : 310);
    const row = siblingOf
      ? siblingOf.y + 110
      : rootChild
        ? parent!.y - 170 + Math.floor(index / 2) * 120
        : (origin?.y ?? center.y) + index * 96;
    const next: BoardItem = {
      id: crypto.randomUUID(),
      type: "rectangle",
      x: column,
      y: row,
      width: 200,
      height: 76,
      fill: "#f5f8ff",
      text: "Новая тема",
      textColor: "#1d1d1f",
      fontSize: 17,
      borderColor: "#d9e2f0",
      parentId,
    };
    commitItems([...items, next]);
    setSelectedIds([next.id]);
    setSelectedStrokeIds([]);
    setTool("select");
    setItemDraft({ ...next });
    setCanvasNotice(parentId ? "Ветка добавлена" : "Тема добавлена");
  };

  const addChildTopic = () => {
    const parent = selectedItems.length === 1 ? selectedItems[0] : undefined;
    if (!parent) return;
    createTopic(parent);
  };

  const addSiblingTopic = () => {
    const sibling = selectedItems.length === 1 ? selectedItems[0] : undefined;
    if (!sibling) return;
    createTopic(undefined, sibling);
  };

  const saveItemDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!itemDraft) return;
    const next = {
      ...itemDraft,
      text: itemDraft.text.trim() || "Без названия",
      note: itemDraft.note?.trim() || undefined,
      parentId: itemDraft.parentId || undefined,
    };
    commitItems(items.map((item) => item.id === next.id ? next : item));
    setSelectedIds([next.id]);
    setSelectedStrokeIds([]);
    setItemDraft(null);
    setCanvasNotice("Тема сохранена");
  };

  const applyMindMapTemplate = () => {
    const template = MIND_MAP_TEMPLATES.find((item) => item.id === selectedTemplateId);
    const nextItems = createTemplateItems(selectedTemplateId, currentProject?.title ?? "Главная тема");
    commitBoard(nextItems, []);
    setSelectedIds(nextItems[0] ? [nextItems[0].id] : []);
    setSelectedStrokeIds([]);
    setViewport({ x: 0, y: 0, scale: 0.78 });
    setTemplateDialogOpen(false);
    setCanvasNotice(`Шаблон «${template?.title ?? "Карта"}» применён`);
  };

  const selectItem = (item: BoardItem, extendSelection: boolean) => {
    if (tool !== "select") return;
    const relatedIds = item.groupId
      ? items.filter((candidate) => candidate.groupId === item.groupId).map((candidate) => candidate.id)
      : [item.id];
    setSelectedIds((current) => {
      if (!extendSelection) return relatedIds;
      const allSelected = relatedIds.every((id) => current.includes(id));
      return allSelected
        ? current.filter((id) => !relatedIds.includes(id))
        : [...new Set([...current, ...relatedIds])];
    });
    if (!extendSelection) setSelectedStrokeIds([]);
  };

  const selectStroke = (stroke: StrokeItem, extendSelection: boolean) => {
    if (tool !== "select") return;
    setSelectedStrokeIds((current) => {
      if (!extendSelection) return [stroke.id];
      return current.includes(stroke.id)
        ? current.filter((id) => id !== stroke.id)
        : [...current, stroke.id];
    });
    if (!extendSelection) setSelectedIds([]);
  };

  const duplicateSelection = () => {
    if (selectedCount === 0) return;
    const copiedItemIds = new Map(selectedItems.map((item) => [item.id, crypto.randomUUID()]));
    const itemCopies = selectedItems.map((item) => {
      const copiedId = copiedItemIds.get(item.id) as string;
      return {
        ...item,
        id: copiedId,
        x: item.x + 24,
        y: item.y + 24,
        groupId: undefined,
        parentId: item.parentId ? copiedItemIds.get(item.parentId) ?? item.parentId : undefined,
      };
    });
    const strokeCopies = selectedStrokes.map((stroke) => ({
      ...translateStroke(stroke, 24, 24),
      id: crypto.randomUUID(),
    }));
    commitBoard([...items, ...itemCopies], [...strokes, ...strokeCopies]);
    setSelectedIds(itemCopies.map((item) => item.id));
    setSelectedStrokeIds(strokeCopies.map((stroke) => stroke.id));
    setCanvasNotice(`Скопировано: ${itemCopies.length + strokeCopies.length}`);
  };

  const groupSelection = () => {
    if (selectedIds.length < 2) return;
    const groupId = crypto.randomUUID();
    commitItems(items.map((item) => selectedIds.includes(item.id) ? { ...item, groupId } : item));
    setCanvasNotice(`Сгруппировано: ${selectedIds.length}`);
  };

  const ungroupSelection = () => {
    if (!selectedItems.some((item) => item.groupId)) return;
    commitItems(items.map((item) => selectedIds.includes(item.id) ? { ...item, groupId: undefined } : item));
    setCanvasNotice("Группа разобрана");
  };

  const toggleSelectionLock = () => {
    if (selectedIds.length === 0) return;
    const shouldLock = !selectedItems.every((item) => item.locked);
    commitItems(items.map((item) => selectedIds.includes(item.id) ? { ...item, locked: shouldLock } : item));
    setCanvasNotice(shouldLock ? "Объекты заблокированы" : "Объекты разблокированы");
  };

  const bringSelectionToFront = () => {
    if (selectedIds.length === 0) return;
    commitItems([
      ...items.filter((item) => !selectedIds.includes(item.id)),
      ...items.filter((item) => selectedIds.includes(item.id)),
    ]);
    setCanvasNotice("Перенесено на передний план");
  };

  const sendSelectionToBack = () => {
    if (selectedIds.length === 0) return;
    commitItems([
      ...items.filter((item) => selectedIds.includes(item.id)),
      ...items.filter((item) => !selectedIds.includes(item.id)),
    ]);
    setCanvasNotice("Перенесено на задний план");
  };

  const alignSelection = (axis: "horizontal" | "vertical") => {
    if (selectedItems.length < 2) return;
    const target = selectedItems.reduce(
      (sum, item) => sum + (axis === "horizontal" ? item.x + item.width / 2 : item.y + item.height / 2),
      0,
    ) / selectedItems.length;
    commitItems(items.map((item) => {
      if (!selectedIds.includes(item.id) || item.locked) return item;
      return axis === "horizontal"
        ? { ...item, x: target - item.width / 2 }
        : { ...item, y: target - item.height / 2 };
    }));
    setCanvasNotice(axis === "horizontal" ? "Выровнено по вертикальной оси" : "Выровнено по горизонтальной оси");
  };

  const deleteSelection = () => {
    if (selectedCount === 0) return;
    const selectedItemIds = new Set(selectedIds);
    let expanded = true;
    while (expanded) {
      expanded = false;
      items.forEach((item) => {
        if (item.parentId && selectedItemIds.has(item.parentId) && !selectedItemIds.has(item.id)) {
          selectedItemIds.add(item.id);
          expanded = true;
        }
      });
    }
    const deletedItemIds = new Set(
      items.filter((item) => selectedItemIds.has(item.id) && !item.locked).map((item) => item.id),
    );
    commitBoard(
      items
        .filter((item) => !deletedItemIds.has(item.id))
        .map((item) => item.parentId && deletedItemIds.has(item.parentId) ? { ...item, parentId: undefined } : item),
      strokes.filter((stroke) => !selectedStrokeIds.includes(stroke.id)),
    );
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id && item.locked)));
    setSelectedStrokeIds([]);
    setCanvasNotice("Выбранные незаблокированные объекты удалены");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, button, a, [contenteditable='true']")) return;
      if ((event.key === "Delete" || event.key === "Backspace") && selectedCount > 0) {
        event.preventDefault();
        deleteSelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("en") === "d" && selectedCount > 0) {
        event.preventDefault();
        duplicateSelection();
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && selectedItems.length === 1) {
        if (event.key === "Tab") {
          event.preventDefault();
          addChildTopic();
        } else if (event.key === "Enter") {
          event.preventDefault();
          addSiblingTopic();
        } else if (event.key === " ") {
          event.preventDefault();
          const item = selectedItems[0];
          if (item) openItemEditor(item);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const undo = () => {
    let correctedIndex = -1;
    for (let index = strokes.length - 1; index >= 0; index -= 1) {
      if (strokes[index]?.perfected) {
        correctedIndex = index;
        break;
      }
    }
    if (correctedIndex >= 0) {
      const nextStrokes = strokes.map((stroke, index) => index === correctedIndex
        ? {
            ...stroke,
            points: stroke.originalPoints ?? stroke.points,
            perfected: undefined,
            originalPoints: undefined,
          }
        : stroke);
      strokesRef.current = nextStrokes;
      setStrokes(nextStrokes);
      const updatedAt = new Date().toISOString();
      setBoardUpdatedAt(updatedAt);
      persistBoardSnapshot({ items, strokes: nextStrokes, updatedAt });
      setCanvasNotice("Исходный штрих восстановлен");
      return;
    }
    if (historyIndex === 0) return;
    const nextIndex = historyIndex - 1;
    const snapshot = history[nextIndex] ?? { items: [], strokes: [] };
    setHistoryIndex(nextIndex);
    setItems(snapshot.items);
    setStrokes(snapshot.strokes);
    strokesRef.current = snapshot.strokes;
    setSelectedIds([]);
    setSelectedStrokeIds([]);
    const updatedAt = new Date().toISOString();
    setBoardUpdatedAt(updatedAt);
    persistBoardSnapshot({ ...snapshot, updatedAt });
    setCanvasNotice("Действие отменено");
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const snapshot = history[nextIndex] ?? { items: [], strokes: [] };
    setHistoryIndex(nextIndex);
    setItems(snapshot.items);
    setStrokes(snapshot.strokes);
    strokesRef.current = snapshot.strokes;
    setSelectedIds([]);
    setSelectedStrokeIds([]);
    const updatedAt = new Date().toISOString();
    setBoardUpdatedAt(updatedAt);
    persistBoardSnapshot({ ...snapshot, updatedAt });
    setCanvasNotice("Действие повторено");
  };

  const resetBoard = () => {
    const updatedAt = new Date().toISOString();
    const snapshot = { version: 2, items: [...INITIAL_ITEMS], strokes: [], updatedAt } satisfies BoardSnapshot;
    setItems(snapshot.items);
    setStrokes(snapshot.strokes);
    strokesRef.current = snapshot.strokes;
    setHistory([snapshot]);
    setHistoryIndex(0);
    setBoardUpdatedAt(updatedAt);
    setSelectedIds([]);
    setSelectedStrokeIds([]);
    setViewport({ x: 0, y: 0, scale: 0.78 });
    persistBoardSnapshot(snapshot);
    setCanvasNotice("Доска сброшена");
  };

  const zoomAtCenter = (factor: number) => {
    const nextScale = clampScale(viewport.scale * factor);
    const center = { x: size.width / 2, y: size.height / 2 };
    const point = {
      x: (center.x - viewport.x) / viewport.scale,
      y: (center.y - viewport.y) / viewport.scale,
    };
    setViewport({
      scale: nextScale,
      x: center.x - point.x * nextScale,
      y: center.y - point.y * nextScale,
    });
  };

  const handleWheel = (event: KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault();
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!pointer) return;
    const direction = event.evt.deltaY > 0 ? 0.92 : 1.08;
    const nextScale = clampScale(viewport.scale * direction);
    const point = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    setViewport({ scale: nextScale, x: pointer.x - point.x * nextScale, y: pointer.y - point.y * nextScale });
  };

  const updateActivePointer = (event: PointerEvent) => {
    const container = stageRef.current?.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    activePointersRef.current.set(event.pointerId, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  };

  const handlePinch = (event: KonvaEventObject<PointerEvent>) => {
    const stage = stageRef.current;
    const pointers = [...activePointersRef.current.values()];
    if (!stage || pointers.length !== 2) return;
    event.evt.preventDefault();
    stage.stopDrag();
    const [first, second] = pointers;
    if (!first || !second) return;
    const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    if (!lastPointerDistance.current || !lastPointerCenter.current) {
      lastPointerDistance.current = distance;
      lastPointerCenter.current = center;
      return;
    }
    const point = {
      x: (center.x - viewport.x) / viewport.scale,
      y: (center.y - viewport.y) / viewport.scale,
    };
    const nextScale = clampScale(viewport.scale * (distance / lastPointerDistance.current));
    setViewport({
      scale: nextScale,
      x: center.x - point.x * nextScale + (center.x - lastPointerCenter.current.x),
      y: center.y - point.y * nextScale + (center.y - lastPointerCenter.current.y),
    });
    lastPointerDistance.current = distance;
    lastPointerCenter.current = center;
  };

  const resetPinch = () => {
    lastPointerCenter.current = null;
    lastPointerDistance.current = null;
  };

  const scheduleShapeRecognition = () => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = window.setTimeout(() => {
      if (!drawingRef.current) return;
      const lastStroke = strokesRef.current.at(-1);
      if (!lastStroke || lastStroke.perfected) return;
      const recognized = recognizeShape(
        lastStroke.points.map((point) => [point[0], point[1]] as const),
      );
      if (!recognized || recognized.confidence < 0.82) return;
      setStrokes((current) => {
        const next = current.map((stroke) => stroke.id === lastStroke.id
          ? { ...stroke, perfected: recognized, originalPoints: stroke.points }
          : stroke);
        strokesRef.current = next;
        return next;
      });
      setCanvasNotice(`Исправлено: ${recognized.kind} · Undo вернёт штрих`);
    }, 1100);
  };

  const boardPointer = (): { x: number; y: number } | null => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return null;
    return { x: (pointer.x - viewport.x) / viewport.scale, y: (pointer.y - viewport.y) / viewport.scale };
  };

  const eventPressure = (event: PointerEvent) => {
    if (!brushPressure || event.pointerType === "mouse") return 0.5;
    return event.pressure > 0 ? Math.min(1, Math.max(0.05, event.pressure)) : 0.5;
  };

  const eraseAt = (pointer: { x: number; y: number }) => {
    let changed = false;
    const next = strokesRef.current.flatMap((stroke) => {
      const basePoints = stroke.originalPoints ?? stroke.points;
      const chunks = eraseStrokePoints(basePoints, pointer, eraserSize / 2);
      if (chunks.length === 1 && chunks[0]?.length === basePoints.length) return [stroke];
      changed = true;
      return chunks.map((points, index) => ({
        ...stroke,
        id: index === 0 ? stroke.id : crypto.randomUUID(),
        points: points as Point[],
        perfected: undefined,
        originalPoints: undefined,
      }));
    });
    if (!changed) return;
    eraserChangedRef.current = true;
    strokesRef.current = next;
    setStrokes(next);
    setSelectedStrokeIds((current) => current.filter((id) => next.some((stroke) => stroke.id === id)));
  };

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    const clickedStage = event.target === event.target.getStage();
    if (!clickedStage) return;
    if (event.evt.pointerType === "mouse" && (event.evt.button !== 0 || event.evt.buttons !== 1)) return;
    const pointer = boardPointer();
    if (!pointer) return;
    if (tool === "select") {
      setSelectedIds([]);
      setSelectedStrokeIds([]);
      return;
    }
    if (tool === "lasso") {
      setSelectedIds([]);
      setSelectedStrokeIds([]);
      const rect = { x: pointer.x, y: pointer.y, width: 0, height: 0 };
      lassoStartRef.current = pointer;
      lassoRectRef.current = rect;
      setLassoRect(rect);
      return;
    }
    if (tool === "eraser") {
      erasingRef.current = true;
      eraserChangedRef.current = false;
      setEraserCursor(pointer);
      eraseAt(pointer);
      return;
    }
    if (tool === "pen") {
      setSelectedIds([]);
      setSelectedStrokeIds([]);
      drawingRef.current = true;
      setStrokes((current) => {
        const next = [...current, {
          id: crypto.randomUUID(),
          points: [[pointer.x, pointer.y, eventPressure(event.evt)]] as Point[],
          color: brushColor,
          width: brushWidth,
          hardness: brushHardness,
          usePressure: brushPressure,
          simulatePressure: brushPressure && event.evt.pointerType !== "pen",
        }];
        strokesRef.current = next;
        return next;
      });
      scheduleShapeRecognition();
      return;
    }
    if (["sticky", "text"].includes(tool)) {
      const next: BoardItem = {
        id: crypto.randomUUID(),
        type: tool as ItemType,
        x: pointer.x,
        y: pointer.y,
        width: tool === "text" ? 220 : 170,
        height: tool === "text" ? 54 : 120,
        fill: tool === "sticky" ? "#fff0a8" : tool === "text" ? "transparent" : "#dce2ff",
        text: tool === "text" ? "Новый текст" : tool === "sticky" ? "Новая заметка" : "",
      };
      commitItems([...items, next]);
      setSelectedIds([next.id]);
      setTool("select");
      setItemDraft({ ...next });
    }
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>) => {
    const pointer = boardPointer();
    if (!pointer) return;
    providerRef.current?.awareness?.setLocalStateField("cursor", pointer);
    if (tool === "eraser") {
      setEraserCursor(pointer);
      if (erasingRef.current) eraseAt(pointer);
      return;
    }
    if (tool === "lasso" && lassoStartRef.current) {
      if (event.evt.pointerType === "mouse" && event.evt.buttons !== 1) return;
      const start = lassoStartRef.current;
      const rect = {
        x: Math.min(start.x, pointer.x),
        y: Math.min(start.y, pointer.y),
        width: Math.abs(pointer.x - start.x),
        height: Math.abs(pointer.y - start.y),
      };
      lassoRectRef.current = rect;
      setLassoRect(rect);
      return;
    }
    if (event.evt.pointerType === "mouse" && event.evt.buttons !== 1) {
      drawingRef.current = false;
      erasingRef.current = false;
      return;
    }
    const currentStroke = strokesRef.current.at(-1);
    if (tool !== "pen" || !drawingRef.current || !currentStroke) return;
    const lastPoint = currentStroke.points.at(-1);
    if (lastPoint && Math.hypot(pointer.x - lastPoint[0], pointer.y - lastPoint[1]) < 0.8) return;
    setStrokes((current) => {
      const next = current.map((stroke, index) => {
        if (index !== current.length - 1) return stroke;
        const basePoints = stroke.perfected
          ? (stroke.originalPoints ?? stroke.points)
          : stroke.points;
        return {
          ...stroke,
          points: [...basePoints, [pointer.x, pointer.y, eventPressure(event.evt)]] as Point[],
          perfected: undefined,
          originalPoints: undefined,
        };
      });
      strokesRef.current = next;
      return next;
    });
    scheduleShapeRecognition();
  };

  const beginPointer = (event: KonvaEventObject<PointerEvent>) => {
    updateActivePointer(event.evt);
    try {
      (event.evt.currentTarget as Element | null)?.setPointerCapture?.(event.evt.pointerId);
    } catch {
      // Pointer capture is optional (older Safari/iOS may reject it).
    }
    if (activePointersRef.current.size > 1) {
      drawingRef.current = false;
      erasingRef.current = false;
      lassoStartRef.current = null;
      lassoRectRef.current = null;
      setLassoRect(null);
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
      handlePinch(event);
      return;
    }
    handlePointerDown(event);
  };

  const movePointer = (event: KonvaEventObject<PointerEvent>) => {
    updateActivePointer(event.evt);
    if (activePointersRef.current.size > 1) {
      handlePinch(event);
      return;
    }
    handlePointerMove(event);
  };

  const finishPointer = (event: KonvaEventObject<PointerEvent>) => {
    if (tool === "lasso" && lassoRectRef.current) {
      const directlySelected = items.filter((item) => intersects(item, lassoRectRef.current as SelectionRect));
      const selectedStrokesByLasso = strokes.filter((stroke) => intersectsStroke(stroke, lassoRectRef.current as SelectionRect));
      const selectedGroups = new Set(directlySelected.flatMap((item) => item.groupId ? [item.groupId] : []));
      setSelectedIds(items.filter((item) => (
        directlySelected.some((selected) => selected.id === item.id) ||
        Boolean(item.groupId && selectedGroups.has(item.groupId))
      )).map((item) => item.id));
      setSelectedStrokeIds(selectedStrokesByLasso.map((stroke) => stroke.id));
      setCanvasNotice(`Выбрано лассо: ${directlySelected.length + selectedStrokesByLasso.length}`);
      lassoStartRef.current = null;
      lassoRectRef.current = null;
      setLassoRect(null);
      setTool("select");
    }
    activePointersRef.current.delete(event.evt.pointerId);
    const shouldPersistStroke = tool === "pen" && drawingRef.current;
    const shouldPersistErase = tool === "eraser" && erasingRef.current && eraserChangedRef.current;
    drawingRef.current = false;
    erasingRef.current = false;
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (shouldPersistStroke) commitStrokes(strokesRef.current);
    if (shouldPersistErase) {
      commitStrokes(strokesRef.current);
      setCanvasNotice("Линия стёрта");
    }
    if (activePointersRef.current.size < 2) resetPinch();
  };

  const moveItem = (movedItem: BoardItem, x: number, y: number) => {
    if (movedItem.locked) return;
    const groupIds = movedItem.groupId
      ? items.filter((item) => item.groupId === movedItem.groupId).map((item) => item.id)
      : [movedItem.id];
    const movingIds = selectedIds.includes(movedItem.id) ? selectedIds : groupIds;
    const deltaX = x - movedItem.x;
    const deltaY = y - movedItem.y;
    commitBoard(
      items.map((item) => (
        movingIds.includes(item.id) && !item.locked
          ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
          : item
      )),
      strokes.map((stroke) => selectedStrokeIds.includes(stroke.id)
        ? translateStroke(stroke, deltaX, deltaY)
        : stroke),
    );
  };

  const moveStroke = (movedStroke: StrokeItem, x: number, y: number) => {
    const movingStrokeIds = selectedStrokeIds.includes(movedStroke.id)
      ? selectedStrokeIds
      : [movedStroke.id];
    commitBoard(
      items.map((item) => selectedIds.includes(item.id) && !item.locked
        ? { ...item, x: item.x + x, y: item.y + y }
        : item),
      strokes.map((stroke) => movingStrokeIds.includes(stroke.id)
        ? translateStroke(stroke, x, y)
        : stroke),
    );
  };

  function viewportCenter() {
    return {
      x: (size.width / 2 - viewport.x) / viewport.scale,
      y: (size.height / 2 - viewport.y) / viewport.scale,
    };
  }

  const addCanvasCard = (type: "task" | "subproject" | "file", entityId?: string) => {
    const center = viewportCenter();
    const task = type === "task" ? projectTasks.find((record) => record.id === entityId) : undefined;
    const project = type === "subproject" ? projects.find((record) => record.id === entityId) : undefined;
    const file = type === "file" ? projectFiles.find((record) => record.id === entityId) : undefined;
    if (type === "task" && !task) {
      setCanvasNotice("Выберите существующую задачу");
      return;
    }
    if (type === "subproject" && !project) {
      setCanvasNotice("Выберите существующий подпроект");
      return;
    }
    if (type === "file" && !file) {
      setCanvasNotice("Выберите существующий файл");
      return;
    }
    const preset = type === "task" && task
      ? { fill: "#e8edff", text: `☑ ${task.title}\nВес ${task.weight} · ${task.dueLabel}`, width: 240, height: 118 }
      : type === "subproject" && project
        ? { fill: "#e5f4e8", text: `🌿 ${project.title}\nПрогресс ${project.taskProgress}%`, width: 240, height: 120 }
        : file
          ? { fill: "#ffffff", text: `📎 ${file.name}\n${file.size}`, width: 230, height: 110 }
          : { fill: "#ffffff", text: "📎 Файл недоступен", width: 210, height: 105 };
    const next: BoardItem = {
      id: crypto.randomUUID(),
      type,
      x: center.x - preset.width / 2,
      y: center.y - preset.height / 2,
      width: preset.width,
      height: preset.height,
      fill: preset.fill,
      text: preset.text,
      linkedEntityId: task?.id ?? project?.id ?? file?.id,
      linkedEntityType: task ? "task" : project ? "project" : file ? "file" : undefined,
    };
    commitItems([...items, next]);
    setSelectedIds([next.id]);
    setObjectMenuOpen(false);
    setCardPicker(null);
    setTool("select");
    setCanvasNotice(task || project || file ? "Связанный объект добавлен" : "Объект добавлен и сохранён локально");
  };

  const displayItemText = (item: BoardItem): string => {
    if (item.linkedEntityType === "task" && item.linkedEntityId) {
      const task = projectTasks.find((record) => record.id === item.linkedEntityId);
      return task
        ? `☑ ${task.title}\nВес ${task.weight} · ${task.dueLabel}`
        : `⚠ Задача недоступна\n${item.text}`;
    }
    if (item.linkedEntityType === "project" && item.linkedEntityId) {
      const project = projects.find((record) => record.id === item.linkedEntityId);
      return project
        ? `🌿 ${project.title}\nПрогресс ${project.taskProgress}%`
        : `⚠ Подпроект недоступен\n${item.text}`;
    }
    if (item.linkedEntityType === "file" && item.linkedEntityId) {
      const file = projectFiles.find((record) => record.id === item.linkedEntityId);
      return file ? `📎 ${file.name}\n${file.size}` : `⚠ Файл недоступен\n${item.text}`;
    }
    return item.text;
  };

  const addCanvasImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      setCanvasNotice("Подготавливаем изображение…");
      const encoded = await encodeCanvasImage(file);
      const center = viewportCenter();
      const next: BoardItem = {
        id: crypto.randomUUID(),
        type: "photo",
        x: center.x - encoded.width / 2,
        y: center.y - encoded.height / 2,
        width: encoded.width,
        height: encoded.height,
        fill: "#ffffff",
        text: "",
        imageSrc: encoded.src,
      };
      commitItems([...items, next]);
      setSelectedIds([next.id]);
      setTool("select");
      setCanvasNotice("Изображение добавлено");
    } catch (error) {
      setCanvasNotice(error instanceof Error ? error.message : "Не удалось добавить изображение");
    }
  };

  const exportPng = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const link = document.createElement("a");
    link.download = `treetask-${projectId}-canvas.png`;
    link.href = stage.toDataURL({ pixelRatio: 2 });
    link.click();
    setCanvasNotice("PNG экспортирован");
  };

  const exportPdf = async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      setCanvasNotice("Готовим PDF…");
      const [{ jsPDF }, imageData] = await Promise.all([
        import("jspdf"),
        Promise.resolve(stage.toDataURL({ pixelRatio: 2, mimeType: "image/png" })),
      ]);
      const width = Math.max(1, size.width);
      const height = Math.max(1, size.height);
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
        hotfixes: ["px_scaling"],
      });
      pdf.addImage(imageData, "PNG", 0, 0, width, height, undefined, "FAST");
      pdf.save(`treetask-${projectId}-canvas.pdf`);
      setCanvasNotice("PDF экспортирован");
    } catch {
      setCanvasNotice("Не удалось экспортировать PDF");
    }
  };

  const connections = useMemo(() => items.flatMap((target) => {
    if (!target.parentId) return [];
    const source = items.find((item) => item.id === target.parentId);
    return source ? [{
      id: `${source.id}-${target.id}`,
      from: itemCenter(source),
      to: itemCenter(target),
      color: target.borderColor && !target.borderColor.startsWith("rgba") ? target.borderColor : "#9299a8",
    }] : [];
  }), [items]);

  return (
    <div className="canvas-page">
      <header className="canvas-topbar">
        <div><span className="eyebrow">Проект</span><strong>Доска {currentProject?.title ?? "проекта"}</strong></div>
        <div className="canvas-presence"><div className="avatar-stack"><span>М</span><span>А</span><span>Д</span></div><span className="sync-label" aria-live="polite">{canvasNotice ?? syncLabel}</span><button className="button secondary canvas-template-button" type="button" onClick={() => { setObjectMenuOpen(false); setBrushPanelOpen(false); setEraserPanelOpen(false); setTemplateDialogOpen(true); }}><LayoutTemplate size={17} /> Шаблоны</button><button className="button primary" type="button"><Share2 size={17} /> Поделиться</button></div>
      </header>
      <div className="canvas-workspace" ref={containerRef} data-item-count={items.length} data-stroke-count={strokes.length} data-selected-count={selectedCount} data-linked-item-count={items.filter((item) => item.linkedEntityId).length} data-connection-count={connections.length} data-note-count={items.filter((item) => item.note).length}>
        <div className="canvas-toolbar" ref={toolbarRef} role="toolbar" aria-label="Инструменты Canvas">
          {TOOLBAR.map(({ tool: item, label, icon: Icon }) => <button key={item} type="button" className={tool === item ? "active" : ""} onClick={() => chooseTool(item)} aria-label={label} title={label}><Icon size={19} /></button>)}
          <span className="toolbar-divider" />
          <button type="button" onClick={() => { setObjectMenuOpen(false); setBrushPanelOpen(false); setEraserPanelOpen(false); imageInputRef.current?.click(); }} aria-label="Добавить изображение" title="Изображение"><ImageIcon size={19} /></button>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" onChange={addCanvasImage} />
          <button type="button" onClick={() => { setBrushPanelOpen(false); setEraserPanelOpen(false); setObjectMenuOpen((current) => !current); }} aria-label="Ещё объекты" aria-expanded={objectMenuOpen} title="Ещё"><Plus size={19} /></button>
        </div>
        {objectMenuOpen ? (
          <div className="canvas-object-menu" ref={objectMenuRef} role="menu" aria-label="Добавить объект">
            <button type="button" role="menuitem" onClick={() => { setCardPicker("task"); setObjectMenuOpen(false); }}><span>☑</span><div><strong>Задача</strong><small>Выбрать существующую</small></div></button>
            <button type="button" role="menuitem" onClick={() => { setCardPicker("subproject"); setObjectMenuOpen(false); }}><span>🌿</span><div><strong>Подпроект</strong><small>Выбрать существующий</small></div></button>
            <button type="button" role="menuitem" onClick={() => { setCardPicker("file"); setObjectMenuOpen(false); }}><span>📎</span><div><strong>Файл</strong><small>Выбрать существующий</small></div></button>
          </div>
        ) : null}
        {cardPicker ? (
          <div className="dialog-backdrop canvas-link-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCardPicker(null); }}>
            <section className="quick-dialog canvas-link-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-link-title">
              <header>
                <div><span className="eyebrow">Связанный объект</span><h2 id="canvas-link-title">{cardPicker === "task" ? "Выберите задачу" : cardPicker === "subproject" ? "Выберите подпроект" : "Выберите файл"}</h2></div>
                <button className="icon-button" type="button" onClick={() => setCardPicker(null)} aria-label="Закрыть выбор"><X size={18} /></button>
              </header>
              <div className="canvas-link-list">
                {cardPicker === "task" ? projectTasks.map((task) => (
                  <button key={task.id} type="button" onClick={() => addCanvasCard("task", task.id)}>
                    <span className="task-ring" style={{ borderColor: task.accent }} />
                    <span><strong>{task.title}</strong><small>Вес {task.weight} · {task.dueLabel}</small></span>
                    <span>{task.progress}%</span>
                  </button>
                )) : cardPicker === "subproject" ? projects.filter((project) => project.id !== projectId).map((project) => (
                  <button key={project.id} type="button" onClick={() => addCanvasCard("subproject", project.id)}>
                    <span className="project-color" style={{ background: project.color }} />
                    <span><strong>{project.title}</strong><small>{project.description || "Без описания"}</small></span>
                    <span>{project.taskProgress}%</span>
                  </button>
                )) : projectFiles.map((file) => (
                  <button key={file.id} type="button" onClick={() => addCanvasCard("file", file.id)}>
                    <span>📎</span>
                    <span><strong>{file.name}</strong><small>{file.folder || "Без папки"}</small></span>
                    <span>{file.size}</span>
                  </button>
                ))}
                {cardPicker === "task" && projectTasks.length === 0 ? <div className="canvas-link-empty">В этом проекте пока нет задач.</div> : null}
                {cardPicker === "subproject" && projects.filter((project) => project.id !== projectId).length === 0 ? <div className="canvas-link-empty">Других проектов пока нет.</div> : null}
                {cardPicker === "file" && projectFiles.length === 0 ? <div className="canvas-link-empty">В этом проекте пока нет файлов.</div> : null}
              </div>
            </section>
          </div>
        ) : null}
        {templateDialogOpen ? (
          <div className="dialog-backdrop canvas-link-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTemplateDialogOpen(false); }}>
            <section className="quick-dialog canvas-template-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-template-title">
              <header>
                <div><span className="eyebrow">Интеллект-карта</span><h2 id="canvas-template-title">Выберите структуру</h2></div>
                <button className="icon-button" type="button" onClick={() => setTemplateDialogOpen(false)} aria-label="Закрыть шаблоны"><X size={18} /></button>
              </header>
              <p className="canvas-dialog-copy">Шаблон заменит содержимое доски готовой структурой. Это действие можно отменить кнопкой Undo.</p>
              <div className="mindmap-template-grid" role="group" aria-label="Шаблоны интеллект-карты">
                {MIND_MAP_TEMPLATES.map((template) => (
                  <button key={template.id} type="button" className={selectedTemplateId === template.id ? "selected" : ""} onClick={() => setSelectedTemplateId(template.id)} aria-pressed={selectedTemplateId === template.id}>
                    <span className="template-preview" style={{ "--template-accent": template.accent } as CSSProperties}><i /><i /><i /><i /></span>
                    <span><strong>{template.title}</strong><small>{template.description}</small></span>
                  </button>
                ))}
              </div>
              <footer><button className="button secondary" type="button" onClick={() => setTemplateDialogOpen(false)}>Отмена</button><button className="button primary" type="button" onClick={applyMindMapTemplate}>Применить шаблон</button></footer>
            </section>
          </div>
        ) : null}
        {itemDraft ? (
          <div className="dialog-backdrop canvas-link-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setItemDraft(null); }}>
            <section className="quick-dialog canvas-item-dialog" role="dialog" aria-modal="true" aria-labelledby="canvas-item-title">
              <header>
                <div><span className="eyebrow">Тема карты</span><h2 id="canvas-item-title">Текст и оформление</h2></div>
                <button className="icon-button" type="button" onClick={() => setItemDraft(null)} aria-label="Закрыть редактирование"><X size={18} /></button>
              </header>
              <form onSubmit={saveItemDraft}>
                <label>
                  <span>Текст темы</span>
                  <textarea aria-label="Текст темы" rows={3} value={itemDraft.text} disabled={Boolean(itemDraft.linkedEntityId)} onChange={(event) => setItemDraft((current) => current ? { ...current, text: event.target.value } : current)} />
                  {itemDraft.linkedEntityId ? <small>Текст связанной карточки обновляется из проекта автоматически.</small> : null}
                </label>
                <label>
                  <span>Подробная заметка</span>
                  <textarea aria-label="Подробная заметка" rows={4} placeholder="Контекст, решение, ссылки или важные детали…" value={itemDraft.note ?? ""} onChange={(event) => setItemDraft((current) => current ? { ...current, note: event.target.value } : current)} />
                </label>
                <div className="form-grid">
                  <label>
                    <span>Вид</span>
                    <select aria-label="Вид темы" value={["sticky", "rectangle", "ellipse", "text"].includes(itemDraft.type) ? itemDraft.type : "rectangle"} disabled={Boolean(itemDraft.linkedEntityId)} onChange={(event) => setItemDraft((current) => current ? { ...current, type: event.target.value as ItemType, fill: event.target.value === "text" ? "transparent" : current.fill === "transparent" ? "#f5f8ff" : current.fill } : current)}>
                      <option value="rectangle">Карточка</option>
                      <option value="sticky">Стикер</option>
                      <option value="ellipse">Овал</option>
                      <option value="text">Отдельный текст</option>
                    </select>
                  </label>
                  <label>
                    <span>Родительская тема</span>
                    <select aria-label="Родительская тема" value={itemDraft.parentId ?? ""} onChange={(event) => setItemDraft((current) => current ? { ...current, parentId: event.target.value || undefined } : current)}>
                      <option value="">Без связи</option>
                      {items.filter((item) => item.id !== itemDraft.id && !isItemDescendant(items, item.id, itemDraft.id)).map((item) => <option key={item.id} value={item.id}>{item.text.replaceAll("\n", " ") || "Без названия"}</option>)}
                    </select>
                  </label>
                </div>
                <div className="canvas-style-grid">
                  <label><span>Фон</span><input aria-label="Цвет фона" type="color" value={itemDraft.fill === "transparent" ? "#ffffff" : itemDraft.fill} disabled={itemDraft.type === "text"} onChange={(event) => setItemDraft((current) => current ? { ...current, fill: event.target.value } : current)} /></label>
                  <label><span>Текст</span><input aria-label="Цвет текста" type="color" value={itemDraft.textColor ?? "#202431"} onChange={(event) => setItemDraft((current) => current ? { ...current, textColor: event.target.value } : current)} /></label>
                  <label><span>Контур</span><input aria-label="Цвет контура" type="color" value={itemDraft.borderColor?.startsWith("#") ? itemDraft.borderColor : "#d9e2f0"} disabled={itemDraft.type === "text"} onChange={(event) => setItemDraft((current) => current ? { ...current, borderColor: event.target.value } : current)} /></label>
                </div>
                <label className="canvas-font-size-field">
                  <span>Размер текста <b>{itemDraft.fontSize ?? 18} px</b></span>
                  <input aria-label="Размер текста" type="range" min="12" max="36" step="1" value={itemDraft.fontSize ?? 18} onChange={(event) => setItemDraft((current) => current ? { ...current, fontSize: Number(event.target.value) } : current)} />
                </label>
                <p className="canvas-shortcuts">Tab — новая подтема · Enter — тема рядом · Пробел — редактировать</p>
                <footer><button className="button secondary" type="button" onClick={() => setItemDraft(null)}>Отмена</button><button className="button primary" type="submit">Сохранить тему</button></footer>
              </form>
            </section>
          </div>
        ) : null}
        {tool === "pen" && brushPanelOpen ? (
          <aside className="brush-settings" ref={brushPanelRef} aria-label="Параметры кисти">
            <header><strong>Кисть</strong><span>{brushWidth} px</span><button className="icon-button" type="button" onClick={() => setBrushPanelOpen(false)} aria-label="Закрыть параметры кисти"><X size={17} /></button></header>
            <label>
              <span>Ширина</span>
              <input aria-label="Ширина кисти" type="range" min="1" max="32" step="1" value={brushWidth} onChange={(event) => setBrushWidth(Number(event.target.value))} />
            </label>
            <label>
              <span>Жёсткость</span>
              <input aria-label="Жёсткость кисти" type="range" min="0" max="100" step="5" value={brushHardness} onChange={(event) => setBrushHardness(Number(event.target.value))} />
            </label>
            <div className="brush-colors" aria-label="Цвет кисти">
              {BRUSH_COLORS.map((item) => <button key={item} type="button" className={brushColor === item ? "active" : ""} style={{ background: item }} onClick={() => setBrushColor(item)} aria-label={`Цвет кисти ${item}`} />)}
              <label className="custom-brush-color" title="Свой цвет">
                <input aria-label="Свой цвет кисти" type="color" value={brushColor} onChange={(event) => setBrushColor(event.target.value)} />
              </label>
            </div>
            <label className="brush-pressure-toggle">
              <input type="checkbox" checked={brushPressure} onChange={(event) => setBrushPressure(event.target.checked)} />
              <span><strong>Сила нажатия</strong><small>Стилус — реальная, мышь — динамическая</small></span>
            </label>
            <p>Нарисуйте фигуру и удерживайте нажатие 1,1 сек., чтобы выровнять её.</p>
          </aside>
        ) : null}
        {tool === "eraser" && eraserPanelOpen ? (
          <aside className="brush-settings eraser-settings" ref={eraserPanelRef} aria-label="Параметры ластика">
            <header><strong>Ластик</strong><span>{eraserSize} px</span><button className="icon-button" type="button" onClick={() => setEraserPanelOpen(false)} aria-label="Закрыть параметры ластика"><X size={17} /></button></header>
            <label>
              <span>Размер</span>
              <input aria-label="Размер ластика" type="range" min="8" max="96" step="2" value={eraserSize} onChange={(event) => setEraserSize(Number(event.target.value))} />
            </label>
            <div className="eraser-preview"><span style={{ width: eraserSize, height: eraserSize }} /></div>
            <p>Ластик стирает нарисованные линии частями. Карточки удаляются через инструмент выбора.</p>
          </aside>
        ) : null}
        {selectedCount > 0 && (tool === "select" || tool === "lasso") ? (
          <div className="canvas-selection-controls" role="toolbar" aria-label="Действия с выбранными объектами">
            <span className="selection-count">{selectedCount}</span>
            <button type="button" onClick={() => { const item = selectedItems[0]; if (item) openItemEditor(item); }} disabled={selectedItems.length !== 1} aria-label="Редактировать тему"><PencilLine size={16} /></button>
            <button type="button" onClick={addChildTopic} disabled={selectedItems.length !== 1} aria-label="Добавить подтему"><GitBranchPlus size={16} /></button>
            <button type="button" onClick={duplicateSelection} aria-label="Копировать выбранное"><Copy size={16} /></button>
            <button type="button" onClick={groupSelection} disabled={selectedIds.length < 2} aria-label="Сгруппировать"><GroupIcon size={16} /></button>
            <button type="button" onClick={ungroupSelection} disabled={!selectedItems.some((item) => item.groupId)} aria-label="Разгруппировать"><Ungroup size={16} /></button>
            <button type="button" disabled={selectedIds.length === 0} onClick={toggleSelectionLock} aria-label={selectedItems.length > 0 && selectedItems.every((item) => item.locked) ? "Разблокировать" : "Заблокировать"}>{selectedItems.length > 0 && selectedItems.every((item) => item.locked) ? <Unlock size={16} /> : <LockKeyhole size={16} />}</button>
            <button type="button" disabled={selectedIds.length === 0} onClick={bringSelectionToFront} aria-label="На передний план"><BringToFront size={16} /></button>
            <button type="button" disabled={selectedIds.length === 0} onClick={sendSelectionToBack} aria-label="На задний план"><SendToBack size={16} /></button>
            <button type="button" onClick={() => alignSelection("horizontal")} disabled={selectedIds.length < 2} aria-label="Выровнять по вертикальной оси"><AlignCenterHorizontal size={16} /></button>
            <button type="button" onClick={() => alignSelection("vertical")} disabled={selectedIds.length < 2} aria-label="Выровнять по горизонтальной оси"><AlignCenterVertical size={16} /></button>
            <button type="button" className="danger" onClick={deleteSelection} aria-label="Удалить выбранное"><Trash2 size={16} /></button>
          </div>
        ) : null}
        <div className="canvas-history-controls"><button className="icon-button" type="button" onClick={undo} disabled={historyIndex === 0 && !strokes.some((stroke) => stroke.perfected)} aria-label="Отменить"><Undo2 size={18} /></button><button className="icon-button" type="button" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Повторить"><Redo2 size={18} /></button><button className="icon-button" type="button" onClick={resetBoard} aria-label="Сбросить доску"><RotateCcw size={18} /></button></div>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          draggable={tool === "hand"}
          onDragEnd={(event) => { if (event.target === stageRef.current) setViewport((current) => ({ ...current, x: event.target.x(), y: event.target.y() })); }}
          onWheel={handleWheel}
          onPointerDown={beginPointer}
          onPointerMove={movePointer}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onPointerLeave={(event) => {
            if (event.evt.buttons === 0) finishPointer(event);
            setEraserCursor(null);
            providerRef.current?.awareness?.setLocalStateField("cursor", null);
          }}
        >
          <Layer>
            {connections.map((connection) => <Arrow key={connection.id} points={[...connection.from, ...connection.to]} stroke={connection.color} fill={connection.color} strokeWidth={2.2} pointerLength={8} pointerWidth={8} tension={0.35} listening={false} />)}
            {items.map((item) => (
              <Group
                key={item.id}
                x={item.x}
                y={item.y}
                listening={tool === "select"}
                draggable={tool === "select" && !item.locked}
                onClick={(event) => selectItem(item, event.evt.shiftKey)}
                onTap={() => selectItem(item, false)}
                onDblClick={() => openItemEditor(item)}
                onDblTap={() => openItemEditor(item)}
                onDragEnd={(event) => moveItem(item, event.target.x(), event.target.y())}
              >
                {item.type === "ellipse" ? <Ellipse x={item.width / 2} y={item.height / 2} radiusX={item.width / 2} radiusY={item.height / 2} fill={item.fill} stroke={item.borderColor ?? "#c7ccda"} strokeWidth={1.2} shadowColor="#1a2440" shadowBlur={7} shadowOpacity={0.1} shadowOffsetY={4} /> : item.type !== "text" ? <Rect width={item.width} height={item.height} fill={item.fill} stroke={item.borderColor ?? (item.type === "photo" ? "#d7dae3" : "transparent")} strokeWidth={1.2} cornerRadius={item.type === "sticky" ? 8 : 16} shadowColor="#1a2440" shadowBlur={item.type === "photo" ? 12 : 7} shadowOpacity={0.1} shadowOffsetY={5} /> : null}
                {item.imageSrc ? <CanvasImage src={item.imageSrc} width={item.width} height={item.height} /> : null}
                {item.text ? <Text text={displayItemText(item)} width={item.width} height={item.height} align="center" verticalAlign="middle" fontFamily="Inter, system-ui" fontSize={item.fontSize ?? (item.type === "photo" ? 22 : ["task", "subproject", "file"].includes(item.type) ? 15 : 18)} lineHeight={1.35} fill={item.textColor ?? "#202431"} padding={12} /> : null}
                {item.note ? <Text x={item.width - 29} y={item.height - 25} width={22} height={18} text="···" align="center" fill={item.textColor ?? "#202431"} opacity={0.56} fontSize={13} fontStyle="bold" listening={false} /> : null}
                {selectedIds.includes(item.id) ? <Rect width={item.width} height={item.height} stroke="#5b5cf0" strokeWidth={2.5} dash={item.locked ? [3, 4] : [7, 4]} cornerRadius={item.type === "sticky" ? 4 : 12} listening={false} /> : null}
                {item.locked ? <Text x={item.width - 25} y={7} text="🔒" fontSize={14} listening={false} /> : null}
              </Group>
            ))}
            {lassoRect ? <Rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.width} height={lassoRect.height} fill="rgba(87, 88, 235, 0.08)" stroke="#5758eb" strokeWidth={1.5 / viewport.scale} dash={[7 / viewport.scale, 5 / viewport.scale]} listening={false} /> : null}
            {strokes.map((stroke) => {
              const shape = stroke.perfected;
              const strokeWidth = stroke.width ?? 5;
              const bounds = strokeBounds(stroke);
              const drawing = !shape
                ? <Path data={strokeToSvgPath(stroke.points, { size: strokeWidth, hardness: stroke.hardness ?? 70, usePressure: stroke.usePressure ?? true, simulatePressure: stroke.simulatePressure ?? true })} fill={stroke.color} />
                : shape.kind === "line"
                  ? <Line points={shape.points.flatMap((point) => [...point])} stroke={stroke.color} strokeWidth={strokeWidth} lineCap="round" />
                  : shape.kind === "arrow"
                    ? <Arrow points={shape.points.flatMap((point) => [...point])} stroke={stroke.color} fill={stroke.color} strokeWidth={strokeWidth} pointerLength={strokeWidth * 3} pointerWidth={strokeWidth * 3} />
                    : shape.kind === "circle" || shape.kind === "ellipse"
                      ? <Ellipse x={shape.bounds.x + shape.bounds.width / 2} y={shape.bounds.y + shape.bounds.height / 2} radiusX={shape.bounds.width / 2} radiusY={shape.bounds.height / 2} stroke={stroke.color} strokeWidth={strokeWidth} />
                      : shape.kind === "rectangle" || shape.kind === "square"
                        ? <Rect x={shape.bounds.x} y={shape.bounds.y} width={shape.bounds.width} height={shape.bounds.height} stroke={stroke.color} strokeWidth={strokeWidth} />
                        : <Line points={shape.points.flatMap((point) => [...point])} closed stroke={stroke.color} strokeWidth={strokeWidth} lineJoin="round" />;
              return (
                <Group key={stroke.id} listening={tool === "select"} draggable={tool === "select"} onClick={(event) => selectStroke(stroke, event.evt.shiftKey)} onTap={() => selectStroke(stroke, false)} onDragEnd={(event) => moveStroke(stroke, event.target.x(), event.target.y())}>
                  {drawing}
                  {selectedStrokeIds.includes(stroke.id) ? <Rect x={bounds.x - 5} y={bounds.y - 5} width={Math.max(10, bounds.width + 10)} height={Math.max(10, bounds.height + 10)} stroke="#007aff" strokeWidth={2 / viewport.scale} dash={[7 / viewport.scale, 5 / viewport.scale]} cornerRadius={6 / viewport.scale} listening={false} /> : null}
                </Group>
              );
            })}
            {tool === "eraser" && eraserCursor ? <Ellipse x={eraserCursor.x} y={eraserCursor.y} radiusX={eraserSize / 2} radiusY={eraserSize / 2} fill="rgba(0, 122, 255, 0.08)" stroke="#007aff" strokeWidth={1.5 / viewport.scale} listening={false} /> : null}
            {remoteCursors.map((cursor) => (
              <Group key={cursor.clientId} x={cursor.x} y={cursor.y} listening={false}>
                <Path data="M 0 0 L 0 22 L 6 16 L 11 27 L 16 25 L 11 14 L 20 14 Z" fill={cursor.color} stroke="#fff" strokeWidth={1.5} />
                <Text x={18} y={17} text={cursor.name} fill={cursor.color} fontSize={12} fontStyle="bold" padding={5} shadowColor="#fff" shadowBlur={4} />
              </Group>
            ))}
          </Layer>
        </Stage>
        <div className="canvas-zoom-controls"><button className="icon-button" type="button" onClick={() => zoomAtCenter(0.8)} aria-label="Уменьшить"><ZoomOut size={18} /></button><button className="zoom-value" type="button" onClick={() => setViewport((current) => ({ ...current, scale: 1 }))}>{Math.round(viewport.scale * 100)}%</button><button className="icon-button" type="button" onClick={() => zoomAtCenter(1.25)} aria-label="Увеличить"><ZoomIn size={18} /></button><button className="icon-button" type="button" onClick={exportPng} aria-label="Экспортировать PNG"><Download size={18} /></button><button className="pdf-export-button" type="button" onClick={() => void exportPdf()} aria-label="Экспортировать PDF"><FileText size={16} /><span>PDF</span></button></div>
      </div>
    </div>
  );
}
