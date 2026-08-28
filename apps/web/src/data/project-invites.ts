import {
  isProjectInviteCode,
  normalizeProjectInviteCode,
} from "@treetask/domain";
import { z } from "zod";
import { db } from "./db";
import { hydrateRemoteData } from "./remote-sync";
import type { ProjectRole } from "./types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export const PENDING_PROJECT_JOIN_CODE_KEY = "treetask:pending-project-join-code";

export const projectInviteSettingsSchema = z.object({
  role: z.enum(["admin", "reviewer", "member", "viewer"]),
  responsibility: z.string().trim().max(160, "Ответственность не должна превышать 160 символов"),
  allocationPercent: z.number().finite().int().min(5, "Участие должно быть от 5 до 100%").max(100, "Участие должно быть от 5 до 100%"),
  expiresInHours: z.union([z.literal(24), z.literal(72), z.literal(168)]),
});

export type ProjectInviteSettings = z.infer<typeof projectInviteSettingsSchema>;

export interface CreatedProjectInvite {
  id: string;
  code: string;
  projectId: string;
  projectTitle: string;
  expiresAt: string;
  source: "remote" | "demo";
}

export interface AcceptedProjectInvite {
  status: "accepted" | "already_member";
  projectId: string;
  projectTitle: string;
  role: ProjectRole;
  source: "remote" | "demo";
}

const createInviteResponseSchema = z.object({
  ok: z.literal(true),
  invite: z.object({
    id: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
    projectId: z.string().uuid(),
    projectTitle: z.string().min(1),
    expiresAt: z.string().datetime({ offset: true }),
  }),
});

const acceptInviteResponseSchema = z.object({
  ok: z.literal(true),
  membership: z.object({
    status: z.enum(["accepted", "already_member"]),
    projectId: z.string().uuid(),
    projectTitle: z.string().min(1),
    role: z.enum(["owner", "admin", "reviewer", "member", "viewer"]),
  }),
});

function responseMessage(value: unknown, fallback: string): string {
  const parsed = z.object({ message: z.string().min(1) }).safeParse(value);
  return parsed.success ? parsed.data.message : fallback;
}

function randomLocalInviteCode(): string {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
  return String(value % 1_000_000).padStart(6, "0");
}

async function unusedLocalInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomLocalInviteCode();
    if (!await db.projectJoinInvites.where("code").equals(code).first()) return code;
  }
  throw new Error("Не удалось создать уникальный код. Попробуйте ещё раз");
}

export async function createProjectJoinInvite(input: {
  projectId: string;
  projectTitle: string;
  createdBy: string;
  settings: ProjectInviteSettings;
}): Promise<CreatedProjectInvite> {
  const settings = projectInviteSettingsSchema.parse(input.settings);
  if (supabase && isSupabaseConfigured) {
    if (!navigator.onLine) throw new Error("Для создания общей ссылки нужно подключение к сети");
    const response = await supabase.functions.invoke("account-management", {
      body: {
        action: "create_project_join_invite",
        projectId: input.projectId,
        role: settings.role,
        responsibility: settings.responsibility,
        allocationPercent: settings.allocationPercent,
        expiresInHours: settings.expiresInHours,
      },
    });
    if (response.error) throw new Error(responseMessage(response.data, response.error.message));
    const parsed = createInviteResponseSchema.safeParse(response.data);
    if (!parsed.success) throw new Error(responseMessage(response.data, "Сервис вернул некорректное приглашение"));
    return { ...parsed.data.invite, source: "remote" };
  }

  const code = await unusedLocalInviteCode();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + settings.expiresInHours * 60 * 60 * 1000);
  const id = crypto.randomUUID();
  await db.projectJoinInvites.add({
    id,
    projectId: input.projectId,
    code,
    role: settings.role,
    responsibility: settings.responsibility,
    allocationPercent: settings.allocationPercent,
    createdBy: input.createdBy,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: "demo",
  });
  return {
    id,
    code,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    expiresAt: expiresAt.toISOString(),
    source: "demo",
  };
}

export async function acceptProjectJoinInvite(input: {
  code: string;
  currentUserId: string;
}): Promise<AcceptedProjectInvite> {
  const code = normalizeProjectInviteCode(input.code);
  if (!isProjectInviteCode(code)) throw new Error("Введите все шесть цифр приглашения");

  if (supabase && isSupabaseConfigured) {
    if (!navigator.onLine) throw new Error("Для вступления в облачный проект нужно подключение к сети");
    const response = await supabase.functions.invoke("account-management", {
      body: { action: "accept_project_join_invite", code },
    });
    if (response.error) throw new Error(responseMessage(response.data, response.error.message));
    const parsed = acceptInviteResponseSchema.safeParse(response.data);
    if (!parsed.success) throw new Error(responseMessage(response.data, "Сервис вернул некорректный результат"));
    try {
      await hydrateRemoteData(supabase);
    } catch {
      // Membership is already accepted; RemoteDataSync retries the pull independently.
    }
    window.dispatchEvent(new Event("treetask:mutation-flushed"));
    return { ...parsed.data.membership, source: "remote" };
  }

  return db.transaction("rw", db.projectJoinInvites, db.projectMembers, db.projects, async () => {
    const invite = await db.projectJoinInvites.where("code").equals(code).first();
    if (!invite || invite.usedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new Error("Код не найден, истёк или уже использован");
    }
    const project = await db.projects.get(invite.projectId);
    if (!project) throw new Error("Проект приглашения больше недоступен");
    const memberId = `${invite.projectId}:${input.currentUserId}`;
    const existing = await db.projectMembers.get(memberId);
    if (existing) {
      return {
        status: "already_member" as const,
        projectId: project.id,
        projectTitle: project.title,
        role: existing.role,
        source: "demo" as const,
      };
    }
    const joinedAt = new Date().toISOString();
    await db.projectMembers.put({
      id: memberId,
      projectId: invite.projectId,
      userId: input.currentUserId,
      role: invite.role,
      responsibility: invite.responsibility,
      allocationPercent: invite.allocationPercent,
      invitedBy: invite.createdBy,
      joinedAt,
      source: "demo",
    });
    await db.projectJoinInvites.update(invite.id, { usedAt: joinedAt, usedBy: input.currentUserId });
    return {
      status: "accepted" as const,
      projectId: project.id,
      projectTitle: project.title,
      role: invite.role,
      source: "demo" as const,
    };
  });
}

export function projectJoinUrl(code: string): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set("join", normalizeProjectInviteCode(code));
  return url.toString();
}

export function savePendingProjectJoinCode(value: string): string | null {
  const code = normalizeProjectInviteCode(value);
  if (!isProjectInviteCode(code)) return null;
  window.localStorage.setItem(PENDING_PROJECT_JOIN_CODE_KEY, code);
  return code;
}

export function readPendingProjectJoinCode(): string | null {
  const value = window.localStorage.getItem(PENDING_PROJECT_JOIN_CODE_KEY) ?? "";
  const code = normalizeProjectInviteCode(value);
  return isProjectInviteCode(code) ? code : null;
}

export function clearPendingProjectJoinCode(): void {
  window.localStorage.removeItem(PENDING_PROJECT_JOIN_CODE_KEY);
}
