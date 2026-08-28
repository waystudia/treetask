import {
  formatProjectInviteCode,
  isProjectInviteCode,
  normalizeProjectInviteCode,
} from "@treetask/domain";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, KeyRound, LogIn, Users } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { DEMO_CURRENT_PROFILE_ID } from "../data/demo";
import {
  acceptProjectJoinInvite,
  clearPendingProjectJoinCode,
  readPendingProjectJoinCode,
  savePendingProjectJoinCode,
  type AcceptedProjectInvite,
} from "../data/project-invites";
import { isSupabaseConfigured } from "../lib/supabase";

export function ProjectJoinCard({ initialCode }: { initialCode?: string }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => initialCode ?? readPendingProjectJoinCode() ?? "");
  const [result, setResult] = useState<AcceptedProjectInvite | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initialCode) return;
    setCode(initialCode);
    savePendingProjectJoinCode(initialCode);
  }, [initialCode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeProjectInviteCode(code);
    if (!isProjectInviteCode(normalized)) {
      setMessage("Введите все шесть цифр приглашения");
      return;
    }
    savePendingProjectJoinCode(normalized);
    if (isSupabaseConfigured && !user) {
      setMessage("Сначала войдите в существующий аккаунт — код уже сохранён");
      await navigate({ to: "/settings" });
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const accepted = await acceptProjectJoinInvite({
        code: normalized,
        currentUserId: user?.id ?? DEMO_CURRENT_PROFILE_ID,
      });
      setResult(accepted);
      clearPendingProjectJoinCode();
      setMessage(accepted.status === "accepted"
        ? `Вы вступили в проект «${accepted.projectTitle}»`
        : `Вы уже состоите в команде проекта «${accepted.projectTitle}»`);
      await navigate({ to: "/", search: {}, replace: true });
    } catch (caught) {
      setResult(null);
      setMessage(caught instanceof Error ? caught.message : "Не удалось принять приглашение");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`join-project-card ${initialCode ? "highlighted" : ""}`} aria-labelledby="join-project-title">
      <span className="join-project-icon"><Users size={22} /></span>
      <div className="join-project-copy">
        <span className="eyebrow">Команда</span>
        <h2 id="join-project-title">Вступить в проект</h2>
        <p>{isSupabaseConfigured
          ? "Откройте приглашение после входа или введите шестизначный код."
          : "Введите локальный демонстрационный код приглашения."}</p>
      </div>
      {result ? (
        <div className="join-project-success">
          <span><strong>{result.projectTitle}</strong><small>{result.status === "accepted" ? "Доступ подключён" : "Доступ уже был подключён"}</small></span>
          <Link className="button primary" to="/project/$projectId/control" params={{ projectId: result.projectId }}>Открыть проект <ArrowRight size={17} /></Link>
        </div>
      ) : (
        <form className="join-project-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="project-join-code">Код приглашения</label>
          <div>
            <span className="join-code-field"><KeyRound size={18} aria-hidden="true" /><input id="project-join-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(normalizeProjectInviteCode(event.target.value))} placeholder="000 000" maxLength={6} aria-describedby="project-join-message" /></span>
            <button className="button primary" type="submit" disabled={busy || loading}>{isSupabaseConfigured && !user ? <><LogIn size={17} /> Войти</> : busy ? "Проверяем…" : "Вступить"}</button>
          </div>
        </form>
      )}
      <p id="project-join-message" className="join-project-message" role="status" aria-live="polite">{message || (initialCode ? `Код ${formatProjectInviteCode(initialCode)} получен из ссылки` : "")}</p>
    </section>
  );
}
