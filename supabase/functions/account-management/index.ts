import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type AccountAction =
  | "me"
  | "list_accounts"
  | "create_account"
  | "reset_password"
  | "change_password"
  | "delete_my_data"
  | "delete_my_account"
  | "delete_project"
  | "create_project_join_invite"
  | "accept_project_join_invite"
  | "invite_project_member";

interface ActionBody {
  action?: AccountAction;
  email?: string;
  displayName?: string;
  userId?: string;
  password?: string;
  projectId?: string;
  role?: "admin" | "reviewer" | "member" | "viewer";
  responsibility?: string;
  allocationPercent?: number;
  expiresInHours?: number;
  code?: string;
}

interface StorageFile {
  storage_path: string;
  folder: string;
}

interface ManagedAuthUser {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
const INVITE_CODE_PATTERN = /^\d{6}$/;
const INVITE_ROLES = ["admin", "reviewer", "member", "viewer"] as const;
const INVITE_RATE_WINDOW_MS = 15 * 60 * 1000;
const INVITE_RATE_LIMIT = 10;

function json(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, { status });
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(bytes, (value) => PASSWORD_CHARSET[value % PASSWORD_CHARSET.length]).join("");
  return `Tt!${random}7`;
}

function randomInviteCode(): string {
  const range = 1_000_000;
  const upperBound = Math.floor(0x1_0000_0000 / range) * range;
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while ((values[0] ?? upperBound) >= upperBound);
  return String((values[0] ?? 0) % range).padStart(6, "0");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось выполнить операцию";
}

async function removePaths(
  admin: any,
  bucket: string,
  paths: readonly string[],
): Promise<void> {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw new Error(`Не удалось удалить файлы из ${bucket}: ${error.message}`);
  }
}

async function collectProjectStorage(admin: any, projectIds: readonly string[]) {
  if (projectIds.length === 0) return { files: [] as StorageFile[], evidence: [] as string[] };
  const [{ data: files, error: filesError }, { data: outcomes, error: outcomesError }] = await Promise.all([
    admin.from("project_files").select("storage_path, folder").in("project_id", projectIds),
    admin.from("outcomes").select("id").in("project_id", projectIds),
  ]);
  if (filesError) throw new Error(filesError.message);
  if (outcomesError) throw new Error(outcomesError.message);
  const outcomeIds = (outcomes ?? []).map((item: { id: string }) => item.id);
  if (outcomeIds.length === 0) return { files: (files ?? []) as StorageFile[], evidence: [] as string[] };
  const { data: evidence, error: evidenceError } = await admin
    .from("outcome_evidence")
    .select("storage_path")
    .in("outcome_id", outcomeIds)
    .not("storage_path", "is", null);
  if (evidenceError) throw new Error(evidenceError.message);
  return {
    files: (files ?? []) as StorageFile[],
    evidence: (evidence ?? []).flatMap((item: { storage_path: string | null }) => item.storage_path ? [item.storage_path] : []),
  };
}

async function removeCollectedStorage(
  admin: any,
  files: readonly StorageFile[],
  evidence: readonly string[],
): Promise<void> {
  const projectFiles = files.filter((item) => item.folder !== "annotations").map((item) => item.storage_path);
  const projectMedia = files.filter((item) => item.folder === "annotations").map((item) => item.storage_path);
  await removePaths(admin, "project-files", projectFiles);
  await removePaths(admin, "project-media", projectMedia);
  await removePaths(admin, "outcome-evidence", evidence);
}

async function cleanupUserStorage(admin: any, userId: string): Promise<void> {
  const [{ data: ownedProjects, error: projectsError }, { data: uploadedFiles, error: filesError }, { data: ownEvidence, error: evidenceError }] = await Promise.all([
    admin.from("projects").select("id").eq("owner_id", userId),
    admin.from("project_files").select("storage_path, folder").eq("uploaded_by", userId),
    admin.from("outcome_evidence").select("storage_path").eq("created_by", userId).not("storage_path", "is", null),
  ]);
  if (projectsError) throw new Error(projectsError.message);
  if (filesError) throw new Error(filesError.message);
  if (evidenceError) throw new Error(evidenceError.message);
  const projectIds = (ownedProjects ?? []).map((item: { id: string }) => item.id);
  const ownedStorage = await collectProjectStorage(admin, projectIds);
  await removeCollectedStorage(
    admin,
    [...ownedStorage.files, ...((uploadedFiles ?? []) as StorageFile[])],
    [
      ...ownedStorage.evidence,
      ...(ownEvidence ?? []).flatMap((item: { storage_path: string | null }) => item.storage_path ? [item.storage_path] : []),
    ],
  );
}

async function requirePlatformAdmin(userClient: any): Promise<void> {
  const { data, error } = await userClient.rpc("is_platform_admin");
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Недостаточно прав суперадминистратора");
}

