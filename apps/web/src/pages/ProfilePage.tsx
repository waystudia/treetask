import { Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Save,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { db, saveProfileOffline } from "../data/db";
import { DEMO_CURRENT_PROFILE_ID } from "../data/demo";
import type { ProfileRecord, ProfileWorkStatus, ProjectRole } from "../data/types";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  reviewer: "Проверяющий",
  member: "Участник",
  viewer: "Наблюдатель",
};

const STATUS_LABEL: Record<ProfileWorkStatus, string> = {
  available: "Доступен для задач",
  focused: "В режиме фокуса",
  busy: "Высокая загрузка",
  away: "Не на месте",
};

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Укажите имя").max(120),
  jobTitle: z.string().trim().max(120),
  department: z.string().trim().max(120),
  bio: z.string().trim().max(1000),
  skills: z.array(z.string().trim().min(1).max(60)).max(12),
  timezone: z.string().trim().min(1).max(80),
  workStatus: z.enum(["available", "focused", "busy", "away"]),
  weeklyCapacityHours: z.number().int().min(1).max(80),
});

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru") || "У";
}

export function OwnProfilePage() {
  const { user } = useAuth();
  return <ProfilePage profileId={user?.id ?? DEMO_CURRENT_PROFILE_ID} editable />;
}

export function MemberProfilePage() {
  const { profileId } = useParams({ from: "/profile/$profileId" });
  const { user } = useAuth();
  return <ProfilePage profileId={profileId} editable={profileId === (user?.id ?? DEMO_CURRENT_PROFILE_ID)} />;
}

