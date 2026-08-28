import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const migrationsDir = resolve(process.cwd(), "../../supabase/migrations");
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql"));
if (files.length === 0) throw new Error("No Supabase migrations found");

const sql = (await Promise.all(files.map((file) => readFile(resolve(migrationsDir, file), "utf8")))).join("\n");
const requiredTables = [
  "profiles", "projects", "project_members", "tasks", "task_checklist_items",
  "outcomes", "outcome_evidence", "project_files", "canvas_documents",
  "photo_annotations", "notifications", "activity_logs", "platform_admins",
];

for (const table of requiredTables) {
  if (!sql.includes(`alter table public.${table} enable row level security;`)) {
    throw new Error(`RLS is not explicitly enabled for public.${table}`);
  }
}

if (/grant\s+.*service_role/i.test(sql)) {
  throw new Error("Migration must not add explicit service_role grants");
}
if (!sql.includes("revoke all on all tables in schema public from anon;")) {
  throw new Error("Anonymous public-table grants are not explicitly revoked");
}

console.log(`Validated ${files.length} migration(s): ${requiredTables.length} RLS tables`);
