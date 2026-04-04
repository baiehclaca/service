import type { McpHub } from '../server/mcp-hub.js';
import type { IntegrationRegistry } from '../integrations/registry.js';

/**
 * Help tools: dynamic markdown guide of all available tools.
 * A-MCP-16
 */
export class HelpTools {
  private hub: McpHub;
  private registry: IntegrationRegistry;

  constructor(hub: McpHub, registry: IntegrationRegistry) {
    this.hub = hub;
    this.registry = registry;
  }

  /** Generate a formatted help guide of all available tools. */
  async getHelp(): Promise<string> {
    const lines: string[] = [];
    lines.push('# SERVICE MCP Tools\n');
    lines.push('SERVICE is a unified MCP hub and notification center.\n');

    // Built-in tools
    lines.push('## Built-in Tools\n');
    lines.push('### Notification Tools');
    lines.push('- **service__get_notifications** — Get recent notifications. Params: `limit?` (number), `source?` (string)');
    lines.push('- **service__get_unread_count** — Get unread notification count. Params: `source?` (string)');
    lines.push('- **service__mark_notification_read** — Mark a notification as read. Params: `id` (string)');
    lines.push('- **service__search_notifications** — Full-text search across notifications. Params: `query` (string), `limit?` (number)');
    lines.push('');

    lines.push('### Memory Tools');
    lines.push('- **service__save_note** — Save a key-value note for cross-session memory. Params: `key` (string), `content` (string)');
    lines.push('- **service__get_note** — Retrieve a saved note by key. Params: `key` (string)');
    lines.push('- **service__list_notes** — List all saved notes');
    lines.push('- **service__delete_note** — Delete a saved note. Params: `key` (string)');
    lines.push('');

    lines.push('### MCP Management Tools');
    lines.push('- **service__connect_mcp** — Add a new downstream MCP server at runtime. Params: `name` (string), `command` (string), `args?` (string[])');
    lines.push('- **service__disconnect_mcp** — Remove a downstream MCP. Params: `id` (string)');
    lines.push('- **service__list_connected_mcps** — List all connected downstream MCPs');
    lines.push('');

    lines.push('### Status & Help');
    lines.push('- **service__service_status** — Get full daemon health: version, uptime, integration count, MCP count');
    lines.push('- **service__help** — This help guide');
    lines.push('');

    // Downstream MCP tools
    const proxies = this.hub.getProxies();
    if (proxies.size > 0) {
      lines.push('## Downstream MCP Tools\n');
      for (const [mcpId, proxy] of proxies) {
        if (!proxy.available) continue;
        try {
          const tools = await proxy.listTools();
          if (tools.length > 0) {
            lines.push(`### ${mcpId}`);
            for (const t of tools) {
              lines.push(`- **${mcpId}__${t.name}** — ${t.description ?? 'No description'}`);
            }
            lines.push('');
          }
        } catch {
          lines.push(`### ${mcpId} (unavailable)`);
          lines.push('');
        }
      }
    }

    // Platform tools from integrations
    const loadedIntegrations = this.registry.getLoadedIntegrations();
    const platformToolEntries: string[] = [];
    for (const [instanceId, loaded] of loadedIntegrations) {
      const tools = loaded.adapter.getTools();
      for (const tool of tools) {
        platformToolEntries.push(`- **${instanceId}__${tool.name}** — ${tool.description}`);
      }
    }
    if (platformToolEntries.length > 0) {
      lines.push('## Platform Integration Tools\n');
      lines.push(...platformToolEntries);
      lines.push('');
    }

    return lines.join('\n');
  }
}
