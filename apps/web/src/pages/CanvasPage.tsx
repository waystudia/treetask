import { useParams } from "@tanstack/react-router";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useLiveQuery } from "dexie-react-hooks";
import {
  recognizeShape,
  type RecognizedShape,
} from "@treetask/domain";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  BringToFront,
  Download,
  FileText,
  Group as GroupIcon,
  Hand,
  Image as ImageIcon,
  LockKeyhole,
  MousePointer2,
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
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  items: BoardItem[];
  strokes: StrokeItem[];
  updatedAt?: string;
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
  { id: "client", type: "sticky", x: 180, y: 130, width: 170, height: 120, fill: "#bce9f0", text: "Приложение\nклиента" },
  { id: "driver", type: "sticky", x: 760, y: 130, width: 180, height: 120, fill: "#c6edb5", text: "Приложение\nводителя" },
  { id: "marketing", type: "sticky", x: 390, y: 520, width: 170, height: 120, fill: "#f5b4cf", text: "Маркетинг" },
  { id: "infra", type: "sticky", x: 650, y: 500, width: 185, height: 125, fill: "#ffe69a", text: "Инфраструктура" },
  { id: "restaurants", type: "sticky", x: 900, y: 360, width: 165, height: 105, fill: "#dfc3f5", text: "Рестораны" },
  { id: "brief", type: "photo", x: 190, y: 410, width: 175, height: 230, fill: "#ffffff", text: "📄\nКарта экранов" },
  { id: "team", type: "photo", x: 190, y: 720, width: 240, height: 160, fill: "#dde9f6", text: "👩🏻‍💻\nКоманда продукта" },
  { id: "building", type: "photo", x: 650, y: 710, width: 260, height: 170, fill: "#d7e9f3", text: "🏗️\nСтроительство" },
];

const CONNECTIONS: readonly [string, string][] = [
  ["center", "client"], ["center", "driver"], ["center", "marketing"],
  ["center", "infra"], ["center", "restaurants"], ["client", "brief"],
  ["brief", "team"], ["infra", "building"],
];

