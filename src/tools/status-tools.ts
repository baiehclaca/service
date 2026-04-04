import type { McpHub } from '../server/mcp-hub.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import type { PushManager } from '../gateway/push-manager.js';

/** Status information returned by the service_status tool */
export interface ServiceStatusInfo {
  status: string;
  version: string;
  uptime: number;
  startedAt: string;
  activeIntegrations: number;
  connectedMcps: number;
  activeSessions: number;
  activeSseConnections: number;
  integrations: Array<{ id: string; name: string; type: string; status: string }>;
  mcps: Array<{ id: string; name: string; available: boolean }>;
}

/**
 * Status tools: comprehensive health info for the SERVICE daemon.
 * A-MCP-10
 */
export class StatusTools {
  private hub: McpHub;
  private registry: IntegrationRegistry;
  private pushManager: PushManager;
  private startTime: Date;
  private version: string;

  constructor(deps: {
    hub: McpHub;
    registry: IntegrationRegistry;
    pushManager: PushManager;
    startTime: Date;
    version: string;
  }) {
    this.hub = deps.hub;
    this.registry = deps.registry;
    this.pushManager = deps.pushManager;
    this.startTime = deps.startTime;
    this.version = deps.version;
  }

  /** Get full service status information. */
  getStatus(): ServiceStatusInfo {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    const integrations: Array<{ id: string; name: string; type: string; status: string }> = [];
    for (const [instanceId, loaded] of this.registry.getLoadedIntegrations()) {
      integrations.push({
        id: instanceId,
        name: loaded.adapter.name,
        type: loaded.adapter.id,
        status: 'active',
      });
    }

    const mcps: Array<{ id: string; name: string; available: boolean }> = [];
    for (const [id, proxy] of this.hub.getProxies()) {
      mcps.push({
        id,
        name: proxy.name,
        available: proxy.available,
      });
    }

    return {
      status: 'running',
      version: this.version,
      uptime,
      startedAt: this.startTime.toISOString(),
      activeIntegrations: integrations.length,
      connectedMcps: mcps.length,
      activeSessions: 0, // sessions are per-hub, not accessible here without method
      activeSseConnections: this.pushManager.getConnectionCount(),
      integrations,
      mcps,
    };
  }
}
