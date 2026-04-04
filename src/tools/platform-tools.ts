import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import { z } from 'zod';

/**
 * PlatformToolsManager: auto-generates MCP tools from active integration
 * adapters. Registers and deregisters dynamically on integration load/unload.
 */
export class PlatformToolsManager {
  private registry: IntegrationRegistry;
  /** instanceId → array of registered tool handles (for removal) */
  private toolHandles: Map<string, RegisteredTool[]> = new Map();
  /** All active McpServer instances that tools should be registered on */
  private servers: Set<McpServer> = new Set();
  /** sessionId → McpServer (for named session registration/unregistration) */
  private sessionServers: Map<string, McpServer> = new Map();

  constructor(registry: IntegrationRegistry) {
    this.registry = registry;
  }

  /** Register a McpServer so platform tools are added to it. */
  addServer(server: McpServer): void {
    this.servers.add(server);
    // Register all currently loaded integration tools
    this.syncAllIntegrations(server);
  }

  /** Remove a McpServer reference. */
  removeServer(server: McpServer): void {
    this.servers.delete(server);
  }

  /**
   * Register a session by ID + server. Platform tools from all currently
   * loaded integrations are immediately applied to the server.
   * Called by McpHub when a new MCP session is created.
   */
  registerSession(sessionId: string, server: McpServer): void {
    this.sessionServers.set(sessionId, server);
    this.addServer(server);
  }

  /**
   * Unregister a session and remove its server reference.
   * Called by McpHub when a session ends.
   */
  unregisterSession(sessionId: string): void {
    const server = this.sessionServers.get(sessionId);
    if (server) {
      this.removeServer(server);
      this.sessionServers.delete(sessionId);
    }
  }

  /**
   * Sync tools from all loaded integrations onto a server.
   * Typically called when a new MCP session starts.
   */
  private syncAllIntegrations(server: McpServer): void {
    for (const [instanceId, loaded] of this.registry.getLoadedIntegrations()) {
      const tools = loaded.adapter.getTools();
      for (const tool of tools) {
        const toolName = `${instanceId}__${tool.name}`;
        try {
          server.registerTool(
            toolName,
            {
              description: tool.description,
              inputSchema: z.object({}).passthrough(),
            },
            async (args: Record<string, unknown>) => {
              const result = await tool.handler(args);
              return {
                content: [{
                  type: 'text' as const,
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                }],
              };
            },
          );
        } catch {
          // Tool might already be registered, skip
        }
      }
    }
  }

  /**
   * Register tools for a newly loaded integration onto all active servers.
   * Call this when an integration is loaded/enabled.
   */
  registerIntegrationTools(instanceId: string): void {
    const loaded = this.registry.getLoadedIntegrations().get(instanceId);
    if (!loaded) return;

    const tools = loaded.adapter.getTools();
    const handles: RegisteredTool[] = [];

    for (const server of this.servers) {
      for (const tool of tools) {
        const toolName = `${instanceId}__${tool.name}`;
        try {
          const handle = server.registerTool(
            toolName,
            {
              description: tool.description,
              inputSchema: z.object({}).passthrough(),
            },
            async (args: Record<string, unknown>) => {
              const result = await tool.handler(args);
              return {
                content: [{
                  type: 'text' as const,
                  text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                }],
              };
            },
          );
          handles.push(handle);
        } catch {
          // Tool might already be registered, skip
        }
      }
    }

    if (handles.length > 0) {
      this.toolHandles.set(instanceId, handles);
    }
  }

  /**
   * Deregister tools for an unloaded integration from all active servers.
   * Call this when an integration is unloaded/disabled.
   */
  deregisterIntegrationTools(instanceId: string): void {
    const handles = this.toolHandles.get(instanceId);
    if (handles) {
      for (const handle of handles) {
        try { handle.remove(); } catch { /* ignore */ }
      }
      this.toolHandles.delete(instanceId);
    }
  }

  /** Get count of registered platform tools. */
  getToolCount(): number {
    let count = 0;
    for (const handles of this.toolHandles.values()) {
      count += handles.length;
    }
    return count;
  }
}
