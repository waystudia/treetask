import { ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SupabaseAuthPanel } from "../components/SupabaseAuthPanel";
import { supabase } from "../lib/supabase";

interface ConsentDetails {
  authorization_id: string;
  client: { name?: string; client_name?: string; client_uri?: string; logo_uri?: string };
  redirect_uri: string;
  scope: string;
  user: { email: string };
}

export function OAuthConsentPage() {
  const authorizationId = useMemo(() => new URLSearchParams(window.location.search).get("authorization_id"), []);
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client || !authorizationId) {
      setError("Запрос подключения не найден.");
      return;
    }
    const load = async () => {
      const { data: sessionData } = await client.auth.getSession();
      setSignedIn(Boolean(sessionData.session));
      if (!sessionData.session) return;
      const { data, error: requestError } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
      if (requestError) {
        setError(requestError.message);
        return;
      }
      if (data && "redirect_url" in data) {
        window.location.assign(data.redirect_url);
        return;
      }
      setDetails(data as ConsentDetails);
    };
    void load();
    const { data: listener } = client.auth.onAuthStateChange(() => void load());
    return () => listener.subscription.unsubscribe();
  }, [authorizationId]);

  const decide = async (approved: boolean) => {
    const client = supabase;
    if (!client || !authorizationId) return;
    setBusy(true);
    setError(null);
    const response = approved
      ? await client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      : await client.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
    setBusy(false);
    if (response.error) {
      setError(response.error.message);
      return;
    }
    if (response.data?.redirect_url) window.location.assign(response.data.redirect_url);
  };

  if (!signedIn) return <main className="oauth-consent-page"><section className="oauth-consent-card"><ShieldCheck size={36} /><h1>Войдите в TreeTask</h1><p>После входа вы вернётесь к подтверждению доступа ChatGPT к вашим проектам.</p><SupabaseAuthPanel /></section></main>;

  return <main className="oauth-consent-page"><section className="oauth-consent-card">
    <ShieldCheck size={36} />
    <span className="eyebrow">Безопасное подключение</span>
    <h1>{details?.client.client_name ?? details?.client.name ?? "ChatGPT"} запрашивает доступ</h1>
    <p>Подключение сможет просматривать ваши доступные проекты и создавать, менять или удалять элементы Canvas от вашего имени.</p>
    {details ? <dl className="oauth-consent-details"><div><dt>Аккаунт</dt><dd>{details.user.email}</dd></div><div><dt>Разрешения</dt><dd>{details.scope.split(" ").join(", ")}</dd></div></dl> : <p>Проверяем запрос…</p>}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <div className="oauth-consent-actions"><button className="button" type="button" disabled={busy || !details} onClick={() => void decide(false)}>Отказать</button><button className="button primary" type="button" disabled={busy || !details} onClick={() => void decide(true)}>{busy ? "Подключаем…" : "Разрешить"}</button></div>
  </section></main>;
}