async function listAllAccounts(admin: any): Promise<ManagedAuthUser[]> {
  const accounts: ManagedAuthUser[] = [];
  const perPage = 200;
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = (data.users ?? []) as ManagedAuthUser[];
    accounts.push(...users);
    if (users.length < perPage) return accounts;
  }
  throw new Error("Список аккаунтов слишком велик для одной операции");
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return json({ ok: false, message: "Необходимо войти в аккаунт" }, 401);
    const admin = ctx.supabaseAdmin as any;
    const userClient = ctx.supabase as any;

    let body: ActionBody;
    try {
      body = await req.json() as ActionBody;
    } catch {
      return json({ ok: false, message: "Некорректный запрос" }, 400);
    }

    try {
      switch (body.action) {
        case "me": {
          const { data, error } = await userClient.rpc("is_platform_admin");
          if (error) throw new Error(error.message);
          return json({ ok: true, isPlatformAdmin: data === true });
        }
        case "list_accounts": {
          await requirePlatformAdmin(userClient);
          const users = await listAllAccounts(admin);
          return json({
            ok: true,
            accounts: users.map((user) => ({
              id: user.id,
              email: user.email ?? "Без email",
              createdAt: user.created_at,
              lastSignInAt: user.last_sign_in_at ?? null,
              mustChangePassword: user.app_metadata?.must_change_password === true,
            })),
          });
        }
        case "create_account": {
          await requirePlatformAdmin(userClient);
          const email = body.email?.trim().toLocaleLowerCase("en") ?? "";
          const displayName = body.displayName?.trim() ?? "";
          if (!EMAIL_PATTERN.test(email)) return json({ ok: false, message: "Введите корректный email" }, 400);
          if (displayName.length < 2 || displayName.length > 120) return json({ ok: false, message: "Имя должно содержать от 2 до 120 символов" }, 400);
          const temporaryPassword = randomPassword();
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password: temporaryPassword,
            email_confirm: true,
            user_metadata: { display_name: displayName },
            app_metadata: { must_change_password: true },
          });
          if (error) throw error;
          return json({ ok: true, accountId: data.user.id, email, temporaryPassword });
        }
        case "reset_password": {
          await requirePlatformAdmin(userClient);
          if (!body.userId || !UUID_PATTERN.test(body.userId)) return json({ ok: false, message: "Некорректный аккаунт" }, 400);
          const { data: existing, error: existingError } = await admin.auth.admin.getUserById(body.userId);
          if (existingError) throw existingError;
          const temporaryPassword = randomPassword();
          const { error } = await admin.auth.admin.updateUserById(body.userId, {
            password: temporaryPassword,
            app_metadata: { ...existing.user.app_metadata, must_change_password: true },
          });
          if (error) throw error;
          return json({ ok: true, email: existing.user.email ?? "", temporaryPassword });
        }
        case "change_password": {
          if (!body.password || body.password.length < 10 || body.password.length > 128) {
            return json({ ok: false, message: "Пароль должен содержать от 10 до 128 символов" }, 400);
          }
          const { data: existing, error: existingError } = await admin.auth.admin.getUserById(userId);
          if (existingError) throw existingError;
          const { error } = await admin.auth.admin.updateUserById(userId, {
            password: body.password,
            app_metadata: { ...existing.user.app_metadata, must_change_password: false },
          });
          if (error) throw error;
          return json({ ok: true, message: "Пароль обновлён" });
        }
        case "delete_my_data": {
          await cleanupUserStorage(admin, userId);
          const { error: purgeError } = await userClient.rpc("purge_my_data");
          if (purgeError) throw new Error(purgeError.message);
          const { error: metadataError } = await admin.auth.admin.updateUserById(userId, { user_metadata: {} });
          if (metadataError) throw metadataError;
          return json({ ok: true, message: "Данные аккаунта удалены" });
        }
        case "delete_my_account": {
          await cleanupUserStorage(admin, userId);
          const { error: purgeError } = await userClient.rpc("purge_my_data");
          if (purgeError) throw new Error(purgeError.message);
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error) throw error;
          return json({ ok: true, message: "Аккаунт удалён" });
        }
        case "delete_project": {
          if (!body.projectId || !UUID_PATTERN.test(body.projectId)) return json({ ok: false, message: "Некорректный проект" }, 400);
          const { data: project, error: projectError } = await admin
            .from("projects")
            .select("id, owner_id")
            .eq("id", body.projectId)
            .maybeSingle();
          if (projectError) throw new Error(projectError.message);
          if (!project) return json({ ok: true, message: "Проект уже удалён" });
          if (project.owner_id !== userId) return json({ ok: false, message: "Удалить проект может только владелец" }, 403);
          const storage = await collectProjectStorage(admin, [body.projectId]);
          await removeCollectedStorage(admin, storage.files, storage.evidence);
          const { error } = await userClient.from("projects").delete().eq("id", body.projectId);
          if (error) throw new Error(error.message);
          return json({ ok: true, message: "Проект удалён" });
        }
        case "create_project_join_invite": {
          if (!body.projectId || !UUID_PATTERN.test(body.projectId)) return json({ ok: false, message: "Некорректный проект" }, 400);
          const role = body.role ?? "member";
          const responsibility = typeof body.responsibility === "string" ? body.responsibility.trim() : "";
          const rawAllocationPercent = Number(body.allocationPercent ?? 50);
          const allocationPercent = Math.round(rawAllocationPercent);
          const rawExpiresInHours = Number(body.expiresInHours ?? 168);
          const expiresInHours = Math.round(rawExpiresInHours);
          if (!INVITE_ROLES.some((allowedRole) => allowedRole === role)) return json({ ok: false, message: "Некорректная роль" }, 400);
          if (responsibility.length > 160) return json({ ok: false, message: "Ответственность не должна превышать 160 символов" }, 400);
          if (!Number.isFinite(rawAllocationPercent) || allocationPercent < 5 || allocationPercent > 100) return json({ ok: false, message: "Участие должно быть от 5 до 100%" }, 400);
          if (!Number.isFinite(rawExpiresInHours) || ![24, 72, 168].includes(expiresInHours)) return json({ ok: false, message: "Некорректный срок действия" }, 400);

          const { data: access, error: accessError } = await userClient
            .from("project_members")
            .select("role")
            .eq("project_id", body.projectId)
            .eq("user_id", userId)
            .maybeSingle();
          if (accessError) throw new Error(accessError.message);
          if (!access || !["owner", "admin"].includes(access.role)) {
            return json({ ok: false, message: "Делиться проектом может только владелец или администратор" }, 403);
          }

          const { data: project, error: projectError } = await admin
            .from("projects")
            .select("id, name")
            .eq("id", body.projectId)
            .maybeSingle();
          if (projectError) throw new Error(projectError.message);
          if (!project) return json({ ok: false, message: "Проект не найден" }, 404);

          const now = new Date();
          const { count: activeCount, error: activeError } = await admin
            .from("project_join_invites")
            .select("id", { count: "exact", head: true })
            .eq("project_id", body.projectId)
            .is("used_at", null)
            .is("revoked_at", null)
            .gt("expires_at", now.toISOString());
          if (activeError) throw new Error(activeError.message);
          if ((activeCount ?? 0) >= 10) return json({ ok: false, message: "У проекта уже есть 10 активных приглашений" }, 409);

          const expiresAt = new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString();
          let created: { id: string; code: string } | null = null;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const code = randomInviteCode();
            const codeHash = await sha256(code);
            const { data, error } = await admin.from("project_join_invites").insert({
              project_id: body.projectId,
              code_hash: codeHash,
              created_by: userId,
              role,
              responsibility,
              allocation_percent: allocationPercent,
              expires_at: expiresAt,
            }).select("id").single();
            if (!error && data?.id) {
              created = { id: data.id, code };
              break;
            }
            if (error?.code !== "23505") throw new Error(error?.message ?? "Не удалось создать приглашение");
          }
          if (!created) throw new Error("Не удалось создать уникальный код. Попробуйте ещё раз");

          return json({
            ok: true,
            invite: {
              id: created.id,
              code: created.code,
              projectId: project.id,
              projectTitle: project.name,
              expiresAt,
            },
          });
        }
        case "accept_project_join_invite": {
          const code = typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
          if (!INVITE_CODE_PATTERN.test(code)) return json({ ok: false, message: "Введите шестизначный код" }, 400);
          const codeHash = await sha256(code);
          const now = new Date();
          const rateWindow = new Date(now.getTime() - INVITE_RATE_WINDOW_MS).toISOString();
          const cleanupBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
          const { count, error: rateError } = await admin
            .from("project_join_attempts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .gte("attempted_at", rateWindow);
          if (rateError) throw new Error(rateError.message);
          if ((count ?? 0) >= INVITE_RATE_LIMIT) {
            return json({ ok: false, message: "Слишком много попыток. Подождите 15 минут" }, 429);
          }

          const { data: attempt, error: attemptError } = await admin
            .from("project_join_attempts")
            .insert({ user_id: userId, code_hash: codeHash })
            .select("id")
            .single();
          if (attemptError || !attempt?.id) throw new Error(attemptError?.message ?? "Не удалось проверить приглашение");

          const { data: claim, error: claimError } = await admin
            .from("project_join_claims")
            .insert({ user_id: userId, code_hash: codeHash })
            .select("project_id, status, joined_role")
            .single();
          if (claimError || !claim) {
            return json({ ok: false, message: "Код не найден, истёк или уже использован" }, 400);
          }

          const [{ data: project, error: projectError }, attemptUpdate] = await Promise.all([
            admin.from("projects").select("name").eq("id", claim.project_id).single(),
            admin.from("project_join_attempts").update({ succeeded: true }).eq("id", attempt.id),
            admin.from("project_join_attempts").delete().lt("attempted_at", cleanupBefore),
          ]);
          if (projectError || !project) throw new Error(projectError?.message ?? "Проект не найден");
          if (attemptUpdate.error) throw new Error(attemptUpdate.error.message);
          return json({
            ok: true,
            membership: {
              status: claim.status,
              projectId: claim.project_id,
              projectTitle: project.name,
              role: claim.joined_role,
            },
          });
        }
        case "invite_project_member": {
          if (!body.projectId || !UUID_PATTERN.test(body.projectId)) return json({ ok: false, message: "Некорректный проект" }, 400);
          const email = typeof body.email === "string" ? body.email.trim().toLocaleLowerCase("en") : "";
          const role = body.role ?? "member";
          const responsibility = typeof body.responsibility === "string" ? body.responsibility.trim() : "";
          const requestedDisplayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
          const rawAllocationPercent = Number(body.allocationPercent ?? 50);
          const allocationPercent = Math.round(rawAllocationPercent);
          if (!EMAIL_PATTERN.test(email)) return json({ ok: false, message: "Введите корректный email" }, 400);
          if (!["admin", "reviewer", "member", "viewer"].includes(role)) return json({ ok: false, message: "Некорректная роль" }, 400);
          if (requestedDisplayName.length > 120) return json({ ok: false, message: "Имя не должно превышать 120 символов" }, 400);
          if (responsibility.length > 160) return json({ ok: false, message: "Ответственность не должна превышать 160 символов" }, 400);
          if (!Number.isFinite(rawAllocationPercent) || allocationPercent < 5 || allocationPercent > 100) return json({ ok: false, message: "Участие должно быть от 5 до 100%" }, 400);

          const { data: access, error: accessError } = await userClient
            .from("project_members")
            .select("role")
            .eq("project_id", body.projectId)
            .eq("user_id", userId)
            .maybeSingle();
          if (accessError) throw new Error(accessError.message);
          if (!access || !["owner", "admin"].includes(access.role)) {
            return json({ ok: false, message: "Приглашать может только владелец или администратор проекта" }, 403);
          }

          const { data: project, error: projectError } = await admin
            .from("projects")
            .select("owner_id")
            .eq("id", body.projectId)
            .maybeSingle();
          if (projectError) throw new Error(projectError.message);
          if (!project) return json({ ok: false, message: "Проект не найден" }, 404);

          const accounts = await listAllAccounts(admin);
          let target = accounts.find((account) => account.email?.toLocaleLowerCase("en") === email);
          let invited = false;
          if (!target) {
            const requestedName = requestedDisplayName || email.split("@")[0] || "Новый участник";
            const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
              data: { display_name: requestedName },
            });
            if (error) throw error;
            target = data.user as ManagedAuthUser;
            invited = true;
          }
          if (!target?.id) throw new Error("Не удалось создать приглашённый аккаунт");
          if (project.owner_id === target.id) return json({ ok: false, message: "Этот пользователь уже является владельцем проекта" }, 400);

          const fallbackName = typeof target.user_metadata?.display_name === "string"
            ? target.user_metadata.display_name.trim()
            : "";
          const displayName = (requestedDisplayName || fallbackName || email.split("@")[0] || "Участник").slice(0, 120);
          const { data: existingProfile, error: profileReadError } = await admin
            .from("profiles")
            .select("display_name")
            .eq("id", target.id)
            .maybeSingle();
          if (profileReadError) throw new Error(profileReadError.message);
          if (!existingProfile) {
            const { error: profileError } = await admin.from("profiles").insert({
              id: target.id,
              display_name: displayName,
            });
            if (profileError) throw new Error(profileError.message);
          }

          const { error: memberError } = await admin.from("project_members").upsert({
            project_id: body.projectId,
            user_id: target.id,
            role,
            responsibility,
            allocation_percent: allocationPercent,
            invited_by: userId,
          });
          if (memberError) throw new Error(memberError.message);
          return json({
            ok: true,
            message: invited ? "Приглашение отправлено" : "Участник добавлен",
            member: {
              userId: target.id,
              displayName: existingProfile?.display_name ?? displayName,
              invited,
            },
          });
        }
        default:
          return json({ ok: false, message: "Неизвестное действие" }, 400);
      }
    } catch (error) {
      const message = safeMessage(error);
      const status = message.includes("суперадминистратора") ? 403 : 400;
      return json({ ok: false, message }, status);
    }
  }),
};
