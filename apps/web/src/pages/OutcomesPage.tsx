import { useParams } from "@tanstack/react-router";
import { outcomesProgress } from "@treetask/domain";
import { useLiveQuery } from "dexie-react-hooks";
import {
  CheckCircle2,
  CircleDashed,
  FileCheck2,
  Link2,
  Paperclip,
  Plus,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { DEMO_OUTCOMES } from "../data/demo";
import {
  addOutcomeEvidenceOffline,
  db,
  saveOutcomeOffline,
} from "../data/db";
import type { OutcomeEvidenceRecord, OutcomeRecord } from "../data/types";
import { supabase } from "../lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusMeta = {
  not_started: ["Не начат", CircleDashed, "neutral"],
  in_progress: ["В работе", CircleDashed, "blue"],
  submitted: ["Отправлен", FileCheck2, "amber"],
  confirmed: ["Подтверждён", CheckCircle2, "green"],
  rejected: ["Отклонён", XCircle, "red"],
} as const;

function fileEvidenceKind(file: File): OutcomeEvidenceRecord["kind"] {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type === "application/pdf") return "document";
  return "file";
}

export function OutcomesPage() {
  const { projectId } = useParams({ from: "/project/$projectId/outcomes" });
  const outcomes = useLiveQuery(
    () => db.outcomes.where("projectId").equals(projectId).toArray(),
    [projectId],
    projectId === "wayyaam" ? [...DEMO_OUTCOMES] : [],
  );
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceComment, setEvidenceComment] = useState("");
  const [message, setMessage] = useState("");
  const [canReview, setCanReview] = useState(!UUID_PATTERN.test(projectId));

  useEffect(() => {
    const client = supabase;
    if (!client || !UUID_PATTERN.test(projectId)) {
      setCanReview(true);
      return;
    }
    let active = true;
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user || !active) {
        if (active) setCanReview(false);
        return;
      }
      const { data: membership } = await client
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (active) setCanReview(["owner", "admin", "reviewer"].includes(membership?.role ?? ""));
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  const resultProgress = useMemo(
    () => Math.round(outcomesProgress(outcomes.map((outcome) => ({
      status: outcome.status,
      evidenceCount: outcome.evidenceCount,
    }))) ?? 0),
    [outcomes],
  );

  const createOutcome = async () => {
    if (title.trim().length < 2) return;
    const now = new Date().toISOString();
    await saveOutcomeOffline({
      id: crypto.randomUUID(),
      projectId,
      title: title.trim(),
      description: description.trim(),
      status: "not_started",
      evidenceCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    setTitle("");
    setDescription("");
    setCreating(false);
    setMessage("Результат создан локально и добавлен в очередь синхронизации");
  };

  const changeStatus = async (
    outcome: OutcomeRecord,
    status: OutcomeRecord["status"],
  ) => {
    if ((status === "confirmed" || status === "rejected") && !canReview) {
      setMessage("Подтвердить или отклонить результат может только владелец, администратор или проверяющий");
      return;
    }
    await saveOutcomeOffline({
      ...outcome,
      status,
      reviewComment: status === "rejected" ? "Требуется уточнение доказательства" : outcome.reviewComment,
    }, "update");
    setMessage(status === "confirmed"
      ? "Результат подтверждён — на дереве появились полноценные плоды"
      : status === "rejected"
        ? "Результат отклонён и не влияет на прогресс"
        : "Статус результата обновлён");
  };

  const addLinkEvidence = async () => {
    const outcome = outcomes.find((item) => item.id === evidenceFor);
    if (!outcome) return;
    let normalizedUrl: string;
    try {
      normalizedUrl = new URL(evidenceUrl).toString();
    } catch {
      setMessage("Введите полную ссылку, например https://example.com/result");
      return;
    }
    const evidence: OutcomeEvidenceRecord = {
      id: crypto.randomUUID(),
      projectId,
      outcomeId: outcome.id,
      kind: "link",
      name: normalizedUrl,
      externalUrl: normalizedUrl,
      comment: evidenceComment.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    await addOutcomeEvidenceOffline(evidence);
    setEvidenceFor(null);
    setEvidenceUrl("");
    setEvidenceComment("");
    setMessage("Доказательство сохранено; отправленный результат учитывается на 50%");
  };

  const addFileEvidence = async (outcome: OutcomeRecord, file: File | undefined) => {
    if (!file) return;
    const evidence: OutcomeEvidenceRecord = {
      id: crypto.randomUUID(),
      projectId,
      outcomeId: outcome.id,
      kind: fileEvidenceKind(file),
      name: file.name,
      comment: `Файл ${file.name}, ${file.size} байт`,
      blob: file,
      mimeType: file.type || "application/octet-stream",
      createdAt: new Date().toISOString(),
    };
    await addOutcomeEvidenceOffline(evidence);
    setMessage("Файл сохранён в IndexedDB и будет загружен в закрытый Storage после входа");
  };

  return (
    <div className="page outcomes-page">
      <PageHeader
        title="Результаты"
        description="Измеримые итоги, которые приносят дереву цветы и плоды."
        action={<button className="button primary" type="button" onClick={() => setCreating(true)}><Plus size={18} /> Новый результат</button>}
      />
      <div className="outcome-intro">
        <div><strong>Результат — не действие</strong><p>Отправленный результат с доказательством даёт 50%, подтверждённый — 100%.</p></div>
        <span>{resultProgress}% результатов</span>
      </div>
      {message ? <div className="inline-notice" role="status">{message}<button type="button" onClick={() => setMessage("")} aria-label="Закрыть сообщение"><X size={15} /></button></div> : null}

      {creating ? (
        <section className="outcome-create-card" aria-label="Новый результат">
          <header><div><span className="eyebrow">Измеримый итог</span><h2>Новый результат</h2></div><button className="icon-button" type="button" onClick={() => setCreating(false)} aria-label="Закрыть"><X size={18} /></button></header>
          <label>Название<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, MVP опубликован" autoFocus /></label>
          <label>Критерий подтверждения<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что именно должно быть проверено" rows={3} /></label>
          <footer><button className="button secondary" type="button" onClick={() => setCreating(false)}>Отмена</button><button className="button primary" type="button" disabled={title.trim().length < 2} onClick={() => void createOutcome()}>Создать</button></footer>
        </section>
      ) : null}

      <div className="outcomes-list">
        {outcomes.map((outcome) => {
          const [label, Icon, tone] = statusMeta[outcome.status];
          return (
            <article key={outcome.id}>
              <span className={`outcome-icon ${tone}`}><Icon size={21} /></span>
              <div className="outcome-main">
                <h2>{outcome.title}</h2>
                <p>{outcome.description || (outcome.evidenceCount > 0 ? `Доказательств: ${outcome.evidenceCount}` : "Добавьте доказательство результата")}</p>
                <div className="outcome-actions">
                  {outcome.status !== "confirmed" ? (
                    <>
                      <button type="button" onClick={() => setEvidenceFor(outcome.id)}><Link2 size={14} /> Ссылка</button>
                      <label><Paperclip size={14} /> Файл<input type="file" onChange={(event) => void addFileEvidence(outcome, event.target.files?.[0])} aria-label={`Добавить файл к ${outcome.title}`} /></label>
                    </>
                  ) : null}
                  {outcome.status === "not_started" ? <button type="button" onClick={() => void changeStatus(outcome, "in_progress")}><Send size={14} /> Начать</button> : null}
                  {outcome.status === "submitted" && outcome.evidenceCount > 0 && canReview ? (
                    <><button className="confirm" type="button" onClick={() => void changeStatus(outcome, "confirmed")}><CheckCircle2 size={14} /> Подтвердить</button><button className="reject" type="button" onClick={() => void changeStatus(outcome, "rejected")}><XCircle size={14} /> Отклонить</button></>
                  ) : null}
                  {outcome.status === "submitted" && outcome.evidenceCount > 0 && !canReview ? <span className="review-pending">Ожидает проверяющего</span> : null}
                </div>
              </div>
              <span className={`status-pill ${tone}`}>{label}</span>
            </article>
          );
        })}
        {outcomes.length === 0 ? <div className="empty-state"><CircleDashed size={26} /><h2>Пока нет результатов</h2><p>Добавьте первый измеримый итог проекта.</p></div> : null}
      </div>

      {evidenceFor ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setEvidenceFor(null)}>
          <section className="quick-dialog evidence-dialog" role="dialog" aria-modal="true" aria-labelledby="evidence-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span className="eyebrow">Доказательство</span><h2 id="evidence-title">Добавить ссылку</h2></div><button className="icon-button" type="button" onClick={() => setEvidenceFor(null)} aria-label="Закрыть"><X size={20} /></button></header>
            <div className="evidence-form">
              <label>URL<input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" autoFocus /></label>
              <label>Комментарий<textarea value={evidenceComment} onChange={(event) => setEvidenceComment(event.target.value)} rows={3} placeholder="Что подтверждает эта ссылка" /></label>
              <footer><button className="button secondary" type="button" onClick={() => setEvidenceFor(null)}>Отмена</button><button className="button primary" type="button" onClick={() => void addLinkEvidence()}>Отправить результат</button></footer>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
