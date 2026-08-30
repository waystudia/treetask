import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createEmptyCanvasSnapshot,
  parseCanvasSnapshot,
  type CanvasBoardSnapshot,
} from "@treetask/domain";
import * as Y from "yjs";

interface CanvasRow {
  id: string;
  project_id: string;
  snapshot_version: number;
  yjs_snapshot: string | null;
}

function decodeBytea(value: string | null): Uint8Array | null {
  if (!value) return null;
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(Buffer.from(hex, "hex"));
}

function encodeBytea(value: Uint8Array): string {
  return `\\x${Buffer.from(value).toString("hex")}`;
}

export function createUserClient(accessToken: string): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    throw new Error("Для TreeTask MCP нужны SUPABASE_URL и SUPABASE_PUBLISHABLE_KEY");
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function verifyUser(client: SupabaseClient, accessToken: string): Promise<string> {
  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Сессия TreeTask недействительна. Войдите снова.");
  return data.user.id;
}

async function readRow(client: SupabaseClient, projectId: string): Promise<CanvasRow | null> {
  const { data, error } = await client
    .from("canvas_documents")
    .select("id,project_id,snapshot_version,yjs_snapshot")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data as CanvasRow | null;
}

function snapshotFromRow(row: CanvasRow | null): CanvasBoardSnapshot {
  if (!row) return createEmptyCanvasSnapshot();
  const document = new Y.Doc();
  const update = decodeBytea(row.yjs_snapshot);
  if (update) Y.applyUpdate(document, update);
  return parseCanvasSnapshot(document.getMap<string>("canvas").get("snapshot")) ?? createEmptyCanvasSnapshot();
}

export async function getCanvasSnapshot(client: SupabaseClient, projectId: string): Promise<CanvasBoardSnapshot> {
  return snapshotFromRow(await readRow(client, projectId));
}

export async function mutateCanvasSnapshot(
  client: SupabaseClient,
  userId: string,
  projectId: string,
  mutate: (snapshot: CanvasBoardSnapshot) => CanvasBoardSnapshot,
): Promise<CanvasBoardSnapshot> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readRow(client, projectId);
    const next = mutate(snapshotFromRow(row));
    const document = new Y.Doc();
    const existingUpdate = decodeBytea(row?.yjs_snapshot ?? null);
    if (existingUpdate) Y.applyUpdate(document, existingUpdate);
    document.getMap<string>("canvas").set("snapshot", JSON.stringify(next));
    const payload = {
      id: row?.id ?? projectId,
      project_id: projectId,
      name: "Основная доска",
      yjs_snapshot: encodeBytea(Y.encodeStateAsUpdate(document)),
      snapshot_version: Date.now(),
      updated_by: userId,
    };

    if (!row) {
      const { error } = await client.from("canvas_documents").insert(payload);
      if (!error) return next;
      if (error.code === "23505") continue;
      throw error;
    }

    const { data, error } = await client
      .from("canvas_documents")
      .update(payload)
      .eq("id", row.id)
      .eq("snapshot_version", row.snapshot_version)
      .select("id");
    if (error) throw error;
    if ((data?.length ?? 0) === 1) return next;
  }
  throw new Error("Canvas изменился параллельно. Повторите команду.");
}