function ProfilePage({ profileId, editable }: { profileId: string; editable: boolean }) {
  const { user } = useAuth();
  const profile = useLiveQuery<ProfileRecord | null>(async () => (await db.profiles.get(profileId)) ?? null, [profileId]);
  const memberships = useLiveQuery(() => db.projectMembers.where("userId").equals(profileId).toArray(), [profileId], []);
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.where("assignedTo").equals(profileId).toArray(), [profileId], []);
  const fallbackProfile = useMemo<ProfileRecord>(() => ({
    id: profileId,
    displayName: user?.user_metadata?.display_name ?? user?.email?.split("@")[0] ?? "Новый профиль",
    jobTitle: "",
    department: "",
    bio: "",
    skills: [],
    timezone: "Europe/Moscow",
    workStatus: "available",
    weeklyCapacityHours: 40,
    source: isLocalProfile(profileId) ? "demo" : "remote",
  }), [profileId, user?.email, user?.user_metadata?.display_name]);
  const resolved = profile ?? fallbackProfile;
  const [displayName, setDisplayName] = useState(resolved.displayName);
  const [jobTitle, setJobTitle] = useState(resolved.jobTitle);
  const [department, setDepartment] = useState(resolved.department);
  const [bio, setBio] = useState(resolved.bio);
  const [skills, setSkills] = useState(resolved.skills.join(", "));
  const [timezone, setTimezone] = useState(resolved.timezone);
  const [workStatus, setWorkStatus] = useState<ProfileWorkStatus>(resolved.workStatus);
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(resolved.weeklyCapacityHours);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDisplayName(resolved.displayName);
    setJobTitle(resolved.jobTitle);
    setDepartment(resolved.department);
    setBio(resolved.bio);
    setSkills(resolved.skills.join(", "));
    setTimezone(resolved.timezone);
    setWorkStatus(resolved.workStatus);
    setWeeklyCapacityHours(resolved.weeklyCapacityHours);
  }, [resolved.bio, resolved.department, resolved.displayName, resolved.jobTitle, resolved.skills, resolved.timezone, resolved.weeklyCapacityHours, resolved.workStatus]);

  if (profile === undefined && !editable) return <div className="route-loader">Открываем профиль…</div>;
  if (profile === null && !editable) return <section className="empty-state large"><UserRound size={34} /><h2>Профиль не найден</h2><p>Возможно, участник больше не состоит в доступных вам проектах.</p><Link className="button primary" to="/team">К команде</Link></section>;

  const activeTasks = tasks.filter((task) => task.workflowStatus !== "done");
  const overdue = activeTasks.filter((task) => task.status === "overdue").length;
  const blocked = activeTasks.filter((task) => task.workflowStatus === "blocked").length;
  const completed = tasks.filter((task) => task.workflowStatus === "done").length;
  const activeWeight = activeTasks.reduce((sum, task) => sum + task.weight, 0);

  const save = async () => {
    const parsedSkills = [...new Set(skills.split(",").map((skill) => skill.trim()).filter(Boolean))];
    const parsed = profileSchema.safeParse({ displayName, jobTitle, department, bio, skills: parsedSkills, timezone, workStatus, weeklyCapacityHours });
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Проверьте данные профиля");
      return;
    }
    setSaving(true);
    try {
      await saveProfileOffline({
        ...resolved,
        ...parsed.data,
        source: resolved.source,
      });
      setMessage("Профиль сохранён и будет синхронизирован при подключении");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page profile-page">
      <Link className="project-back" to="/team"><ArrowLeft size={17} /> Команда</Link>
      <PageHeader
        title={editable ? "Мой профиль" : resolved.displayName}
        description={editable ? "Настройте рабочую роль, навыки, доступность и реальную ёмкость." : "Рабочий профиль участника и его ответственность в проектах."}
        action={editable ? <button className="button primary" type="button" disabled={saving} onClick={() => void save()}><Save size={18} />{saving ? "Сохраняем…" : "Сохранить"}</button> : undefined}
      />

      <div className="profile-layout">
        <aside className="profile-summary-card">
          <span className="profile-avatar-large">{initials(resolved.displayName)}</span>
          <h2>{resolved.displayName}</h2>
          <p>{resolved.jobTitle || "Рабочая роль не указана"}</p>
          <span className={`profile-status ${resolved.workStatus}`}><i />{STATUS_LABEL[resolved.workStatus]}</span>
          <dl>
            <div><dt><FolderKanban size={15} /> Проекты</dt><dd>{memberships.length}</dd></div>
            <div><dt><BriefcaseBusiness size={15} /> Активный вес</dt><dd>{activeWeight}</dd></div>
            <div><dt><Clock3 size={15} /> Просрочено</dt><dd>{overdue}</dd></div>
            <div><dt><CheckCircle2 size={15} /> Завершено</dt><dd>{completed}</dd></div>
          </dl>
          {blocked > 0 ? <p className="profile-risk"><ShieldCheck size={16} /> {blocked} задач требуют разблокировки</p> : <p className="profile-good"><Sparkles size={16} /> Критических блокировок нет</p>}
        </aside>

        <div className="profile-main">
          {editable ? <section className="profile-form-card">
            <header><span className="eyebrow">Рабочая карточка</span><h2>Что должна знать команда</h2></header>
            <div className="profile-form-grid">
              <label>Имя и фамилия<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
              <label>Рабочая роль<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="Например, продуктовый дизайнер" /></label>
              <label>Отдел или направление<input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Продукт, разработка, операции" /></label>
              <label>Статус<select value={workStatus} onChange={(event) => setWorkStatus(event.target.value as ProfileWorkStatus)}><option value="available">Доступен для задач</option><option value="focused">В режиме фокуса</option><option value="busy">Высокая загрузка</option><option value="away">Не на месте</option></select></label>
              <label>Часовой пояс<input value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
              <label>Ёмкость в неделю, часов<input type="number" min="1" max="80" value={weeklyCapacityHours} onChange={(event) => setWeeklyCapacityHours(Number(event.target.value))} /></label>
              <label className="profile-wide">Навыки через запятую<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="UX, TypeScript, аналитика" /></label>
              <label className="profile-wide">О себе и рабочем подходе<textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Чем вы помогаете команде и как с вами лучше работать" /></label>
            </div>
            <p className="profile-message" role="status">{message}</p>
          </section> : <section className="profile-form-card profile-readonly"><header><span className="eyebrow">О человеке</span><h2>{resolved.department || "Команда проекта"}</h2></header><p>{resolved.bio || "Участник ещё не добавил описание рабочего подхода."}</p><div className="profile-skill-list">{resolved.skills.length > 0 ? resolved.skills.map((skill) => <span key={skill}>{skill}</span>) : <span>Навыки не указаны</span>}</div><dl><div><dt>Часовой пояс</dt><dd>{resolved.timezone}</dd></div><div><dt>Ёмкость</dt><dd>{resolved.weeklyCapacityHours} ч/нед.</dd></div></dl></section>}

          <section className="profile-projects-card">
            <header><span className="eyebrow">Ответственность</span><h2>Проекты и роли</h2></header>
            {memberships.length > 0 ? <div className="profile-project-list">{memberships.map((member) => {
              const project = projects.find((item) => item.id === member.projectId);
              return <Link key={member.id} to="/project/$projectId/control" params={{ projectId: member.projectId }}><span className="project-color" style={{ background: project?.color ?? "#8e8e93" }} /><span><strong>{project?.title ?? "Проект"}</strong><small>{member.responsibility || "Зона ответственности не указана"}</small></span><span><b>{ROLE_LABEL[member.role]}</b><small>{member.allocationPercent}% участия</small></span></Link>;
            })}</div> : <div className="compact-empty">Пользователь пока не добавлен ни в один проект.</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

function isLocalProfile(profileId: string): boolean {
  return profileId === DEMO_CURRENT_PROFILE_ID || profileId.startsWith("local-");
}
