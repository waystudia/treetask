import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { bearerToken } from "./auth";
import { createTreeTaskMcpServer } from "./server";

async function startStdio(): Promise<void> {
  const token = process.env.TREETASK_ACCESS_TOKEN?.trim();
  if (!token) throw new Error("Для stdio задайте TREETASK_ACCESS_TOKEN");
  const server = await createTreeTaskMcpServer(token);
  await server.connect(new StdioServerTransport());
}

async function startHttp(): Promise<void> {
  const host = process.env.HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.PORT ?? 3333);
  const publicUrl = process.env.MCP_PUBLIC_URL?.replace(/\/$/, "") || `http://${host}:${port}`;
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Для HTTP MCP задайте SUPABASE_URL");
  const resourceMetadataUrl = `${publicUrl}/.well-known/oauth-protected-resource`;
  const app = createMcpExpressApp({ host });
  app.get("/health", (_req: Request, res: Response) => res.json({ ok: true, service: "treetask-mcp" }));
  app.get("/.well-known/oauth-protected-resource", (_req: Request, res: Response) => res.json({
    resource: publicUrl,
    authorization_servers: [`${supabaseUrl}/auth/v1`],
    scopes_supported: ["openid", "email", "profile"],
    resource_documentation: "https://waystudia.github.io/treetask/",
  }));
  app.post("/mcp", async (req: Request, res: Response) => {
    const token = bearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${resourceMetadataUrl}", scope="openid email profile"`,
      ).json({ error: "Требуется вход в TreeTask" });
      return;
    }
    let server: McpServer | undefined;
    let transport: StreamableHTTPServerTransport | undefined;
    try {
      server = await createTreeTaskMcpServer(token);
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: error instanceof Error ? error.message : "Ошибка TreeTask MCP" },
        id: null,
      });
    } finally {
      res.on("close", () => {
        void transport?.close();
        void server?.close();
      });
    }
  });
  app.get("/mcp", (_req: Request, res: Response) => res.status(405).json({ error: "Используйте POST /mcp" }));
  app.delete("/mcp", (_req: Request, res: Response) => res.status(405).json({ error: "Stateless MCP" }));
  app.listen(port, host, () => process.stderr.write(`TreeTask MCP: http://${host}:${port}/mcp\n`));
}

if (process.env.MCP_TRANSPORT === "stdio") await startStdio();
else await startHttp();
