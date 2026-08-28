import { Copy, KeyRound, RefreshCw, ShieldAlert, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";

interface ManagedAccount {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  mustChangePassword: boolean;
}

interface TemporaryCredential {
  email: string;
  temporaryPassword: string;
}

interface FunctionResponse {
  ok?: boolean;
  message?: string;
  accounts?: ManagedAccount[];
  email?: string;
  temporaryPassword?: string;
}

function formatDate(value: string | null): string {
  if (!value) return "Ещё не входил";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function AdminAccountsPage() {
  const { user, loading, isPlatformAdmin } = useAuth();
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<ManagedAccount | null>(null);
  const [credential, setCredential] = useState<TemporaryCredential | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const invoke = useCallback(async (body: Record<string, unknown>): Promise<FunctionResponse> => {
    if (!supabase) throw new Error("Supabase не подключён");
    const { data, error } = await supabase.functions.invoke("account-management", { body });
    const response = data as FunctionResponse | null;
    if (error || response?.ok === false) throw new Error(response?.message ?? error?.message ?? "Операция не выполнена");
    return response ?? {};
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!isPlatformAdmin) return;
    setBusy(true);
    try {
      const response = await invoke({ action: "list_accounts" });
      setAccounts(response.accounts ?? []);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить аккаунты");
    } finally {
      setBusy(false);
    }
  }, [invoke, isPlatformAdmin]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    if (!creating && !resetTarget && !credential) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      setCreating(false);
      setResetTarget(null);
      setCredential(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, creating, credential, resetTarget]);

  const createAccount = async () => {
    if (displayName.trim().length < 2 || !email.includes("@")) return;
    setBusy(true);
    try {
      const response = await invoke({ action: "create_account", displayName: displayName.trim(), email: email.trim() });
      if (!response.temporaryPassword || !response.email) throw new Error("Временный пароль не получен");
      setCreating(false);
      setCredential({ email: response.email, temporaryPassword: response.temporaryPassword });
      setDisplayName("");
      setEmail("");
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать аккаунт");
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const response = await invoke({ action: "reset_password", userId: resetTarget.id });
      if (!response.temporaryPassword) throw new Error("Временный пароль не получен");
      setResetTarget(null);
      setCredential({ email: response.email || resetTarget.email, temporaryPassword: response.temporaryPassword });
      await loadAccounts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сбросить пароль");
    } finally {
      setBusy(false);
    }
  };

  const copyCredential = async () => {
    if (!credential) return;
    await navigator.clipboard.writeText(`Email: ${credential.email}\nВременный пароль: ${credential.temporaryPassword}`);
    setCredential(null);
    setMessage("Данные входа скопированы. Пароль больше не отображается");
  };

  if (loading) return <div className="route-loader">Проверяем права доступа…</div>;
  if (!user || !isPlatformAdmin) {
    return <div className="page admin-page"><PageHeader title="Управление аккаунтами" description="Раздел доступен только суперадминистратору." /><section className="empty-state large"><ShieldAlert size={34} /><h2>Нет доступа</h2><p>Войдите под аккаунтом, назначенным суперадминистратором платформы.</p></section></div>;
  }

  return (
    <div className="page admin-page">
      <PageHeader title="Аккаунты" description="Создание пользователей и безопасная выдача временных паролей." action={<button className="button primary" type="button" onClick={() => setCreating(true)}><UserPlus size={18} /> Добавить аккаунт</button>} />
      <section className="admin-summary"><span><Users size={20} /></span><div><strong>{accounts.length}</strong><small>аккаунтов</small></div><p><ShieldCheck size={16} /> Текущие пароли никогда не доступны. Можно только выдать новый временный пароль.</p><button className="icon-button" type="button" disabled={busy} onClick={() => void loadAccounts()} aria-label="Обновить список"><RefreshCw size={18} /></button></section>
      <section className="account-list" aria-busy={busy}>
        {accounts.map((account) => <article key={account.id}><span className="account-avatar">{account.email.at(0)?.toLocaleUpperCase("ru")}</span><div><strong>{account.email}</strong><small>Создан {formatDate(account.createdAt)} · {formatDate(account.lastSignInAt)}</small></div>{account.mustChangePassword ? <span className="temporary-badge">Временный пароль</span> : <span className="secure-badge">Активен</span>}<button className="button secondary" type="button" onClick={() => setResetTarget(account)}><KeyRound size={16} /> Сбросить пароль</button></article>)}
        {!busy && accounts.length === 0 ? <div className="empty-state"><Users size={28} /><h2>Аккаунтов пока нет</h2><p>Добавьте первый пользовательский аккаунт.</p></div> : null}
      </section>
      {message ? <p className="admin-message" role="status">{message}</p> : null}

      {creating ? <div className="dialog-backdrop" onMouseDown={() => !busy && setCreating(false)}><section className="quick-dialog" role="dialog" aria-modal="true" aria-labelledby="create-account-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Суперадмин</span><h2 id="create-account-title">Новый аккаунт</h2></div><button className="icon-button" type="button" onClick={() => setCreating(false)} aria-label="Закрыть"><X size={20} /></button></header><form onSubmit={(event) => { event.preventDefault(); void createAccount(); }}><label>Имя<input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Имя пользователя" /></label><label>Email<input type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" /></label><p className="form-note">Пароль будет создан автоматически и показан один раз.</p><footer><button className="button secondary" type="button" onClick={() => setCreating(false)}>Отмена</button><button className="button primary" type="submit" disabled={busy || displayName.trim().length < 2 || !email.includes("@")}>{busy ? "Создаём…" : "Создать"}</button></footer></form></section></div> : null}

      {resetTarget ? <div className="dialog-backdrop" onMouseDown={() => !busy && setResetTarget(null)}><section className="quick-dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Новый пароль</span><h2 id="reset-password-title">Сбросить пароль?</h2></div><button className="icon-button" type="button" onClick={() => setResetTarget(null)} aria-label="Закрыть"><X size={20} /></button></header><p>Для <strong>{resetTarget.email}</strong> будет создан новый временный пароль. Старый пароль перестанет работать.</p><footer><button className="button secondary" type="button" onClick={() => setResetTarget(null)}>Отмена</button><button className="button primary" type="button" disabled={busy} onClick={() => void resetPassword()}>{busy ? "Сбрасываем…" : "Выдать новый пароль"}</button></footer></section></div> : null}

      {credential ? <div className="dialog-backdrop" onMouseDown={() => setCredential(null)}><section className="quick-dialog credential-dialog" role="dialog" aria-modal="true" aria-labelledby="credential-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Показывается один раз</span><h2 id="credential-title">Временные данные входа</h2></div><button className="icon-button" type="button" onClick={() => setCredential(null)} aria-label="Закрыть"><X size={20} /></button></header><dl><div><dt>Email</dt><dd>{credential.email}</dd></div><div><dt>Временный пароль</dt><dd>{credential.temporaryPassword}</dd></div></dl><p>Передайте пароль пользователю безопасным способом. После входа приложение потребует заменить его.</p><footer><button className="button primary" type="button" onClick={() => void copyCredential()}><Copy size={17} /> Скопировать и закрыть</button></footer></section></div> : null}
    </div>
  );
}
