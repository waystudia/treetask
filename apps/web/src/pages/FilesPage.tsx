import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { File, FileImage, FileSpreadsheet, FileText, Folder, ImagePlus, Plus, Search, Upload } from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { db, saveFileOffline } from "../data/db";
import { fileKind, formatFileSize } from "../data/remote-sync";

const folders = ["Дизайн", "Документы", "Презентации", "Другое"];
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const fileIcon = {
  pdf: FileText,
  figma: File,
  document: FileText,
  image: FileImage,
  spreadsheet: FileSpreadsheet,
} as const;

function updatedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Сегодня";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

export function FilesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("wayyaam");
  const [notice, setNotice] = useState("");
  const files = useLiveQuery(() => db.projectFiles.toArray(), [], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const filtered = useMemo(() => files.filter((file) => (
    file.projectId === projectId
    && file.name.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))
  )), [files, projectId, search]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setNotice("Файл больше 25 МБ");
      return;
    }
    const now = new Date().toISOString();
    await saveFileOffline({
      id: crypto.randomUUID(),
      projectId,
      name: file.name,
      kind: fileKind(file.name, file.type),
      size: formatFileSize(file.size),
      updatedAt: now,
      blob: file,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    });
    setNotice("Файл сохранён на устройстве и добавлен в очередь синхронизации");
  };

  return (
    <div className="page files-page">
      <PageHeader
        title="Файлы"
        description="Документы команды с доступом по проектам."
        action={<div className="page-action"><Link className="button secondary" to="/project/$projectId/annotate" params={{ projectId }}><ImagePlus size={18} /> Аннотировать</Link><button className="button primary" type="button" onClick={() => inputRef.current?.click()}><Upload size={18} /> Загрузить</button><input ref={inputRef} className="sr-only" type="file" onChange={(event) => void upload(event)} /></div>}
      />
      {notice ? <div className="inline-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Закрыть сообщение">×</button></div> : null}
      <div className="files-filter-row">
        <label className="search-field"><Search size={18} /><span className="sr-only">Поиск файлов</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск файлов" /></label>
        <label className="project-filter"><span>Проект</span><select aria-label="Проект файлов" value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
      </div>
      <section><div className="section-title-row"><h2>Папки</h2><button className="text-button" type="button"><Plus size={16} /> Новая папка</button></div><div className="folder-grid">{folders.map((folder, index) => <button className="folder-card" type="button" key={folder}><span className={`folder-icon folder-${index}`}><Folder size={26} /></span><strong>{folder}</strong><small>{filtered.filter((file) => (file.folder || "Другое") === folder).length} файла</small></button>)}</div></section>
      <section><div className="section-title-row"><h2>Последние файлы</h2><span>{filtered.length}</span></div><div className="file-list">{filtered.map((item) => { const Icon = fileIcon[item.kind]; return <article key={item.id}><span className={`file-icon ${item.kind}`}><Icon size={22} /></span><div><strong>{item.name}</strong><small>{updatedLabel(item.updatedAt)}</small></div><span>{item.size}</span><button className="icon-button" type="button" aria-label={`Действия с файлом ${item.name}`}>•••</button></article>; })}{filtered.length === 0 ? <div className="empty-state"><File size={24} /><h2>Файлов пока нет</h2><p>Загрузите первый файл в выбранный проект.</p></div> : null}</div></section>
    </div>
  );
}