const TOOLBAR: readonly { tool: CanvasTool; label: string; icon: typeof MousePointer2 }[] = [
  { tool: "select", label: "Выбор", icon: MousePointer2 },
  { tool: "lasso", label: "Лассо", icon: SquareDashedMousePointer },
  { tool: "hand", label: "Перемещение", icon: Hand },
  { tool: "text", label: "Текст", icon: Type },
  { tool: "sticky", label: "Стикер", icon: StickyNote },
  { tool: "pen", label: "Рисование", icon: Pencil },
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

function parseBoardSnapshot(value: string | undefined): BoardSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<BoardSnapshot>;
    return Array.isArray(parsed.items) && Array.isArray(parsed.strokes)
      ? {
          items: parsed.items,
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
  const imageInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const lastPointerCenter = useRef<{ x: number; y: number } | null>(null);
  const lastPointerDistance = useRef<number | null>(null);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const drawingRef = useRef(false);
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
  const [objectMenuOpen, setObjectMenuOpen] = useState(false);
  const [cardPicker, setCardPicker] = useState<"task" | "subproject" | "file" | null>(null);
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
    () => JSON.stringify({ items, strokes, updatedAt: boardUpdatedAt } satisfies BoardSnapshot),
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

  const commitItems = useCallback((next: BoardItem[]) => {
    const updatedAt = new Date().toISOString();
    const snapshot = { items: next, strokes: strokesRef.current, updatedAt } satisfies BoardSnapshot;
    persistBoardSnapshot(snapshot);
    setItems(next);
    setBoardUpdatedAt(updatedAt);
    pushHistory(snapshot);
  }, [persistBoardSnapshot, pushHistory]);

  const commitStrokes = useCallback((next: StrokeItem[]) => {
    const updatedAt = new Date().toISOString();
    const snapshot = { items, strokes: next, updatedAt } satisfies BoardSnapshot;
    persistBoardSnapshot(snapshot);
    setBoardUpdatedAt(updatedAt);
    pushHistory(snapshot);
  }, [items, persistBoardSnapshot, pushHistory]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds],
  );

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
    if (selectedIds.length === 0) return;
    commitItems(items.filter((item) => !selectedIds.includes(item.id) || item.locked));
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id && item.locked)));
    setCanvasNotice("Выбранные незаблокированные объекты удалены");
  };

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
    const updatedAt = new Date().toISOString();
    setBoardUpdatedAt(updatedAt);
    persistBoardSnapshot({ ...snapshot, updatedAt });
    setCanvasNotice("Действие повторено");
  };

  const resetBoard = () => {
    const updatedAt = new Date().toISOString();
    const snapshot = { items: [...INITIAL_ITEMS], strokes: [], updatedAt } satisfies BoardSnapshot;
    setItems(snapshot.items);
    setStrokes(snapshot.strokes);
    strokesRef.current = snapshot.strokes;
    setHistory([snapshot]);
    setHistoryIndex(0);
    setBoardUpdatedAt(updatedAt);
    setSelectedIds([]);
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

  const handlePointerDown = (event: KonvaEventObject<PointerEvent>) => {
    const clickedStage = event.target === event.target.getStage();
    if (!clickedStage) return;
    if (event.evt.pointerType === "mouse" && (event.evt.button !== 0 || event.evt.buttons !== 1)) return;
    setSelectedIds([]);
    const pointer = boardPointer();
    if (!pointer) return;
    if (tool === "lasso") {
      const rect = { x: pointer.x, y: pointer.y, width: 0, height: 0 };
      lassoStartRef.current = pointer;
      lassoRectRef.current = rect;
      setLassoRect(rect);
      return;
    }
    if (tool === "pen") {
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
    }
  };

  const handlePointerMove = (event: KonvaEventObject<PointerEvent>) => {
    const pointer = boardPointer();
    if (!pointer) return;
    providerRef.current?.awareness?.setLocalStateField("cursor", pointer);
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
      const selectedGroups = new Set(directlySelected.flatMap((item) => item.groupId ? [item.groupId] : []));
      setSelectedIds(items.filter((item) => (
        directlySelected.some((selected) => selected.id === item.id) ||
        Boolean(item.groupId && selectedGroups.has(item.groupId))
      )).map((item) => item.id));
      setCanvasNotice(`Выбрано лассо: ${directlySelected.length}`);
      lassoStartRef.current = null;
      lassoRectRef.current = null;
      setLassoRect(null);
    }
    activePointersRef.current.delete(event.evt.pointerId);
    const shouldPersistStroke = tool === "pen" && drawingRef.current;
    drawingRef.current = false;
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (shouldPersistStroke) commitStrokes(strokesRef.current);
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
    commitItems(items.map((item) => (
      movingIds.includes(item.id) && !item.locked
        ? { ...item, x: item.x + deltaX, y: item.y + deltaY }
        : item
    )));
  };

  const viewportCenter = () => ({
    x: (size.width / 2 - viewport.x) / viewport.scale,
    y: (size.height / 2 - viewport.y) / viewport.scale,
  });

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

  const connections = useMemo(() => CONNECTIONS.map(([from, to]) => {
    const source = items.find((item) => item.id === from);
    const target = items.find((item) => item.id === to);
    return source && target ? { id: `${from}-${to}`, from: itemCenter(source), to: itemCenter(target) } : null;
  }).filter((item): item is { id: string; from: [number, number]; to: [number, number] } => Boolean(item)), [items]);

  return (
    <div className="canvas-page">
      <header className="canvas-topbar">
        <div><span className="eyebrow">Проект</span><strong>Доска WayYaam</strong></div>
        <div className="canvas-presence"><div className="avatar-stack"><span>М</span><span>А</span><span>Д</span></div><span className="sync-label" aria-live="polite">{canvasNotice ?? syncLabel}</span><button className="button primary" type="button"><Share2 size={17} /> Поделиться</button></div>
      </header>
      <div className="canvas-workspace" ref={containerRef} data-item-count={items.length} data-stroke-count={strokes.length} data-linked-item-count={items.filter((item) => item.linkedEntityId).length}>
        <div className="canvas-toolbar" role="toolbar" aria-label="Инструменты Canvas">
          {TOOLBAR.map(({ tool: item, label, icon: Icon }) => <button key={item} type="button" className={tool === item ? "active" : ""} onClick={() => setTool(item)} aria-label={label} title={label}><Icon size={19} /></button>)}
          <span className="toolbar-divider" />
          <button type="button" onClick={() => imageInputRef.current?.click()} aria-label="Добавить изображение" title="Изображение"><ImageIcon size={19} /></button>
          <input ref={imageInputRef} className="sr-only" type="file" accept="image/*" onChange={addCanvasImage} />
          <button type="button" onClick={() => setObjectMenuOpen((current) => !current)} aria-label="Ещё объекты" aria-expanded={objectMenuOpen} title="Ещё"><Plus size={19} /></button>
        </div>
        {objectMenuOpen ? (
          <div className="canvas-object-menu" role="menu" aria-label="Добавить объект">
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
        {tool === "pen" ? (
          <aside className="brush-settings" aria-label="Параметры кисти">
            <header><strong>Кисть</strong><span>{brushWidth} px</span></header>
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
        {selectedIds.length > 0 && (tool === "select" || tool === "lasso") ? (
          <div className="canvas-selection-controls" role="toolbar" aria-label="Действия с выбранными объектами">
            <span className="selection-count">{selectedIds.length}</span>
            <button type="button" onClick={groupSelection} disabled={selectedIds.length < 2} aria-label="Сгруппировать"><GroupIcon size={16} /></button>
            <button type="button" onClick={ungroupSelection} disabled={!selectedItems.some((item) => item.groupId)} aria-label="Разгруппировать"><Ungroup size={16} /></button>
            <button type="button" onClick={toggleSelectionLock} aria-label={selectedItems.every((item) => item.locked) ? "Разблокировать" : "Заблокировать"}>{selectedItems.every((item) => item.locked) ? <Unlock size={16} /> : <LockKeyhole size={16} />}</button>
            <button type="button" onClick={bringSelectionToFront} aria-label="На передний план"><BringToFront size={16} /></button>
            <button type="button" onClick={sendSelectionToBack} aria-label="На задний план"><SendToBack size={16} /></button>
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
            providerRef.current?.awareness?.setLocalStateField("cursor", null);
          }}
        >
          <Layer>
            {connections.map((connection) => <Arrow key={connection.id} points={[...connection.from, ...connection.to]} stroke="#38404b" fill="#38404b" strokeWidth={2.2} pointerLength={8} pointerWidth={8} tension={0.22} />)}
            {items.map((item) => (
              <Group key={item.id} x={item.x} y={item.y} draggable={tool === "select" && !item.locked} onClick={(event) => selectItem(item, event.evt.shiftKey)} onTap={() => selectItem(item, false)} onDragEnd={(event) => moveItem(item, event.target.x(), event.target.y())}>
                {item.type === "ellipse" ? <Ellipse x={item.width / 2} y={item.height / 2} radiusX={item.width / 2} radiusY={item.height / 2} fill={item.fill} stroke="#c7ccda" strokeWidth={1} /> : item.type !== "text" ? <Rect width={item.width} height={item.height} fill={item.fill} stroke={item.type === "photo" ? "#d7dae3" : "transparent"} strokeWidth={1} cornerRadius={item.type === "sticky" ? 4 : 12} shadowColor="#1a2440" shadowBlur={item.type === "photo" ? 12 : 7} shadowOpacity={0.12} shadowOffsetY={5} /> : null}
                {item.imageSrc ? <CanvasImage src={item.imageSrc} width={item.width} height={item.height} /> : null}
                {item.text ? <Text text={displayItemText(item)} width={item.width} height={item.height} align="center" verticalAlign="middle" fontFamily="Inter, system-ui" fontSize={item.type === "photo" ? 22 : ["task", "subproject", "file"].includes(item.type) ? 15 : 18} lineHeight={1.35} fill="#202431" padding={12} /> : null}
                {selectedIds.includes(item.id) ? <Rect width={item.width} height={item.height} stroke="#5b5cf0" strokeWidth={2.5} dash={item.locked ? [3, 4] : [7, 4]} cornerRadius={item.type === "sticky" ? 4 : 12} listening={false} /> : null}
                {item.locked ? <Text x={item.width - 25} y={7} text="🔒" fontSize={14} listening={false} /> : null}
              </Group>
            ))}
            {lassoRect ? <Rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.width} height={lassoRect.height} fill="rgba(87, 88, 235, 0.08)" stroke="#5758eb" strokeWidth={1.5 / viewport.scale} dash={[7 / viewport.scale, 5 / viewport.scale]} listening={false} /> : null}
            {strokes.map((stroke) => {
              const shape = stroke.perfected;
              const strokeWidth = stroke.width ?? 5;
              if (!shape) return <Path key={stroke.id} data={strokeToSvgPath(stroke.points, { size: strokeWidth, hardness: stroke.hardness ?? 70, usePressure: stroke.usePressure ?? true, simulatePressure: stroke.simulatePressure ?? true })} fill={stroke.color} />;
              if (shape.kind === "line") return <Line key={stroke.id} points={shape.points.flatMap((point) => [...point])} stroke={stroke.color} strokeWidth={strokeWidth} lineCap="round" />;
              if (shape.kind === "arrow") return <Arrow key={stroke.id} points={shape.points.flatMap((point) => [...point])} stroke={stroke.color} fill={stroke.color} strokeWidth={strokeWidth} pointerLength={strokeWidth * 3} pointerWidth={strokeWidth * 3} />;
              if (shape.kind === "circle" || shape.kind === "ellipse") return <Ellipse key={stroke.id} x={shape.bounds.x + shape.bounds.width / 2} y={shape.bounds.y + shape.bounds.height / 2} radiusX={shape.bounds.width / 2} radiusY={shape.bounds.height / 2} stroke={stroke.color} strokeWidth={strokeWidth} />;
              if (shape.kind === "rectangle" || shape.kind === "square") return <Rect key={stroke.id} x={shape.bounds.x} y={shape.bounds.y} width={shape.bounds.width} height={shape.bounds.height} stroke={stroke.color} strokeWidth={strokeWidth} />;
              return <Line key={stroke.id} points={shape.points.flatMap((point) => [...point])} closed stroke={stroke.color} strokeWidth={strokeWidth} lineJoin="round" />;
            })}
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
