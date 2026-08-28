import { useParams } from "@tanstack/react-router";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  ImagePlus,
  Pencil,
  Redo2,
  Save,
  Type,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Ellipse, Layer, Line, Stage, Text } from "react-konva";
import { db, savePhotoAnnotationOffline, saveTaskOffline } from "../data/db";
import type {
  AnnotationTool,
  PhotoAnnotationRecord,
  PhotoAnnotationVector,
  TaskRecord,
} from "../data/types";

const LOGICAL_WIDTH = 1200;
const LOGICAL_HEIGHT = 800;
const DEFAULT_SOURCE = "/assets/demo/annotation-reference.png";
const COLORS = ["#e22f2f", "#17191f", "#2563eb", "#16a34a", "#f59e0b"] as const;

const TOOL_ITEMS: readonly {
  tool: AnnotationTool;
  label: string;
  icon: typeof Pencil;
}[] = [
  { tool: "pen", label: "Карандаш", icon: Pencil },
  { tool: "circle", label: "Круг", icon: Circle },
  { tool: "arrow", label: "Стрелка", icon: ArrowUpRight },
  { tool: "text", label: "Текст", icon: Type },
];

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

function getContainedRect(image: HTMLImageElement) {
  const scale = Math.min(
    LOGICAL_WIDTH / image.naturalWidth,
    LOGICAL_HEIGHT / image.naturalHeight,
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  return {
    x: (LOGICAL_WIDTH - width) / 2,
    y: (LOGICAL_HEIGHT - height) / 2,
    width,
    height,
  };
}

export function PhotoAnnotationPage() {
  const { projectId } = useParams({ from: "/project/$projectId/annotate" });
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const sourceImageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const lastTouchAtRef = useRef(0);
  const [displayWidth, setDisplayWidth] = useState(900);
  const [tool, setTool] = useState<AnnotationTool>("pen");
  const [color, setColor] = useState<(typeof COLORS)[number]>(COLORS[0]);
  const [vectors, setVectors] = useState<PhotoAnnotationVector[]>([]);
  const [history, setHistory] = useState<PhotoAnnotationVector[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sourceName, setSourceName] = useState("annotation-reference.png");
  const [sourceDataUrl, setSourceDataUrl] = useState(DEFAULT_SOURCE);
  const [sourceHash, setSourceHash] = useState("");
  const [textDraft, setTextDraft] = useState("Проверить эту часть");
  const [taskTitle, setTaskTitle] = useState("Проверить отмеченный участок");
  const [status, setStatus] = useState("Исходное изображение не изменяется");

  const displayHeight = Math.round((displayWidth * LOGICAL_HEIGHT) / LOGICAL_WIDTH);
  const scale = displayWidth / LOGICAL_WIDTH;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setDisplayWidth(Math.max(280, entry.contentRect.width));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(DEFAULT_SOURCE)
      .then((response) => response.arrayBuffer())
      .then(sha256)
      .then((hash) => {
        if (active) setSourceHash(hash);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => stageRef.current?.batchDraw());
    return () => cancelAnimationFrame(frame);
  }, [displayWidth, vectors]);

  const commit = (next: PhotoAnnotationVector[]) => {
    setVectors(next);
    setHistory((current) => [...current.slice(0, historyIndex + 1), next]);
    setHistoryIndex((current) => current + 1);
  };

  const undo = () => {
    if (historyIndex === 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setVectors(history[nextIndex] ?? []);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setVectors(history[nextIndex] ?? []);
  };

  const logicalPointer = () => {
    const pointer = stageRef.current?.getPointerPosition();
    return pointer ? { x: pointer.x / scale, y: pointer.y / scale } : null;
  };

  const startDrawing = (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if ("touches" in event.evt) {
      lastTouchAtRef.current = Date.now();
    } else if (Date.now() - lastTouchAtRef.current < 800) {
      return;
    }
    const pointer = logicalPointer();
    if (!pointer) return;
    if (tool === "text") {
      commit([
        ...vectors,
        {
          id: crypto.randomUUID(),
          tool,
          points: [pointer.x, pointer.y],
          color,
          text: textDraft.trim() || "Комментарий",
          strokeWidth: 5,
        },
      ]);
      return;
    }
    drawingRef.current = true;
    const points = tool === "pen"
      ? [pointer.x, pointer.y]
      : [pointer.x, pointer.y, pointer.x, pointer.y];
    setVectors((current) => [
      ...current,
      { id: crypto.randomUUID(), tool, points, color, strokeWidth: 7 },
    ]);
  };

  const continueDrawing = () => {
    if (!drawingRef.current) return;
    const pointer = logicalPointer();
    if (!pointer) return;
    setVectors((current) => current.map((vector, index) => {
      if (index !== current.length - 1) return vector;
      return {
        ...vector,
        points: vector.tool === "pen"
          ? [...vector.points, pointer.x, pointer.y]
          : [vector.points[0] ?? pointer.x, vector.points[1] ?? pointer.y, pointer.x, pointer.y],
      };
    }));
  };

  const finishDrawing = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHistory((current) => [
      ...current.slice(0, historyIndex + 1),
      vectors,
    ]);
    setHistoryIndex((current) => current + 1);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStatus("Выберите изображение PNG, JPEG или WebP");
      return;
    }
    const [dataUrl, hash] = await Promise.all([
      readAsDataUrl(file),
      file.arrayBuffer().then(sha256),
    ]);
    setSourceName(file.name);
    setSourceDataUrl(dataUrl);
    setSourceHash(hash);
    setVectors([]);
    setHistory([[]]);
    setHistoryIndex(0);
    setStatus("Фото загружено; пометки сохраняются отдельным слоем");
  };

  const annotationId = useMemo(
    () => `annotation:${projectId}:${sourceHash || sourceName}`,
    [projectId, sourceHash, sourceName],
  );

  useEffect(() => {
    if (!sourceHash) return;
    let active = true;
    void db.photoAnnotations.get(annotationId).then((record) => {
      if (!active || !record) return;
      const restored = [...record.vectors];
      setSourceName(record.sourceName);
      setSourceDataUrl(record.sourceDataUrl);
      setVectors(restored);
      setHistory([restored]);
      setHistoryIndex(0);
      setStatus("Аннотация восстановлена из IndexedDB");
    });
    return () => {
      active = false;
    };
  }, [annotationId, sourceHash]);

  const buildRecord = (): PhotoAnnotationRecord => {
    const now = new Date().toISOString();
    return {
      id: annotationId,
      projectId,
      sourceName,
      sourceDataUrl,
      sourceHash,
      vectors,
      createdAt: now,
      updatedAt: now,
    };
  };

  const save = async () => {
    await savePhotoAnnotationOffline(buildRecord());
    setStatus(`Сохранено отдельно · SHA-256 ${sourceHash.slice(0, 10)}…`);
  };

  const createTask = async () => {
    await savePhotoAnnotationOffline(buildRecord());
    const now = new Date().toISOString();
    const task: TaskRecord = {
      id: crypto.randomUUID(),
      projectId,
      projectName: "Аннотации",
      title: taskTitle.trim() || "Проверить отмеченный участок",
      status: "today",
      workflowStatus: "planned",
      weight: 3,
      mode: "binary",
      progress: 0,
      dueLabel: "Сегодня",
      accent: color,
      createdAt: now,
      updatedAt: now,
      annotationId,
      sourceHash,
    };
    await saveTaskOffline(task);
    setStatus("Задача создана offline-first и связана с векторной аннотацией");
  };

  const renderAnnotatedCanvas = () => {
    const image = sourceImageRef.current;
    const stage = stageRef.current;
    if (!image || !stage || !image.complete) return null;
    const canvas = document.createElement("canvas");
    canvas.width = LOGICAL_WIDTH;
    canvas.height = LOGICAL_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    const rect = getContainedRect(image);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    context.drawImage(stage.toCanvas({ pixelRatio: 1 / scale }), 0, 0);
    return canvas;
  };

  const exportPng = () => {
    const canvas = renderAnnotatedCanvas();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${sourceName.replace(/\.[^.]+$/, "")}-annotated.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setStatus("PNG с пометками экспортирован; оригинал не изменён");
  };

  const exportPdf = async () => {
    const canvas = renderAnnotatedCanvas();
    if (!canvas) return;
    try {
      setStatus("Готовим PDF с пометками…");
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [LOGICAL_WIDTH, LOGICAL_HEIGHT],
        hotfixes: ["px_scaling"],
      });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, undefined, "FAST");
      pdf.save(`${sourceName.replace(/\.[^.]+$/, "")}-annotated.pdf`);
      setStatus("PDF с пометками экспортирован; оригинал не изменён");
    } catch {
      setStatus("Не удалось экспортировать PDF");
    }
  };

  return (
    <section className="page annotation-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Проект · Фото</span>
          <h1>Аннотация изображения</h1>
          <p>{status}</p>
        </div>
        <div className="page-action annotation-actions">
          <button className="button secondary" type="button" onClick={save}>
            <Save size={17} /> Сохранить
          </button>
          <button className="button primary" type="button" onClick={createTask}>
            <CheckCircle2 size={17} /> Создать задачу
          </button>
        </div>
      </header>

      <div className="annotation-layout">
        <aside className="annotation-panel">
          <label className="upload-button">
            <ImagePlus size={19} />
            <span>Загрузить фото</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
          </label>
          <div className="annotation-tools" role="toolbar" aria-label="Инструменты аннотации">
            {TOOL_ITEMS.map(({ tool: item, label, icon: Icon }) => (
              <button
                key={item}
                type="button"
                className={tool === item ? "active" : ""}
                onClick={() => setTool(item)}
                aria-label={label}
              >
                <Icon size={18} /> <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="annotation-colors" aria-label="Цвет линии">
            {COLORS.map((item) => (
              <button
                key={item}
                type="button"
                className={color === item ? "active" : ""}
                style={{ background: item }}
                onClick={() => setColor(item)}
                aria-label={`Цвет ${item}`}
              />
            ))}
          </div>
          <label className="annotation-field">
            Текст пометки
            <input value={textDraft} onChange={(event) => setTextDraft(event.target.value)} />
          </label>
          <label className="annotation-field">
            Название задачи
            <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} />
          </label>
          <div className="annotation-history">
            <button className="icon-button" type="button" onClick={undo} disabled={historyIndex === 0} aria-label="Отменить">
              <Undo2 size={18} />
            </button>
            <button className="icon-button" type="button" onClick={redo} disabled={historyIndex >= history.length - 1} aria-label="Повторить">
              <Redo2 size={18} />
            </button>
            <button className="button secondary" type="button" onClick={exportPng}>
              <Download size={17} /> PNG
            </button>
            <button className="button secondary" type="button" onClick={() => void exportPdf()}>
              <FileText size={17} /> PDF
            </button>
          </div>
          <div className="source-integrity">
            <strong>Целостность оригинала</strong>
            <span>{sourceName}</span>
            <code>{sourceHash ? `${sourceHash.slice(0, 18)}…` : "Считаем SHA-256…"}</code>
          </div>
        </aside>

        <div className="annotation-canvas-card">
          <div ref={containerRef} className="annotation-stage-shell">
            <img ref={sourceImageRef} src={sourceDataUrl} alt="Исходное изображение для аннотации" />
            <Stage
              ref={stageRef}
              width={displayWidth}
              height={displayHeight}
              onMouseDown={startDrawing}
              onTouchStart={startDrawing}
              onMouseMove={continueDrawing}
              onTouchMove={(event: KonvaEventObject<TouchEvent>) => {
                event.evt.preventDefault();
                continueDrawing();
              }}
              onMouseUp={finishDrawing}
              onTouchEnd={finishDrawing}
              onMouseLeave={finishDrawing}
            >
              <Layer scaleX={scale} scaleY={scale}>
                {vectors.map((vector) => {
                  if (vector.tool === "pen") {
                    return <Line key={vector.id} points={[...vector.points]} stroke={vector.color} strokeWidth={vector.strokeWidth} lineCap="round" lineJoin="round" tension={0.22} />;
                  }
                  if (vector.tool === "arrow") {
                    return <Arrow key={vector.id} points={[...vector.points]} stroke={vector.color} fill={vector.color} strokeWidth={vector.strokeWidth} pointerLength={24} pointerWidth={22} lineCap="round" />;
                  }
                  if (vector.tool === "circle") {
                    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = vector.points;
                    return <Ellipse key={vector.id} x={(x1 + x2) / 2} y={(y1 + y2) / 2} radiusX={Math.abs(x2 - x1) / 2} radiusY={Math.abs(y2 - y1) / 2} stroke={vector.color} strokeWidth={vector.strokeWidth} />;
                  }
                  const [x = 0, y = 0] = vector.points;
                  return <Text key={vector.id} x={x} y={y} width={340} text={vector.text} fill={vector.color} fontSize={42} fontStyle="bold" lineHeight={1.15} />;
                })}
              </Layer>
            </Stage>
          </div>
          <footer>
            <span>{vectors.length} пометок</span>
            <span>Оригинал + отдельный векторный слой</span>
          </footer>
        </div>
      </div>
    </section>
  );
}
