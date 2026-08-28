import { Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Clock3,
  Search,
  Share2,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { PageHeader } from "../components/PageHeader";
import { ProjectInviteDialog } from "../components/ProjectInviteDialog";
import {
  db,
  deleteProjectMemberOffline,
  saveProjectMemberOffline,
} from "../data/db";
import { DEMO_CURRENT_PROFILE_ID } from "../data/demo";
import type {
  ProfileRecord,
  ProjectMemberRecord,
  ProjectRole,
} from "../data/types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  reviewer: "Проверяющий",
  member: "Участник",
  viewer: "Наблюдатель",
};

const WORK_STATUS: Record<ProfileRecord["workStatus"], { label: string; tone: string }> = {
  available: { label: "Доступен", tone: "available" },
  focused: { label: "Фокус", tone: "focused" },
  busy: { label: "Загружен", tone: "busy" },
  away: { label: "Не на месте", tone: "away" },
};

const inviteMemberSchema = z.object({
  email: z.string().trim().email("Введите корректный email").transform((value) => value.toLowerCase()),
  displayName: z.string().trim().max(120, "Имя не должно превышать 120 символов"),
  role: z.enum(["admin", "reviewer", "member", "viewer"]),
  responsibility: z.string().trim().max(160, "Ответственность не должна превышать 160 символов"),
  allocationPercent: z.number().finite().int().min(5, "Участие должно быть от 5 до 100%").max(100, "Участие должно быть от 5 до 100%"),
});

const memberSettingsSchema = inviteMemberSchema.pick({ role: true, responsibility: true, allocationPercent: true }).extend({
  role: z.enum(["owner", "admin", "reviewer", "member", "viewer"]),
});

