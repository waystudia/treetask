import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "../../supabase/migrations");
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql"));
if (files.length === 0) throw new Error("No Supabase migrations found");

const sql = (await Promise.all(files.map((file) => readFile(resolve(migrationsDir, file), "utf8")))).join("\n");
const requiredTables = [
  "profiles", "areas", "projects", "project_members", "tasks", "task_checklist_items",
  "outcomes", "outcome_evidence", "project_files", "canvas_documents",
  "photo_annotations", "notifications", "activity_logs", "platform_admins",
  "project_join_invites", "project_join_claims", "project_join_attempts",
];

for (const table of requiredTables) {
  if (!sql.includes(`alter table public.${table} enable row level security;`)) {
    throw new Error(`RLS is not explicitly enabled for public.${table}`);
  }
}

const allowedServiceRoleGrant = "grant select, insert, update, delete on table public.project_join_invites, public.project_join_claims, public.project_join_attempts to service_role";
const serviceRoleGrants = sql
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase())
  .filter((statement) => /\bto service_role$/.test(statement));
if (serviceRoleGrants.some((statement) => statement !== allowedServiceRoleGrant)) {
  throw new Error("Only the backend invitation tables may be granted to service_role");
}
if (!sql.includes("revoke all on all tables in schema public from anon;")) {
  throw new Error("Anonymous public-table grants are not explicitly revoked");
}

console.log(`Validated ${files.length} migration(s): ${requiredTables.length} RLS tables`);
