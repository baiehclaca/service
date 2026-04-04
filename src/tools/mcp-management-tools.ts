import type { McpHub } from '../server/mcp-hub.js';
import type { NotificationStore } from '../gateway/notification-store.js';
import { randomUUID } from 'node:crypto';

/** Result of listing connected MCPs */
export interface McpConnectionInfo {
  id: string;
  name: string;
  available: boolean;
}

/**
 * MCP management tools: connect, disconnect, and list downstream MCPs.
 * These are exposed as service__ MCP tools for agents.
 */
export class McpManagementTools {
  private hub: McpHub;
  private store: NotificationStore;

  constructor(hub: McpHub, store: NotificationStore) {
    this.hub = hub;
    this.store = store;
  }

  /** Connect a new downstream MCP server. A-MCP-14 */
  async connectMcp(name: string, command: string, args: string[] = []): Promise<{
    success: boolean;
    id: string;
    toolsAdded: number;
  }> {
    const id = randomUUID();
    this.store.saveMcpConnection(id, name, command, args, 'active');
    try {
      const { toolsAdded } = await this.hub.addProxyById(id, name, command, args);
      return { success: true, id, toolsAdded };
    } catch (error) {
      this.store.saveMcpConnection(id, name, command, args, 'error');
      throw error;
    }
  }

  /** Disconnect a downstream MCP by its ID. */
  async disconnectMcp(id: string): Promise<{ success: boolean }> {
    await this.hub.removeProxyById(id);
    this.store.deleteMcpConnection(id);
    return { success: true };
  }

  /** List all currently connected downstream MCPs. */
  listConnectedMcps(): McpConnectionInfo[] {
    const proxies = this.hub.getProxies();
    const result: McpConnectionInfo[] = [];
    for (const [id, proxy] of proxies) {
      result.push({
        id,
        name: proxy.name,
        available: proxy.available,
      });
    }
    return result;
  }
}
