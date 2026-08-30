import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  addCanvasNodes,
  deleteCanvasNodes,
  updateCanvasNode,
  type CanvasBoardSnapshot,
} from "@treetask/domain";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createUserClient, getCanvasSnapshot, mutateCanvasSnapshot, verifyUser } from "./canvas-store";

const uuid = z.string().uuid();
const itemType = z.enum(["sticky", "rectangle", "ellipse", "text", "photo", "task", "subproject", "file"]);
const color = z.string().regex(/^#[0-9a-f]{6}$/i, "Нужен цвет вида #RRGGBB");

function result(snapshot: CanvasBoardSnapshot, message: string) {
  return {
    structuredContent: {
      message,
      updatedAt: snapshot.updatedAt,
      nodeCount: snapshot.items.length,
      nodes: snapshot.items.map(({ id, type, text, x, y, width, height, fill, parentId, note }) => ({
        id, type, text, x, y, width, height, fill, parentId, note,
      })),
    },
    content: [{ type: "text" as const, text: message }],
  };
}

export async function createTreeTaskMcpServer(accessToken: string): Promise<McpServer> {
  const client: SupabaseClient = createUserClient(accessToken);
  const userId = await verifyUser(client, accessToken);
  const server = new McpServer(
    { name: "treetask-canvas", version: "0.1.0" },
    {
      instructions:
        "Сначала вызовите list_projects, затем get_canvas. Перед изменением используйте актуальные id узлов. Canvas хранится в TreeTask и защищен RLS участника проекта.",
    },
  );

  server.registerTool("list_projects", {
    title: "Проекты TreeTask",
    description: "Use this when the user wants to choose a TreeTask project before reading or editing its Canvas.",
    inputSchema: { includeArchived: z.boolean().default(false) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ includeArchived }) => {
    let query = client.from("projects").select("id,name,description,goal,current_stage,archived_at").order("updated_at", { ascending: false });
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw error;
    return {
      structuredContent: { projects: data ?? [] },
      content: [{ type: "text", text: `Найдено проектов: ${data?.length ?? 0}.` }],
    };
  });

  server.registerTool("get_canvas", {
    title: "Открыть Canvas",
    description: "Use this when the user wants to inspect the current TreeTask Canvas and get stable node IDs before editing it.",
    inputSchema: { projectId: uuid },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ projectId }) => result(await getCanvasSnapshot(client, projectId), "Canvas загружен."));

  server.registerTool("create_canvas_nodes", {
    title: "Создать элементы Canvas",
    description: "Use this when the user wants to create cards, text, shapes, or a connected mind-map branch on a TreeTask Canvas.",
    inputSchema: {
      projectId: uuid,
      nodes: z.array(z.object({
        key: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
        text: z.string().min(1).max(2_000),
        type: itemType.default("sticky"),
        x: z.number().min(-20_000).max(20_000),
        y: z.number().min(-20_000).max(20_000),
        width: z.number().min(44).max(2_000).default(180),
        height: z.number().min(44).max(2_000).default(110),
        fill: color.default("#dbeafe"),
        parentKey: z.string().min(1).max(80).optional(),
        parentId: z.string().min(1).max(120).optional(),
        note: z.string().max(10_000).optional(),
      })).min(1).max(100),
      mutationId: z.string().uuid().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: false },
  }, async ({ projectId, nodes }) => {
    const ids = new Map(nodes.map((node) => [node.key, randomUUID()]));
    const snapshot = await mutateCanvasSnapshot(client, userId, projectId, (current) => addCanvasNodes(current, nodes.map((node) => ({
      id: ids.get(node.key)!,
      text: node.text,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      fill: node.fill,
      parentId: node.parentId ?? (node.parentKey ? ids.get(node.parentKey) : undefined),
      note: node.note,
    }))));
    return result(snapshot, `Добавлено элементов: ${nodes.length}.`);
  });

  server.registerTool("update_canvas_node", {
    title: "Изменить элемент Canvas",
    description: "Use this when the user wants to rename, move, resize, recolor, reconnect, or annotate one existing Canvas node.",
    inputSchema: {
      projectId: uuid,
      nodeId: z.string().min(1).max(120),
      patch: z.object({
        text: z.string().min(1).max(2_000).optional(),
        x: z.number().min(-20_000).max(20_000).optional(),
        y: z.number().min(-20_000).max(20_000).optional(),
        width: z.number().min(44).max(2_000).optional(),
        height: z.number().min(44).max(2_000).optional(),
        fill: color.optional(),
        parentId: z.string().min(1).max(120).optional(),
        note: z.string().max(10_000).optional(),
        fontSize: z.number().min(8).max(160).optional(),
        textColor: color.optional(),
        borderColor: color.optional(),
      }).refine((value) => Object.keys(value).length > 0, "Укажите хотя бы одно изменение"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true },
  }, async ({ projectId, nodeId, patch }) => result(
    await mutateCanvasSnapshot(client, userId, projectId, (current) => updateCanvasNode(current, nodeId, patch)),
    "Элемент Canvas изменён.",
  ));

  server.registerTool("delete_canvas_nodes", {
    title: "Удалить элементы Canvas",
    description: "Use this when the user explicitly wants to delete selected Canvas nodes. Descendants are deleted together with their parent.",
    inputSchema: { projectId: uuid, nodeIds: z.array(z.string().min(1).max(120)).min(1).max(100) },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false, idempotentHint: true },
  }, async ({ projectId, nodeIds }) => result(
    await mutateCanvasSnapshot(client, userId, projectId, (current) => deleteCanvasNodes(current, nodeIds)),
    `Удалено выбранных элементов: ${nodeIds.length}.`,
  ));

  return server;
}
