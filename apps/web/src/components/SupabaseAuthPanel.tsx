import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function SupabaseAuthPanel() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState(
    isSupabaseConfigured ? "Войдите, чтобы синхронизировать проекты" : "Добавьте VITE_SUPABASE_URL и publishable key",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    void client.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const client = supabase;
    if (!client || !email.trim()) return;
    setBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/settings" },
    });
    setMessage(error ? error.message : "Ссылка для входа отправлена на email");
    setBusy(false);
  };

  const signOut = async () => {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    setMessage("Сеанс завершён; локальные данные сохранены");
    setBusy(false);
  };

  return (
    <section className="settings-card auth-card">
      <h2>Supabase Auth</h2>
      {user ? (
        <div className="auth-session">
          <span className="auth-icon"><Mail size={19} /></span>
          <div><strong>{user.email ?? "Пользователь"}</strong><small>Сессия подтверждена</small></div>
          <button className="button secondary" type="button" disabled={busy} onClick={() => void signOut()}><LogOut size={16} /> Выйти</button>
        </div>
      ) : (
        <div className="auth-form">
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" disabled={!isSupabaseConfigured || busy} /></label>
          <button className="button primary" type="button" disabled={!isSupabaseConfigured || busy || !email.trim()} onClick={() => void signIn()}><LogIn size={16} /> Получить ссылку</button>
        </div>
      )}
      <p>{message}</p>
    </section>
  );
}