interface InviteResponse {
  ok?: boolean;
  message?: string;
  member?: {
    userId: string;
    displayName: string;
    invited: boolean;
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("ru") || "У";
}

export function TeamPage() {
  const { user } = useAuth();
  const projects = useLiveQuery(() => db.projects.toArray(), [], []);
  const profiles = useLiveQuery(() => db.profiles.toArray(), [], []);
  const members = useLiveQuery(() => db.projectMembers.toArray(), [], []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], []);
  const [projectId, setProjectId] = useState("all");
  const [search, setSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ProjectMemberRecord | null>(null);
  const [message, setMessage] = useState("");
  const currentUserId = user?.id ?? DEMO_CURRENT_PROFILE_ID;
  const selectedProject = projects.find((project) => project.id === projectId);
  const currentMembership = members.find((member) => member.projectId === projectId && member.userId === currentUserId);
  const canManage = Boolean(selectedProject && (currentMembership?.role === "owner" || currentMembership?.role === "admin"));
  const normalizedSearch = search.trim().toLocaleLowerCase("ru");

  const people = useMemo(() => {
    const relevantMembers = members.filter((member) => projectId === "all" || member.projectId === projectId);
    const profileIds = new Set(relevantMembers.map((member) => member.userId));
    return profiles.filter((profile) => profileIds.has(profile.id)).filter((profile) => (
      !normalizedSearch
      || `${profile.displayName} ${profile.jobTitle} ${profile.department} ${profile.skills.join(" ")}`
        .toLocaleLowerCase("ru")
        .includes(normalizedSearch)
    )).map((profile) => {
      const profileMembers = relevantMembers.filter((member) => member.userId === profile.id);
      const profileProjectIds = new Set(profileMembers.map((member) => member.projectId));
      const assigned = tasks.filter((task) => task.assignedTo === profile.id && profileProjectIds.has(task.projectId));
      return {
        profile,
        memberships: profileMembers,
        allocationPercent: profileMembers.reduce((sum, member) => sum + member.allocationPercent, 0),
        active: assigned.filter((task) => task.workflowStatus !== "done").length,
        overdue: assigned.filter((task) => task.status === "overdue" && task.workflowStatus !== "done").length,
        blocked: assigned.filter((task) => task.workflowStatus === "blocked").length,
        activeWeight: assigned.filter((task) => task.workflowStatus !== "done").reduce((sum, task) => sum + task.weight, 0),
      };
    }).sort((left, right) => (
      right.blocked - left.blocked
      || right.overdue - left.overdue
      || right.activeWeight - left.activeWeight
      || left.profile.displayName.localeCompare(right.profile.displayName, "ru")
    ));
  }, [members, normalizedSearch, profiles, projectId, tasks]);

  const openShare = () => {
    if (projectId === "all") {
      setMessage("Сначала выберите проект, в который хотите добавить участника");
      return;
    }
    if (!canManage) {
      setMessage("Приглашать участников может владелец или администратор проекта");
      return;
    }
    setShareOpen(true);
  };

  return (
    <div className="page team-page">
      <PageHeader
        title="Команда"
        description="Роли, ответственность, загрузка и задачи — по реальным участникам проектов."
        action={<div className="team-header-actions"><Link className="button secondary" to="/profile"><Users size={18} /> Мой профиль</Link><button className="button primary" type="button" onClick={openShare}><Share2 size={18} /> Поделиться</button></div>}
      />

      <section className="team-toolbar" aria-label="Фильтры команды">
        <label className="search-field"><Search size={18} aria-hidden="true" /><span className="sr-only">Найти участника</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, роль или навык" /></label>
        <label className="project-filter">Проект<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">Все доступные проекты</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
      </section>
      <p className="team-page-message" role="status">{message}</p>

      {people.length > 0 ? <div className="team-grid">{people.map(({ profile, memberships, allocationPercent, active, overdue, blocked, activeWeight }) => {
        const status = WORK_STATUS[profile.workStatus];
        const projectMembership = projectId === "all" ? null : memberships[0];
        return (
          <article className="team-card" key={profile.id}>
            <header>
              <Link className="team-identity" to="/profile/$profileId" params={{ profileId: profile.id }}>
                <span className="team-avatar">{initials(profile.displayName)}</span>
                <span><strong>{profile.displayName}</strong><small>{profile.jobTitle || "Роль не указана"}</small></span>
              </Link>
              <span className={`work-status ${status.tone}`}><i />{status.label}</span>
            </header>
            <p className="team-department">{profile.department || "Без отдела"}</p>
            <div className="team-metrics">
              <span><BriefcaseBusiness size={15} /><strong>{active}</strong><small>активных</small></span>
              <span className={overdue > 0 ? "metric-alert" : ""}><Clock3 size={15} /><strong>{overdue}</strong><small>просрочено</small></span>
              <span className={blocked > 0 ? "metric-alert" : ""}><AlertTriangle size={15} /><strong>{blocked}</strong><small>блокеров</small></span>
            </div>
            <div className={`member-load ${allocationPercent > 100 ? "overloaded" : ""}`}><span>Плановая загрузка {allocationPercent}%</span><strong>{activeWeight} баллов</strong></div>
            <div className="member-projects">{memberships.map((member) => {
              const project = projects.find((item) => item.id === member.projectId);
              return <span key={member.id} title={member.responsibility}>{project?.title ?? "Проект"} · {ROLE_LABEL[member.role]}</span>;
            })}</div>
            {projectMembership ? <footer><span><b>{projectMembership.allocationPercent}%</b> времени · {projectMembership.responsibility || "ответственность не указана"}</span>{canManage ? <button className="icon-button" type="button" onClick={() => setEditingMember(projectMembership)} aria-label={`Настроить участника ${profile.displayName}`}><Settings2 size={17} /></button> : null}</footer> : null}
          </article>
        );
      })}</div> : <section className="empty-state large"><Users size={34} /><h2>Участники не найдены</h2><p>Измените фильтр или добавьте человека в выбранный проект.</p></section>}

      {shareOpen && selectedProject ? <ProjectInviteDialog projectId={selectedProject.id} projectTitle={selectedProject.title} createdBy={currentUserId} onClose={() => setShareOpen(false)} onEmailInvite={() => { setShareOpen(false); setInviteOpen(true); }} /> : null}
      {inviteOpen && selectedProject ? <InviteMemberDialog projectId={selectedProject.id} projectTitle={selectedProject.title} invitedBy={currentUserId} onClose={() => setInviteOpen(false)} onComplete={(nextMessage) => { setInviteOpen(false); setMessage(nextMessage); }} /> : null}
      {editingMember ? <MemberSettingsDialog member={editingMember} profile={profiles.find((profile) => profile.id === editingMember.userId)} onClose={() => setEditingMember(null)} onComplete={(nextMessage) => { setEditingMember(null); setMessage(nextMessage); }} /> : null}
    </div>
  );
}

function InviteMemberDialog({ projectId, projectTitle, invitedBy, onClose, onComplete }: {
  projectId: string;
  projectTitle: string;
  invitedBy: string;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Exclude<ProjectRole, "owner">>("member");
  const [responsibility, setResponsibility] = useState("");
  const [allocationPercent, setAllocationPercent] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = inviteMemberSchema.safeParse({ email, displayName, role, responsibility, allocationPercent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте данные участника");
      return;
    }
    const values = parsed.data;
    setSaving(true);
    setError("");
    try {
      if (supabase && isSupabaseConfigured) {
        if (!navigator.onLine) throw new Error("Для приглашения нового аккаунта нужно подключение к сети");
        const response = await supabase.functions.invoke<InviteResponse>("account-management", {
          body: {
            action: "invite_project_member",
            projectId,
            email: values.email,
            displayName: values.displayName,
            role: values.role,
            responsibility: values.responsibility,
            allocationPercent: values.allocationPercent,
          },
        });
        if (response.error) throw response.error;
        if (!response.data?.ok || !response.data.member) throw new Error(response.data?.message ?? "Не удалось пригласить участника");
        const member = response.data.member;
        await db.transaction("rw", db.profiles, db.projectMembers, async () => {
          const existing = await db.profiles.get(member.userId);
          await db.profiles.put(existing ?? {
            id: member.userId,
            displayName: member.displayName,
            jobTitle: "",
            department: "",
            bio: "",
            skills: [],
            timezone: "Europe/Moscow",
            workStatus: "available",
            weeklyCapacityHours: 40,
            source: "remote",
          });
          await db.projectMembers.put({
            id: `${projectId}:${member.userId}`,
            projectId,
            userId: member.userId,
            role: values.role,
            responsibility: values.responsibility,
            allocationPercent: values.allocationPercent,
            invitedBy,
            joinedAt: new Date().toISOString(),
            source: "remote",
          });
        });
        window.dispatchEvent(new Event("treetask:mutation-flushed"));
        onComplete(member.invited ? `Приглашение отправлено на ${values.email}` : `${member.displayName} добавлен в проект`);
        return;
      }

      const userId = `local-${crypto.randomUUID()}`;
      const localName = values.displayName || values.email.split("@")[0] || "Новый участник";
      await db.transaction("rw", db.profiles, db.projectMembers, async () => {
        await db.profiles.put({
          id: userId,
          displayName: localName,
          jobTitle: "",
          department: "",
          bio: "",
          skills: [],
          timezone: "Europe/Moscow",
          workStatus: "available",
          weeklyCapacityHours: 40,
          source: "demo",
        });
        await db.projectMembers.put({
          id: `${projectId}:${userId}`,
          projectId,
          userId,
          role: values.role,
          responsibility: values.responsibility,
          allocationPercent: values.allocationPercent,
          invitedBy,
          joinedAt: new Date().toISOString(),
          source: "demo",
        });
      });
      onComplete(`${localName} добавлен в локальную команду проекта`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось добавить участника");
    } finally {
      setSaving(false);
    }
  };

  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="quick-dialog team-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-member-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Команда проекта</span><h2 id="invite-member-title">Пригласить в «{projectTitle}»</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button></header><p className="form-note">В облачном режиме новый пользователь получит письмо Supabase. Существующий аккаунт будет добавлен сразу.</p><form onSubmit={(event) => void submit(event)}><label>Email<input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.ru" /></label><label>Имя<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Для нового аккаунта" maxLength={120} /></label><div className="form-grid"><label>Роль<select value={role} onChange={(event) => setRole(event.target.value as Exclude<ProjectRole, "owner">)}><option value="admin">Администратор</option><option value="reviewer">Проверяющий</option><option value="member">Участник</option><option value="viewer">Наблюдатель</option></select></label><label>Участие в проекте, %<input type="number" min="5" max="100" value={allocationPercent} onChange={(event) => setAllocationPercent(Number(event.target.value))} /></label></div><label>Зона ответственности<input value={responsibility} onChange={(event) => setResponsibility(event.target.value)} placeholder="Например, дизайн и исследования" maxLength={160} /></label>{error ? <span className="field-error" role="alert">{error}</span> : null}<footer><button className="button secondary" type="button" onClick={onClose}>Отмена</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Добавляем…" : "Добавить в команду"}</button></footer></form></section></div>;
}

function MemberSettingsDialog({ member, profile, onClose, onComplete }: {
  member: ProjectMemberRecord;
  profile?: ProfileRecord;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const [role, setRole] = useState(member.role);
  const [responsibility, setResponsibility] = useState(member.responsibility);
  const [allocationPercent, setAllocationPercent] = useState(member.allocationPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isOwner = member.role === "owner";

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = memberSettingsSchema.safeParse({ role, responsibility, allocationPercent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Проверьте настройки участника");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await saveProjectMemberOffline({ ...member, ...parsed.data }, "update");
      onComplete(`Настройки участника ${profile?.displayName ?? "команды"} сохранены`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить настройки");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteProjectMemberOffline(member);
      onComplete(`${profile?.displayName ?? "Участник"} удалён из проекта`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось удалить участника");
      setSaving(false);
    }
  };

  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="quick-dialog team-dialog" role="dialog" aria-modal="true" aria-labelledby="member-settings-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">Участник проекта</span><h2 id="member-settings-title">{profile?.displayName ?? "Настройки участника"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть"><X size={20} /></button></header><form onSubmit={(event) => void save(event)}><label>Роль<select value={role} disabled={isOwner} onChange={(event) => setRole(event.target.value as ProjectRole)}>{isOwner ? <option value="owner">Владелец</option> : null}<option value="admin">Администратор</option><option value="reviewer">Проверяющий</option><option value="member">Участник</option><option value="viewer">Наблюдатель</option></select></label><label>Зона ответственности<input value={responsibility} onChange={(event) => setResponsibility(event.target.value)} maxLength={160} /></label><label>Участие в проекте, %<input type="number" min="5" max="100" value={allocationPercent} onChange={(event) => setAllocationPercent(Number(event.target.value))} /></label>{error ? <span className="field-error" role="alert">{error}</span> : null}<footer className="member-dialog-actions">{!isOwner ? <button className="button remove-member" type="button" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Удалить из проекта</button> : <span className="owner-note">Владельца нельзя удалить</span>}<button className="button secondary" type="button" onClick={onClose}>Отмена</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить"}</button></footer></form></section></div>;
}
