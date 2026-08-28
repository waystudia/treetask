export const PROJECT_INVITE_CODE_LENGTH = 6;

export function normalizeProjectInviteCode(value: unknown): string {
  const source = typeof value === "string" || typeof value === "number" ? String(value) : "";
  return source.replace(/\D/g, "").slice(0, PROJECT_INVITE_CODE_LENGTH);
}

export function isProjectInviteCode(value: unknown): boolean {
  return new RegExp(`^\\d{${PROJECT_INVITE_CODE_LENGTH}}$`).test(typeof value === "string" ? value : "");
}

export function formatProjectInviteCode(value: unknown): string {
  const normalized = normalizeProjectInviteCode(value);
  return normalized.length <= 3
    ? normalized
    : `${normalized.slice(0, 3)} ${normalized.slice(3)}`;
}
