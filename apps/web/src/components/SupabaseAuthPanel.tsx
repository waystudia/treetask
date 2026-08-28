import {
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { readPendingProjectJoinCode } from "../data/project-invites";

type AuthMode = "sign-in" | "sign-up";

function authErrorMessage(message: string): string {
  const normalized = message.toLocaleLowerCase("en");
  if (normalized.includes("invalid login credentials")) return "Неверный email или пароль";
  if (normalized.includes("user already registered")) return "Аккаунт с таким email уже зарегистрирован";
  if (normalized.includes("password should be")) return "Пароль не соответствует требованиям безопасности";
  if (normalized.includes("email not confirmed")) return "Подтвердите email по ссылке из письма";
  if (normalized.includes("rate limit")) return "Слишком много попыток. Попробуйте немного позже";
  return "Не удалось выполнить вход. Проверьте данные и соединение";
}

export function SupabaseAuthPanel() {
  const { user, isPlatformAdmin, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState(
    isSupabaseConfigured ? "Войдите для безопасной синхронизации" : "Подключение к Supabase не настроено",
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const client = supabase;
    if (!client || !email.trim() || password.length < 10) return;
    setBusy(true);
    if (mode === "sign-up") {
      if (displayName.trim().length < 2) {
        setMessage("Укажите имя длиной не менее двух символов");
        setBusy(false);
        return;
      }
      const pendingJoinCode = readPendingProjectJoinCode();
      const redirectUrl = new URL(
        pendingJoinCode ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}settings`,
        window.location.origin,
      );
      if (pendingJoinCode) redirectUrl.searchParams.set("join", pendingJoinCode);
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: redirectUrl.toString(),
          data: { display_name: displayName.trim() },
        },
      });
      setMessage(
        error
          ? authErrorMessage(error.message)
          : data.session
            ? "Аккаунт создан — синхронизация включена"
            : "Аккаунт создан. Подтвердите email по ссылке из письма",
      );
      if (!error && data.session && pendingJoinCode) {
        await navigate({ to: "/", search: { join: pendingJoinCode } });
      }
    } else {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      setMessage(error ? authErrorMessage(error.message) : "Вход выполнен");
      const pendingJoinCode = readPendingProjectJoinCode();
      if (!error && pendingJoinCode) {
        await navigate({ to: "/", search: { join: pendingJoinCode } });
      }
    }
    setBusy(false);
  };

  const changePassword = async () => {
    const client = supabase;
    if (!client || nextPassword.length < 10) return;
    setBusy(true);
    const { data, error } = await client.functions.invoke("account-management", {
      body: { action: "change_password", password: nextPassword },
    });
    const response = data as { ok?: boolean; message?: string } | null;
    if (error || response?.ok === false) {
      setMessage(response?.message ?? "Не удалось изменить пароль");
    } else {
      await client.auth.refreshSession();
      setNextPassword("");
      setMessage("Пароль обновлён");
    }
    setBusy(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setMessage("Вы вышли; локальные данные остались на устройстве");
    setBusy(false);
  };

  return (
    <section className="settings-card auth-card">
      <div className="settings-card-title">
        <div><span className="settings-symbol"><KeyRound size={18} /></span><div><h2>Аккаунт</h2><p>Вход, регистрация и безопасность</p></div></div>
        {isPlatformAdmin ? <span className="admin-badge"><ShieldCheck size={14} /> Суперадмин</span> : null}
      </div>

      {user ? (
        <div className="auth-session-stack">
          <div className="auth-session">
            <span className="auth-icon"><Mail size={19} /></span>
            <div><strong>{user.email ?? "Пользователь"}</strong><small>Сессия защищена Supabase Auth</small></div>
            <button className="button secondary" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16} /> Выйти</button>
          </div>
          <div className={`password-update ${mustChangePassword ? "required" : ""}`}>
            <div><strong>{mustChangePassword ? "Замените временный пароль" : "Сменить пароль"}</strong><small>Минимум 10 символов</small></div>
            <input type="password" autoComplete="new-password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} placeholder="Новый пароль" />
            <button className="button primary" type="button" disabled={busy || nextPassword.length < 10} onClick={() => void changePassword()}>Обновить</button>
          </div>
        </div>
      ) : (
        <div className="auth-entry">
          <div className="auth-tabs" role="tablist" aria-label="Способ входа">
            <button type="button" role="tab" aria-selected={mode === "sign-in"} className={mode === "sign-in" ? "active" : ""} onClick={() => setMode("sign-in")}><LogIn size={16} /> Войти</button>
            <button type="button" role="tab" aria-selected={mode === "sign-up"} className={mode === "sign-up" ? "active" : ""} onClick={() => setMode("sign-up")}><UserPlus size={16} /> Регистрация</button>
          </div>
          <div className="auth-form">
            {mode === "sign-up" ? <label>Имя<input type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Как к вам обращаться" disabled={!isSupabaseConfigured || busy} /></label> : null}
            <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={!isSupabaseConfigured || busy} /></label>
            <label>Пароль<input type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Не менее 10 символов" disabled={!isSupabaseConfigured || busy} /></label>
            <button className="button primary" type="button" disabled={!isSupabaseConfigured || busy || !email.trim() || password.length < 10} onClick={() => void submit()}>{mode === "sign-up" ? <><UserPlus size={16} /> Создать аккаунт</> : <><LogIn size={16} /> Войти</>}</button>
          </div>
        </div>
      )}
      <p className="auth-message" role="status" aria-live="polite">{message}</p>
    </section>
  );
}
