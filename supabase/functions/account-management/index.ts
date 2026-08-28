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
  | "delete_project";

interface ActionBody {
  action?: AccountAction;
  email?: string;
  displayName?: string;
  userId?: string;
  password?: string;
  projectId?: string;
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
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

function json(payload: Record<string, unknown>, status = 200): Response {
  return Response.json(payload, { status });
}

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const random = Array.from(bytes, (value) => PASSWORD_CHARSET[value % PASSWORD_CHARSET.length]).join("");
  return `Tt!${random}7`;
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
