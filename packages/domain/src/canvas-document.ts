export type CanvasItemType =
  | "sticky"
  | "rectangle"
  | "ellipse"
  | "text"
  | "photo"
  | "task"
  | "subproject"
  | "file";

export interface CanvasDocumentPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface CanvasBoardItem {
  id: string;
  type: CanvasItemType;
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

export interface CanvasStroke {
  id: string;
  points: CanvasDocumentPoint[];
  color: string;
  width?: number;
  hardness?: number;
  usePressure?: boolean;
  simulatePressure?: boolean;
  perfected?: { kind: string; [key: string]: unknown };
  originalPoints?: CanvasDocumentPoint[];
}

export interface CanvasDesignDocument {
  paletteId: string;
  colors: string[];
  canvasColor: string;
  gridColor: string;
  lineColor: string;
}

export interface CanvasBoardSnapshot {
  version?: 2;
  items: CanvasBoardItem[];
  strokes: CanvasStroke[];
  design?: CanvasDesignDocument;
  updatedAt?: string;
}

export interface CanvasNodeDraft {
  id: string;
  text: string;
  type?: CanvasItemType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string;
  parentId?: string;
  note?: string;
}

const DEFAULT_FILL = "#dbeafe";

export function createEmptyCanvasSnapshot(updatedAt = new Date().toISOString()): CanvasBoardSnapshot {
  return { version: 2, items: [], strokes: [], updatedAt };
}

export function addCanvasNodes(
  snapshot: CanvasBoardSnapshot,
  drafts: readonly CanvasNodeDraft[],
  updatedAt = new Date().toISOString(),
): CanvasBoardSnapshot {
  const ids = new Set(snapshot.items.map((item) => item.id));
  const draftIds = new Set<string>();
  for (const draft of drafts) {
    if (ids.has(draft.id) || draftIds.has(draft.id)) {
      throw new Error(`Элемент Canvas с id ${draft.id} уже существует`);
    }
    draftIds.add(draft.id);
  }
  for (const draft of drafts) {
    if (draft.parentId && !ids.has(draft.parentId) && !draftIds.has(draft.parentId)) {
      throw new Error(`Родительский элемент ${draft.parentId} не найден`);
    }
  }

  return {
    ...snapshot,
    version: 2,
    items: [
      ...snapshot.items,
      ...drafts.map((draft) => ({
        id: draft.id,
        type: draft.type ?? "sticky",
        x: draft.x,
        y: draft.y,
        width: draft.width ?? 180,
        height: draft.height ?? 110,
        fill: draft.fill ?? DEFAULT_FILL,
        text: draft.text,
        ...(draft.parentId ? { parentId: draft.parentId } : {}),
        ...(draft.note ? { note: draft.note } : {}),
      })),
    ],
    updatedAt,
  };
}

export function updateCanvasNode(
  snapshot: CanvasBoardSnapshot,
  id: string,
  patch: Partial<Pick<CanvasBoardItem, "text" | "x" | "y" | "width" | "height" | "fill" | "parentId" | "note" | "fontSize" | "textColor" | "borderColor">>,
  updatedAt = new Date().toISOString(),
): CanvasBoardSnapshot {
  if (!snapshot.items.some((item) => item.id === id)) throw new Error(`Элемент Canvas ${id} не найден`);
  if (patch.parentId && !snapshot.items.some((item) => item.id === patch.parentId)) {
    throw new Error(`Родительский элемент ${patch.parentId} не найден`);
  }
  if (patch.parentId === id) throw new Error("Элемент Canvas не может быть родителем самому себе");
  return {
    ...snapshot,
    version: 2,
    items: snapshot.items.map((item) => item.id === id ? { ...item, ...patch } : item),
    updatedAt,
  };
}

export function deleteCanvasNodes(
  snapshot: CanvasBoardSnapshot,
  idsToDelete: readonly string[],
  updatedAt = new Date().toISOString(),
): CanvasBoardSnapshot {
  const deleted = new Set(idsToDelete);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of snapshot.items) {
      if (item.parentId && deleted.has(item.parentId) && !deleted.has(item.id)) {
        deleted.add(item.id);
        changed = true;
      }
    }
  }
  return {
    ...snapshot,
    version: 2,
    items: snapshot.items.filter((item) => !deleted.has(item.id)),
    updatedAt,
  };
}

export function parseCanvasSnapshot(value: unknown): CanvasBoardSnapshot | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Partial<CanvasBoardSnapshot>;
    if (!Array.isArray(parsed.items) || !Array.isArray(parsed.strokes)) return null;
    return parsed as CanvasBoardSnapshot;
  } catch {
    return null;
  }
}
