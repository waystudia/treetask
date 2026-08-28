import { AlertTriangle, CloudOff, Trash2, UserX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { clearAllLocalData } from "../data/db";
import { supabase } from "../lib/supabase";

type DeleteAction = "local" | "data" | "account";

const ACTION_COPY: Record<DeleteAction, { title: string; description: string; confirm: string }> = {
  local: {
    title: "Удалить данные с устройства?",
    description: "Локальные проекты, задачи, файлы и доски будут удалены из этого браузера.",
    confirm: "Удалить локально",
  },
  data: {
    title: "Удалить мои данные?",
    description: "Проекты и личные данные будут удалены из облака и с этого устройства. Аккаунт останется.",
    confirm: "Удалить мои данные",
  },
  account: {
    title: "Удалить аккаунт навсегда?",
    description: "Будут удалены аккаунт, проекты, файлы и доступ к синхронизации. Отменить действие нельзя.",
    confirm: "Удалить аккаунт",
  },
};

export function AccountDangerZone() {
  const { user } = useAuth();
  const [action, setAction] = useState<DeleteAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!action) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setAction(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [action, busy]);

  const close = () => {
    if (busy) return;
    setAction(null);
    setConfirmation("");
  };

  const runDelete = async () => {
    const client = supabase;
    if (!action || confirmation !== "УДАЛИТЬ") return;
    setBusy(true);
    try {
      if (action !== "local") {
        if (!client || !user) throw new Error("Сначала войдите в аккаунт");
        const { data, error } = await client.functions.invoke("account-management", {
          body: { action: action === "data" ? "delete_my_data" : "delete_my_account" },
        });
        const response = data as { ok?: boolean; message?: string } | null;
        if (error || response?.ok === false) throw new Error(response?.message ?? "Не удалось удалить данные");
      }
      await clearAllLocalData();
      if (action === "account" && client) await client.auth.signOut({ scope: "local" });
      setMessage(
        action === "local"
          ? "Локальные данные удалены"
          : action === "data"
            ? "Ваши данные удалены; аккаунт сохранён"
            : "Аккаунт и связанные данные удалены",
      );
      setAction(null);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить данные");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-card danger-card">
      <div className="settings-card-title">
        <div><span className="settings-symbol danger"><AlertTriangle size={18} /></span><div><h2>Удаление данных</h2><p>Вы сами управляете своими данными</p></div></div>
      </div>
      <div className="danger-actions">
        <button type="button" onClick={() => setAction("local")}><CloudOff size={18} /><span><strong>Очистить это устройство</strong><small>Удалить только локальную копию</small></span></button>
        <button type="button" disabled={!user} onClick={() => setAction("data")}><Trash2 size={18} /><span><strong>Удалить мои данные</strong><small>{user ? "Облако и локальная копия" : "Доступно после входа"}</small></span></button>
        <button className="destructive" type="button" disabled={!user} onClick={() => setAction("account")}><UserX size={18} /><span><strong>Удалить аккаунт</strong><small>Необратимое удаление</small></span></button>
      </div>
      {message ? <p className="settings-message" role="status">{message}</p> : null}

      {action ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={close}>
          <section className="quick-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span className="eyebrow">Подтверждение</span><h2 id="delete-dialog-title">{ACTION_COPY[action].title}</h2></div>
              <button className="icon-button" type="button" onClick={close} aria-label="Закрыть"><X size={20} /></button>
            </header>
            <p>{ACTION_COPY[action].description}</p>
            <label>Введите «УДАЛИТЬ»<input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value.toLocaleUpperCase("ru"))} /></label>
            <footer>
              <button className="button secondary" type="button" onClick={close}>Отмена</button>
              <button className="button danger-button" type="button" disabled={busy || confirmation !== "УДАЛИТЬ"} onClick={() => void runDelete()}>{busy ? "Удаляем…" : ACTION_COPY[action].confirm}</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
