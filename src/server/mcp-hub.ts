import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StdioMcpProxy } from './proxy.js';
import { z } from 'zod';
import type { NotificationStore } from '../gateway/notification-store.js';
import type { MemoryTools } from '../tools/memory-tools.js';
import type { McpManagementTools } from '../tools/mcp-management-tools.js';
import type { SearchTools } from '../tools/search-tools.js';
import type { StatusTools } from '../tools/status-tools.js';
import type { HelpTools } from '../tools/help-tools.js';
import type { PlatformToolsManager } from '../tools/platform-tools.js';

/** Per-session tracking: server + registered dynamic tool handles */
interface SessionEntry {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  /** mcpId → list of RegisteredTool handles for that proxy's tools */
  proxyToolHandles: Map<string, RegisteredTool[]>;
  /** dynamic tool name → RegisteredTool handle (for removeTool cleanup) */
  dynamicToolHandles: Map<string, RegisteredTool>;
}

/**
 * MCP Hub: aggregates tools from downstream MCPs and exposes them
 * via a single Streamable HTTP endpoint at POST /mcp on port 3333.
 */
export class McpHub {
  private proxies: Map<string, StdioMcpProxy> = new Map();
  /** sessionId → session entry (server + transport + per-proxy tool handles) */
  private sessions: Map<string, SessionEntry> = new Map();
  private startTime: Date = new Date();
  private notificationStore: NotificationStore | null = null;
  private memoryTools: MemoryTools | null = null;
  private mcpManagementTools: McpManagementTools | null = null;
  private searchTools: SearchTools | null = null;
  private statusTools: StatusTools | null = null;
  private helpTools: HelpTools | null = null;
  private platformToolsManager: PlatformToolsManager | null = null;

  /** Dynamically registered custom tools: name → { desc, schema, handler } */
  private dynamicTools: Map<string, {
    description: string;
    inputSchema: Record<string, unknown>;
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  }> = new Map();

  /** Set the notification store for notification tools */
  setNotificationStore(store: NotificationStore): void {
    this.notificationStore = store;
  }

  /** Set the memory tools module */
  setMemoryTools(tools: MemoryTools): void {
    this.memoryTools = tools;
  }

  /** Set the MCP management tools module */
  setMcpManagementTools(tools: McpManagementTools): void {
    this.mcpManagementTools = tools;
  }

  /** Set the search tools module */
  setSearchTools(tools: SearchTools): void {
    this.searchTools = tools;
  }

  /** Set the status tools module */
  setStatusTools(tools: StatusTools): void {
    this.statusTools = tools;
  }

  /** Set the help tools module */
  setHelpTools(tools: HelpTools): void {
    this.helpTools = tools;
  }

  /** Set the platform tools manager for integration tool registration */
  setPlatformToolsManager(manager: PlatformToolsManager): void {
    this.platformToolsManager = manager;
  }

