import { Server } from "@hocuspocus/server";
import { createClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import { parseCanvasDocumentName } from "./document-name";

interface ConnectionContext {
  userId: string;
  projectId: string;
  canvasId: string;
  role: "owner" | "admin" | "reviewer" | "member" | "viewer";
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowAnonymousDev =
  process.env.NODE_ENV !== "production" &&
  process.env.COLLAB_ALLOW_ANONYMOUS_DEV === "true";

const admin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

if (!admin && !allowAnonymousDev) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the collaboration server",
  );
}

const decodeBytea = (value: unknown): Uint8Array | null => {
  if (typeof value !== "string") return null;
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  return new Uint8Array(Buffer.from(hex, "hex"));
};

const server = new Server<ConnectionContext>({
  name: "treetask-collab",
  port: Number(process.env.PORT ?? 1234),
  timeout: 60_000,
  debounce: 2_000,
  maxDebounce: 10_000,
  quiet: true,
  websocketOptions: { maxPayload: 2 * 1024 * 1024 },
  maxUnauthenticatedQueueSize: 512 * 1024,
  maxUnauthenticatedQueueMessages: 200,
  maxPendingDocuments: 5,

  async onAuthenticate({ token, documentName, connectionConfig }) {
    const { projectId, canvasId } = parseCanvasDocumentName(documentName);
    if (allowAnonymousDev && !admin) {
      return { userId: "local-user", projectId, canvasId, role: "owner" };
    }
    if (!admin || !token) throw new Error("Authentication required");

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Invalid Supabase access token");

    const { data: membership, error: membershipError } = await admin
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (membershipError || !membership) throw new Error("Project access denied");

    const role = membership.role as ConnectionContext["role"];
    if (role === "viewer") connectionConfig.readOnly = true;
    return { userId: userData.user.id, projectId, canvasId, role };
  },

  async onLoadDocument({ documentName }) {
    if (!admin) return new Y.Doc();
    const { canvasId } = parseCanvasDocumentName(documentName);
    const { data, error } = await admin
      .from("canvas_documents")
      .select("yjs_snapshot")
      .eq("id", canvasId)
      .maybeSingle();
    if (error) throw error;
    const document = new Y.Doc();
    const update = decodeBytea(data?.yjs_snapshot);
    if (update) Y.applyUpdate(document, update);
    return document;
  },

  async onStoreDocument({ document, documentName, lastContext }) {
    if (!admin) return;
    const parsed = parseCanvasDocumentName(documentName);
    const context = lastContext as ConnectionContext | undefined;
    if (!context || context.projectId !== parsed.projectId) {
      throw new Error("Missing authenticated store context");
    }
    const snapshot = Y.encodeStateAsUpdate(document);
    const { error } = await admin.from("canvas_documents").upsert({
      id: parsed.canvasId,
      project_id: parsed.projectId,
      name: "Основная доска",
      yjs_snapshot: `\\x${Buffer.from(snapshot).toString("hex")}`,
      snapshot_version: Date.now(),
      updated_by: context.userId,
    });
    if (error) throw error;
  },
});

await server.listen();
