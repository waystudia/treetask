import { formatProjectInviteCode } from "@treetask/domain";
import {
  Check,
  Clipboard,
  Copy,
  Link2,
  Mail,
  Share2,
  X,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  createProjectJoinInvite,
  projectInviteSettingsSchema,
  projectJoinUrl,
  type CreatedProjectInvite,
} from "../data/project-invites";
import type { ProjectRole } from "../data/types";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("Браузер не разрешил копирование");
}

export function ProjectInviteDialog({
  projectId,
  projectTitle,
  createdBy,
  onClose,
  onEmailInvite,
}: {
  projectId: string;
  projectTitle: string;
  createdBy: string;
  onClose: () => void;
  onEmailInvite: () => void;
}) {
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("member");
  const [responsibility, setResponsibility] = useState("");
  const [allocationPercent, setAllocationPercent] = useState(50);
  const [expiresInHours, setExpiresInHours] = useState<24 | 72 | 168>(168);
  const [invite, setInvite] = useState<CreatedProjectInvite | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = projectInviteSettingsSchema.safeParse({
      role,
      responsibility,
      allocationPercent,
      expiresInHours,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте параметры приглашения");
      return;
    }
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const created = await createProjectJoinInvite({
        projectId,
        projectTitle,
        createdBy,
        settings: parsed.data,
      });
      setInvite(created);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать приглашение");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (kind: "code" | "link") => {
    if (!invite) return;
    try {
      await copyText(kind === "code" ? invite.code : projectJoinUrl(invite.code));
      setStatus(kind === "code" ? "Код скопирован" : "Ссылка скопирована");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось скопировать");
    }
  };

  const share = async () => {
    if (!invite) return;
    const url = projectJoinUrl(invite.code);
    const text = `Вступите в проект «${projectTitle}» в TreeTask. Код: ${formatProjectInviteCode(invite.code)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `TreeTask — ${projectTitle}`, text, url });
        setStatus("Приглашение передано");
      } else {
        await copyText(url);
        setStatus("Ссылка скопирована — отправьте её участнику");
      }
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Не удалось поделиться");
    }
  };

  const expiresLabel = invite
    ? new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(invite.expiresAt))
    : "";

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        className="quick-dialog team-dialog project-invite-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-invite-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div><span className="eyebrow">Доступ к проекту</span><h2 id="project-invite-title">Поделиться «{projectTitle}»</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button>
        </header>

        {invite ? (
          <div className="invite-result">
            <span className="invite-result-icon"><Check size={22} /></span>
            <div><h3>Приглашение готово</h3><p>Участник входит в существующий аккаунт и открывает ссылку или вводит этот код на главной.</p></div>
            <strong className="invite-code" aria-label={`Код приглашения ${invite.code.split("").join(" ")}`}>{formatProjectInviteCode(invite.code)}</strong>
            <small>Одноразовый код действует до {expiresLabel}</small>
            {invite.source === "demo" ? <p className="local-invite-note">Локальный демонстрационный код работает только в этом браузере. В подключённом Supabase ссылка работает между аккаунтами и устройствами.</p> : null}
            <div className="invite-copy-actions">
              <button className="button secondary" type="button" onClick={() => void copy("code")}><Copy size={17} /> Скопировать код</button>
              <button className="button secondary" type="button" onClick={() => void copy("link")}><Link2 size={17} /> Копировать ссылку</button>
              <button className="button primary" type="button" onClick={() => void share()}><Share2 size={17} /> Поделиться</button>
            </div>
            <p className="invite-status" role="status" aria-live="polite">{status}</p>
            {error ? <span className="field-error" role="alert">{error}</span> : null}
            <footer>
              <button className="button secondary" type="button" onClick={() => { setInvite(null); setStatus(""); }}>Создать другой код</button>
              <button className="button primary" type="button" onClick={onClose}>Готово</button>
            </footer>
          </div>
        ) : (
          <>
            <p className="form-note">Ссылка и шестизначный код предназначены для человека, у которого уже есть аккаунт TreeTask. После входа он сам подтвердит вступление.</p>
            <form onSubmit={(event) => void submit(event)}>
              <div className="form-grid">
                <label>Роль<select value={role} onChange={(event) => setRole(event.target.value as Exclude<ProjectRole, "owner">)}><option value="admin">Администратор</option><option value="reviewer">Проверяющий</option><option value="member">Участник</option><option value="viewer">Наблюдатель</option></select></label>
                <label>Участие в проекте, %<input type="number" min="5" max="100" value={allocationPercent} onChange={(event) => setAllocationPercent(Number(event.target.value))} /></label>
              </div>
              <label>Зона ответственности<input value={responsibility} onChange={(event) => setResponsibility(event.target.value)} placeholder="Например, дизайн и исследования" maxLength={160} /></label>
              <label>Срок действия<select value={expiresInHours} onChange={(event) => setExpiresInHours(Number(event.target.value) as 24 | 72 | 168)}><option value={24}>1 день</option><option value={72}>3 дня</option><option value={168}>7 дней</option></select></label>
              {error ? <span className="field-error" role="alert">{error}</span> : null}
              <button className="email-invite-link" type="button" onClick={onEmailInvite}><Mail size={17} /> Нет аккаунта? Пригласить по email</button>
              <footer>
                <button className="button secondary" type="button" onClick={onClose}>Отмена</button>
                <button className="button primary" type="submit" disabled={saving}>{saving ? <><Clipboard size={17} /> Создаём…</> : <><Link2 size={17} /> Создать код и ссылку</>}</button>
              </footer>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