  /**
   * Dynamically add a tool at runtime. Registers on all active sessions.
   */
  addTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
  ): void {
    this.dynamicTools.set(name, { description, inputSchema, handler });
    // Register on all active sessions and store handles for later removal
    for (const [, session] of this.sessions) {
      try {
        const handle = session.server.registerTool(
          name,
          { description, inputSchema: z.object({}).passthrough() },
          async (args: Record<string, unknown>) => handler(args),
        );
        session.dynamicToolHandles.set(name, handle);
      } catch {
        // Tool might already be registered on this session
      }
    }
  }

  /**
   * Dynamically remove a tool at runtime.
   * Removes from the dynamic tool map AND calls handle.remove() on all active sessions.
   */
  removeTool(name: string): void {
    this.dynamicTools.delete(name);
    // Remove tool handle from all active sessions so tools/list no longer shows it
    for (const [, session] of this.sessions) {
      const handle = session.dynamicToolHandles.get(name);
      if (handle) {
        try { handle.remove(); } catch { /* ignore */ }
        session.dynamicToolHandles.delete(name);
      }
    }
  }

  /** Get the number of active MCP sessions */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /** Create the express app with the MCP endpoint */
  createApp(): express.Express {
    const app = express();
    app.use(express.json());

    // Remove NextFunction import - no longer needed for middleware
    // All Accept header injection is handled in the route handler itself

    // Handle all MCP Streamable HTTP requests
    app.all('/mcp', async (req: Request, res: Response) => {
      try {
        // Inject Accept header if missing or incomplete.
        // @hono/node-server reads rawHeaders (socket-level) not req.headers (Express-mutated),
        // so we wrap with a Proxy to inject at the rawHeaders level.
        // The MCP SDK requires both application/json and text/event-stream in Accept.
        const accept = req.headers.accept ?? '';
        const needsInject = !accept.includes('application/json') || !accept.includes('text/event-stream');
        const mcpReq = !needsInject ? req : new Proxy(req, {
          get(target, prop) {
            if (prop === 'rawHeaders') {
              // Filter out any existing Accept header then inject the correct one
              const raw = [...target.rawHeaders];
              const filtered: string[] = [];
              for (let i = 0; i < raw.length; i += 2) {
                if (raw[i]?.toLowerCase() !== 'accept') {
                  filtered.push(raw[i]!, raw[i + 1]!);
                }
              }
              filtered.push('Accept', 'application/json, text/event-stream');
              return filtered;
            }
            if (prop === 'headers') {
              return { ...target.headers, accept: 'application/json, text/event-stream' };
            }
            const val = (target as unknown as Record<string | symbol, unknown>)[prop];
            return typeof val === 'function' ? val.bind(target) : val;
          },
        }) as Request;

        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.sessions.has(sessionId)) {
          transport = this.sessions.get(sessionId)!.transport;
        } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
          // New session — create McpServer + transport
          const proxyToolHandles = new Map<string, RegisteredTool[]>();
          const dynamicToolHandles = new Map<string, RegisteredTool>();
          const server = this.createMcpServer(dynamicToolHandles);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid: string) => {
              this.sessions.set(sid, { server, transport, proxyToolHandles, dynamicToolHandles });
              // Register this session's server with PlatformToolsManager so
              // integration tools (loaded now or in future) are pushed into it
              if (this.platformToolsManager) {
                this.platformToolsManager.registerSession(sid, server);
              }
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) {
              this.sessions.delete(sid);
              // Unregister from PlatformToolsManager to avoid memory leaks
              if (this.platformToolsManager) {
                this.platformToolsManager.unregisterSession(sid);
              }
            }
          };

          await server.connect(transport);
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Bad Request: No valid session ID provided',
            },
            id: null,
          });
          return;
        }

        await transport.handleRequest(mcpReq, res, req.body);
      } catch {
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error',
            },
            id: null,
          });
        }
      }
    });

    return app;
  }

  /** Create a new McpServer instance with all current tools registered */
  private createMcpServer(dynamicToolHandles?: Map<string, RegisteredTool>): McpServer {
    const server = new McpServer(
      { name: 'service-mcp', version: '1.0.0' },
      { capabilities: { tools: {}, logging: {} } },
    );

    // Register built-in tools
    this.registerBuiltinTools(server, dynamicToolHandles);

    // Register tools from all connected proxies
    this.registerProxyTools(server);

    return server;
  }

  /** Register built-in service__ tools */
  private registerBuiltinTools(server: McpServer, dynamicToolHandles?: Map<string, RegisteredTool>): void {
    // ─── Status Tool — A-MCP-10 ──────────────────────────
    server.registerTool(
      'service__service_status',
      {
        description: 'Get SERVICE daemon health and status information including version, uptime, and integration count',
      },
      async () => {
        if (this.statusTools) {
          const status = this.statusTools.getStatus();
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(status, null, 2) }],
          };
        }
        // Fallback if status tools not set
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        const connectedMcps = Array.from(this.proxies.entries())
          .map(([id, p]) => ({ id, available: p.available }));
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'running',
              version: '1.0.0',
              uptime,
              connectedMcps,
              activeSessions: this.sessions.size,
            }, null, 2),
          }],
        };
      },
    );

    // ─── Help Tool — A-MCP-16 ──────────────────────────
    server.registerTool(
      'service__help',
      {
        description: 'Get a formatted guide of all available tools grouped by category',
      },
      async () => {
        if (this.helpTools) {
          const help = await this.helpTools.getHelp();
          return { content: [{ type: 'text' as const, text: help }] };
        }
        return { content: [{ type: 'text' as const, text: '# SERVICE MCP Tools\n\nHelp not yet initialized.' }] };
      },
    );

    // ─── Notification Tools — A-MCP-06, A-MCP-07, A-MCP-08, A-MCP-09 ────
    server.registerTool(
      'service__get_notifications',
      {
        description: 'Get recent notifications from the notification store',
        inputSchema: {
          limit: z.number().optional().describe('Maximum number of notifications to return (default 50)'),
          source: z.string().optional().describe('Filter by source integration ID'),
        },
      },
      async (args: { limit?: number; source?: string }) => {
        if (!this.notificationStore) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Notification store not initialized' }) }] };
        }
        const notifications = this.notificationStore.getRecent(args.limit ?? 50, args.source);
        return { content: [{ type: 'text' as const, text: JSON.stringify(notifications, null, 2) }] };
      },
    );

    server.registerTool(
      'service__get_unread_count',
      {
        description: 'Get the count of unread notifications',
        inputSchema: {
          source: z.string().optional().describe('Filter by source integration ID'),
        },
      },
      async (args: { source?: string }) => {
        if (!this.notificationStore) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Notification store not initialized' }) }] };
        }
        const count = this.notificationStore.getUnreadCount(args.source);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ unread: count }) }] };
      },
    );

    server.registerTool(
      'service__mark_notification_read',
      {
        description: 'Mark a notification as read by its ID',
        inputSchema: {
          id: z.string().describe('The notification ID to mark as read'),
        },
      },
      async (args: { id: string }) => {
        if (!this.notificationStore) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Notification store not initialized' }) }] };
        }
        const success = this.notificationStore.markRead(args.id);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success, id: args.id }) }] };
      },
    );

    // ─── Memory Tools — A-MCP-11, A-MCP-12, A-MCP-13 ────
    server.registerTool(
      'service__save_note',
      {
        description: 'Save a key-value note for cross-session agent memory',
        inputSchema: {
          key: z.string().describe('Unique key for the note'),
          content: z.string().describe('Note content to save'),
        },
      },
      async (args: { key: string; content: string }) => {
        if (!this.memoryTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Memory tools not initialized' }) }] };
        }
        const result = this.memoryTools.saveNote(args.key, args.content);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      },
    );

    server.registerTool(
      'service__get_note',
      {
        description: 'Retrieve a previously saved note by its key',
        inputSchema: {
          key: z.string().describe('The key of the note to retrieve'),
        },
      },
      async (args: { key: string }) => {
        if (!this.memoryTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Memory tools not initialized' }) }] };
        }
        const note = this.memoryTools.getNote(args.key);
        if (!note) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Note not found', key: args.key }) }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(note) }] };
      },
    );

    server.registerTool(
      'service__list_notes',
      {
        description: 'List all saved notes',
      },
      async () => {
        if (!this.memoryTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Memory tools not initialized' }) }] };
        }
        const notes = this.memoryTools.listNotes();
        return { content: [{ type: 'text' as const, text: JSON.stringify(notes, null, 2) }] };
      },
    );

    server.registerTool(
      'service__delete_note',
      {
        description: 'Delete a saved note by its key',
        inputSchema: {
          key: z.string().describe('The key of the note to delete'),
        },
      },
      async (args: { key: string }) => {
        if (!this.memoryTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Memory tools not initialized' }) }] };
        }
        const deleted = this.memoryTools.deleteNote(args.key);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: deleted, key: args.key }) }] };
      },
    );

    // ─── MCP Management Tools — A-MCP-14 ────
    server.registerTool(
      'service__connect_mcp',
      {
        description: 'Add a new downstream MCP server at runtime and make its tools immediately available',
        inputSchema: {
          name: z.string().describe('Human-readable name for the MCP server'),
          command: z.string().describe('Command to spawn the MCP process (e.g. "npx")'),
          args: z.array(z.string()).optional().describe('Arguments for the command'),
        },
      },
      async (args: { name: string; command: string; args?: string[] }) => {
        if (!this.mcpManagementTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MCP management tools not initialized' }) }] };
        }
        try {
          const result = await this.mcpManagementTools.connectMcp(args.name, args.command, args.args ?? []);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
        }
      },
    );

    server.registerTool(
      'service__disconnect_mcp',
      {
        description: 'Remove a downstream MCP server by its ID',
        inputSchema: {
          id: z.string().describe('The ID of the MCP connection to remove'),
        },
      },
      async (args: { id: string }) => {
        if (!this.mcpManagementTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MCP management tools not initialized' }) }] };
        }
        try {
          const result = await this.mcpManagementTools.disconnectMcp(args.id);
          return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
        } catch (error) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
        }
      },
    );

    server.registerTool(
      'service__list_connected_mcps',
      {
        description: 'List all currently connected downstream MCP servers',
      },
      async () => {
        if (!this.mcpManagementTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'MCP management tools not initialized' }) }] };
        }
        const mcps = this.mcpManagementTools.listConnectedMcps();
        return { content: [{ type: 'text' as const, text: JSON.stringify(mcps, null, 2) }] };
      },
    );

    // ─── Search Tools — A-MCP-15 ────
    server.registerTool(
      'service__search_notifications',
      {
        description: 'Full-text search across notification history',
        inputSchema: {
          query: z.string().describe('Search query string (FTS5 syntax supported)'),
          limit: z.number().optional().describe('Maximum results to return (default 50)'),
        },
      },
      async (args: { query: string; limit?: number }) => {
        if (!this.searchTools) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Search tools not initialized' }) }] };
        }
        const results = this.searchTools.searchNotifications(args.query, args.limit ?? 50);
        return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
      },
    );

    // ─── Dynamic Tools ────
    for (const [name, tool] of this.dynamicTools) {
      try {
        const handle = server.registerTool(
          name,
          { description: tool.description, inputSchema: z.object({}).passthrough() },
          async (args: Record<string, unknown>) => tool.handler(args),
        );
        // Track handle so removeTool() can remove tools that were registered at
        // session-init time (i.e. tools that existed before the session started)
        if (dynamicToolHandles) {
          dynamicToolHandles.set(name, handle);
        }
      } catch {
        // Skip if already registered
      }
    }
  }

  /** Register tools from all connected downstream MCPs onto a server at session init time */
  private registerProxyTools(server: McpServer): void {
    for (const [mcpId, proxy] of this.proxies) {
      if (!proxy.available) continue;

      // We need synchronous access to tools, so we use the cached list
      // The proxy refreshes tools on connect
      proxy.listTools().then(tools => {
        for (const tool of tools) {
          const namespacedName = `${mcpId}__${tool.name}`;
          try {
            server.registerTool(
              namespacedName,
              {
                description: tool.description ?? `Tool from ${mcpId}`,
                // Use passthrough schema so all args are forwarded to the downstream MCP.
                // Downstream MCPs use raw JSON schemas; we validate there, not here.
                inputSchema: z.object({}).passthrough(),
              },
              async (args: Record<string, unknown>) => {
                const result = await proxy.callTool(tool.name, args);
                return result as { content: Array<{ type: 'text'; text: string }> };
              },
            );
          } catch {
            // Tool registration might fail if schema is incompatible, skip
          }
        }
      }).catch(() => {
        // Proxy might not be available
      });
    }
  }

  /**
   * Register tools from a single proxy onto a single server instance.
   * Returns an array of RegisteredTool handles (for later removal).
   */
  private async registerProxyToolsOnServer(
    mcpId: string,
    proxy: StdioMcpProxy,
    server: McpServer,
  ): Promise<RegisteredTool[]> {
    const handles: RegisteredTool[] = [];
    try {
      const tools = await proxy.listTools();
      for (const tool of tools) {
        const namespacedName = `${mcpId}__${tool.name}`;
        try {
          const handle = server.registerTool(
            namespacedName,
            {
              description: tool.description ?? `Tool from ${mcpId}`,
              // Use passthrough schema so all args are forwarded to the downstream MCP.
              // Downstream MCPs use raw JSON schemas; we validate there, not here.
              inputSchema: z.object({}).passthrough(),
            },
            async (args: Record<string, unknown>) => {
              const result = await proxy.callTool(tool.name, args);
              return result as { content: Array<{ type: 'text'; text: string }> };
            },
          );
          handles.push(handle);
        } catch {
          // Tool registration might fail if schema is incompatible, skip
        }
      }
    } catch {
      // Proxy might not be available
    }
    return handles;
  }

  /** Register a downstream MCP proxy (also dynamically registers tools on active sessions) */
  async addProxy(name: string, command: string, args: string[] = []): Promise<StdioMcpProxy> {
    if (this.proxies.has(name)) {
      throw new Error(`MCP proxy '${name}' already exists`);
    }
    const proxy = new StdioMcpProxy(name, command, args);
    this.proxies.set(name, proxy);
    await proxy.connect();

    // Dynamically register tools on all active sessions
    for (const [, session] of this.sessions) {
      const handles = await this.registerProxyToolsOnServer(name, proxy, session.server);
      if (handles.length > 0) {
        session.proxyToolHandles.set(name, handles);
      }
    }

    return proxy;
  }

  /**
   * Register a downstream MCP proxy identified by a stable ID.
   * Returns the number of tools available after connecting.
   * Dynamically registers the new tools on all active MCP sessions.
   */
  async addProxyById(id: string, name: string, command: string, args: string[] = []): Promise<{ toolsAdded: number }> {
    if (this.proxies.has(id)) {
      throw new Error(`MCP proxy '${id}' already exists`);
    }
    const proxy = new StdioMcpProxy(name, command, args);
    this.proxies.set(id, proxy);
    await proxy.connect();

    let toolsAdded = 0;
    try {
      const tools = await proxy.listTools();
      toolsAdded = tools.length;

      // Dynamically register the new proxy's tools on all active MCP sessions
      // so both existing sessions (tools/list sees the update immediately) and
      // new sessions (createMcpServer → registerProxyTools) will see them.
      for (const [, session] of this.sessions) {
        const handles = await this.registerProxyToolsOnServer(id, proxy, session.server);
        if (handles.length > 0) {
          session.proxyToolHandles.set(id, handles);
        }
      }
    } catch { /* ignore */ }
    return { toolsAdded };
  }

  /** Remove a downstream MCP proxy by ID and deregister its tools from all active sessions */
  async removeProxyById(id: string): Promise<void> {
    const proxy = this.proxies.get(id);
    if (proxy) {
      // Remove tools from all active sessions first
      for (const [, session] of this.sessions) {
        const handles = session.proxyToolHandles.get(id);
        if (handles) {
          for (const handle of handles) {
            try { handle.remove(); } catch { /* ignore */ }
          }
          session.proxyToolHandles.delete(id);
        }
      }
      await proxy.disconnect();
      this.proxies.delete(id);
    }
  }

  /** Remove a downstream MCP proxy (deregisters tools from all active sessions) */
  async removeProxy(name: string): Promise<void> {
    const proxy = this.proxies.get(name);
    if (proxy) {
      // Remove tools from all active sessions
      for (const [, session] of this.sessions) {
        const handles = session.proxyToolHandles.get(name);
        if (handles) {
          for (const handle of handles) {
            try { handle.remove(); } catch { /* ignore */ }
          }
          session.proxyToolHandles.delete(name);
        }
      }
      await proxy.disconnect();
      this.proxies.delete(name);
    }
  }

  /** Get all connected proxies */
  getProxies(): Map<string, StdioMcpProxy> {
    return this.proxies;
  }

  /** Gracefully shut down all transports and proxies */
  async shutdown(): Promise<void> {
    // Close all transports
    for (const [, session] of this.sessions) {
      try {
        await session.transport.close();
      } catch {
        // Ignore close errors during shutdown
      }
    }
    this.sessions.clear();

    // Disconnect all proxies
    for (const [, proxy] of this.proxies) {
      try {
        await proxy.disconnect();
      } catch {
        // Ignore disconnect errors during shutdown
      }
    }
    this.proxies.clear();
  }
}
