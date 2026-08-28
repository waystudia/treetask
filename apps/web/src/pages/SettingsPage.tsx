import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Save, TreePine, UserPlus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { AccountDangerZone } from "../components/AccountDangerZone";
import { SupabaseAuthPanel } from "../components/SupabaseAuthPanel";
import { isSupabaseConfigured } from "../lib/supabase";
import { useRemoteSyncStore } from "../store/remote-sync";
import { db } from "../data/db";

const colors = ["#5b5cf0", "#7774e8", "#f05d56", "#efb53f", "#55bf72", "#3f9fe8", "#9a5bdd"];
export function SettingsPage() {
  const [color, setColor] = useState(colors[0]);
  const [notifications, setNotifications] = useState(true);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const projectMembers = useLiveQuery(() => db.projectMembers.toArray(), [], []);
  const visibleProfiles = profiles.filter((profile) => projectMembers.some((member) => member.userId === profile.id)).slice(0, 5);
  const syncStatus = useRemoteSyncStore((state) => state.status);
  const syncMessage = useRemoteSyncStore((state) => state.message);
  const lastSyncedAt = useRemoteSyncStore((state) => state.lastSyncedAt);
  const syncTone = syncStatus === "synced"
    ? "online"
    : syncStatus === "error"
      ? "error"
      : syncStatus === "syncing"
        ? "syncing"
        : "local";
  const syncLabel = syncStatus === "synced"
    ? "Онлайн"
    : syncStatus === "syncing"
      ? "Синхронизация"
      : syncStatus === "error"
        ? "Ошибка"
        : "Offline-first";
  const lastSyncLabel = lastSyncedAt
    ? ` Последнее обновление: ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(lastSyncedAt))}.`
    : "";
  return (
    <div className="page settings-page">
      <PageHeader title="Настройки" description="Проект, аккаунт, безопасность и ваши данные." action={<button className="button primary" type="button"><Save size={18} /> Сохранить</button>} />
      <div className="settings-grid">
        <section className="settings-card"><h2>Основное</h2><label className="settings-row"><span>Название</span><input defaultValue="WayYaam" /></label><label className="settings-row"><span>Описание</span><input defaultValue="Сервис для заказа услуг" /></label><div className="settings-row"><span>Цвет</span><div className="color-picker">{colors.map((item) => <button key={item} type="button" style={{ background: item }} className={color === item ? "selected" : ""} onClick={() => setColor(item)} aria-label={`Выбрать цвет ${item}`}>{color === item ? <Check size={13} /> : null}</button>)}</div></div><button className="settings-row interactive" type="button"><span>Иконка</span><strong className="project-icon"><TreePine size={21} /></strong><ChevronRight size={18} /></button></section>
        <section className="settings-card"><h2>Команда и доступ</h2>{visibleProfiles.length > 0 ? <div className="people-list">{visibleProfiles.map((profile, index) => <div key={profile.id}><span className={`avatar avatar-${index}`}>{profile.displayName.at(0)?.toLocaleUpperCase("ru") ?? "У"}</span><strong>{profile.displayName}</strong><small>{profile.jobTitle || "Роль не указана"}</small></div>)}</div> : <div className="compact-empty">Участников пока нет.</div>}<Link className="text-button" to="/team"><UserPlus size={17} /> Открыть управление командой</Link></section>
        <section className="settings-card"><h2>Уведомления</h2><label className="settings-row"><span><strong>Email-уведомления</strong><small>Сроки, упоминания и результаты</small></span><input className="switch" type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} /></label><div className="settings-row"><span><strong>Подключение данных</strong><small>{isSupabaseConfigured ? `${syncMessage}.${lastSyncLabel}` : "Локальный режим"}</small></span><span className={`status-dot ${syncTone}`}>{isSupabaseConfigured ? syncLabel : "Offline-first"}</span></div></section>
        <SupabaseAuthPanel />
        <AccountDangerZone />
      </div>
    </div>
  );
}
