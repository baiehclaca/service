import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { NotificationStore } from '../gateway/notification-store.js';
import type { PushManager } from '../gateway/push-manager.js';
import type { IntegrationRegistry } from '../integrations/registry.js';
import type { McpHub } from '../server/mcp-hub.js';
import { WebhookIntegration } from '../integrations/builtin/webhook.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import type { NotificationEvent } from '../integrations/types.js';
import { validateIntegrationConfig } from '../utils/config-validator.js';
import { formatError } from '../utils/errors.js';

/**
 * Creates the Express router for the admin API on port 3334.
 * Handles health, SSE events, notifications CRUD, integration CRUD,
 * MCP connections, and webhook ingestion.
 */
export function createAdminRouter(deps: {
  store: NotificationStore;
  pushManager: PushManager;
  registry: IntegrationRegistry;
  eventBus: ServiceEventBus;
  hub?: McpHub;
  startTime: Date;
}): Router {
  const router = Router();
  const { store, pushManager, registry, eventBus, hub, startTime } = deps;

  // ─── Health & Status ────────────────────────────────

  /** GET /health — A-API-01 */
  router.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
    });
  });

  /** GET /api/status — A-API-02, A-CLI-02 */
  router.get('/api/status', (_req: Request, res: Response) => {
    const uptimeSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
    const integrations = store.getAllIntegrations();
    const mcpConnections = store.getMcpConnections();
    res.json({
      status: 'running',
      version: '1.0.0',
      uptime: uptimeSecs,
      startedAt: startTime.toISOString(),
      mcpPort: 3333,
      adminPort: 3334,
      activeIntegrations: registry.getLoadedIntegrations().size,
      connectedMcps: hub ? hub.getProxies().size : 0,
      activeSseConnections: pushManager.getConnectionCount(),
      integrations: integrations.map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        status: i.status,
      })),
      mcpConnections: mcpConnections.map(m => ({
        id: m.id,
        name: m.name,
        status: m.status,
      })),
    });
  });

  // ─── SSE ────────────────────────────────────────────

  /** GET /events — SSE endpoint A-MCP-17, A-MCP-18, A-MCP-19 */
  router.get('/events', (req: Request, res: Response) => {
    pushManager.addConnection(res);
  });

  // ─── Notifications ──────────────────────────────────

  /** GET /api/notifications — A-API-03, A-API-04, A-API-05 */
  router.get('/api/notifications', (req: Request, res: Response) => {
    const limitParam = typeof req.query.limit === 'string' ? req.query.limit : '50';
    const limit = parseInt(limitParam, 10) || 50;
    const source = typeof req.query.source === 'string' ? req.query.source : undefined;
    const unread = req.query.unread === 'true';
    const searchParam = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    if (searchParam) {
      const results = store.search(searchParam, limit);
      res.json(results);
      return;
    }

    const notifications = store.getRecent(limit, source, unread || undefined);
    res.json(notifications);
  });

  /** GET /api/notifications/search — FTS5 search */
  router.get('/api/notifications/search', (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const limitParam = typeof req.query.limit === 'string' ? req.query.limit : '50';
    const limit = parseInt(limitParam, 10) || 50;

    if (!query.trim()) {
      res.json([]);
      return;
    }

    const results = store.search(query, limit);
    res.json(results);
  });

  /** PATCH /api/notifications/:id/read — A-API-06 */
  router.patch('/api/notifications/:id/read', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = store.markRead(id);
    if (updated) {
      res.json({ success: true, id });
    } else {
      res.status(404).json({ error: 'Notification not found' });
    }
  });

  /** POST /api/notifications/mark-all-read — mark all notifications as read */
  router.post('/api/notifications/mark-all-read', (_req: Request, res: Response) => {
    store.markAllRead();
    res.json({ success: true });
  });

  // ─── Integration Types ─────────────────────────────

  /** GET /api/integrations/types — A-API-10 */
  router.get('/api/integrations/types', (_req: Request, res: Response) => {
    const types = registry.getAvailableTypesInfo();
    res.json(types);
  });

  // ─── Integration CRUD ──────────────────────────────

  /** GET /api/integrations — A-API-07 */
  router.get('/api/integrations', (_req: Request, res: Response) => {
    const integrations = store.getAllIntegrations();
    res.json(integrations);
  });

  /** GET /api/integrations/:id — single integration with config */
  router.get('/api/integrations/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const allIntegrations = store.getAllIntegrations();
    const integration = allIntegrations.find(i => i.id === id);
    if (!integration) {
      res.status(404).json({ error: 'Integration not found' });
      return;
    }
    const config = store.loadIntegrationConfig(id) ?? {};
    res.json({ ...integration, config });
  });

  /** POST /api/integrations — A-API-08 */
  router.post('/api/integrations', async (req: Request, res: Response) => {
    const { type, name, config } = req.body as {
      type?: string;
      name?: string;
      config?: Record<string, string>;
    };

    if (!type || !name) {
      res.status(400).json({ error: 'type and name are required' });
      return;
    }

    // Validate type exists
    const typesInfo = registry.getAvailableTypesInfo();
    const typeInfo = typesInfo.find(t => t.type === type);
    if (!typeInfo) {
      res.status(400).json({
        error: `Unknown integration type: ${type}`,
        availableTypes: registry.getAvailableTypes(),
      });
      return;
    }

    // Validate config against schema using ajv
    const effectiveConfig = config ?? {};
    const validation = validateIntegrationConfig(effectiveConfig, typeInfo.configSchema);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid configuration',
        validationErrors: validation.errors,
      });
      return;
    }

    const id = randomUUID();

    try {
      await registry.loadIntegration(id, type, effectiveConfig, name);
      res.status(201).json({ id, name, type, status: 'active' });
    } catch (error) {
      res.status(500).json({ error: formatError(error) });
    }
  });

  /** DELETE /api/integrations/:id — A-API-09 */
  router.delete('/api/integrations/:id', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      await registry.deleteIntegration(id);
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: formatError(error) });
    }
  });

  /** POST /api/integrations/:id/enable — A-INT-06 */
  router.post('/api/integrations/:id/enable', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      await registry.enableIntegration(id);
      res.json({ success: true, id, status: 'active' });
    } catch (error) {
      res.status(500).json({ error: formatError(error) });
    }
  });

  /** POST /api/integrations/:id/disable — A-INT-06 */
  router.post('/api/integrations/:id/disable', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    try {
      await registry.disableIntegration(id);
      res.json({ success: true, id, status: 'inactive' });
    } catch (error) {
      res.status(500).json({ error: formatError(error) });
    }
  });

  // ─── Webhooks ──────────────────────────────────────

  /** POST /webhooks/:integrationId — A-API-14, A-API-15 */
  router.post('/webhooks/:integrationId', (req: Request, res: Response) => {
    const integrationId = String(req.params.integrationId);
    const body = req.body as Record<string, unknown>;

    // Look up adapter in registry
    const adapter = registry.getAdapter(integrationId);
    if (adapter && adapter instanceof WebhookIntegration) {
      adapter.receiveWebhook(body, integrationId);
      res.status(200).json({ ok: true });
      return;
    }

    // No registered adapter — create raw notification
    console.warn(`[SERVICE] Webhook for unregistered integration '${integrationId}' — creating raw notification`);

    const event: NotificationEvent = {
      id: randomUUID(),
      source: integrationId,
      type: (body.type as string) || 'webhook',
      title: (body.title as string) || 'Webhook Event',
      body: (body.body as string) || (body.message as string) || JSON.stringify(body),
      timestamp: new Date().toISOString(),
      metadata: body.metadata as Record<string, unknown> | undefined,
    };

    const stored = store.insert(event);
    eventBus.emitNotification(event);
    res.status(201).json(stored);
  });

  // ─── MCP Connections ───────────────────────────────

  /** GET /api/mcp-connections — A-API-11, A-MCP-UI-01 */
  router.get('/api/mcp-connections', async (_req: Request, res: Response) => {
    const connections = store.getMcpConnections();
    const withCounts = await Promise.all(
      connections.map(async (conn) => ({
        ...conn,
        toolCount: hub ? await hub.getToolCountForProxy(conn.id) : 0,
      }))
    );
    res.json(withCounts);
  });

  /** POST /api/mcp-connections — A-API-12 */
  router.post('/api/mcp-connections', async (req: Request, res: Response) => {
    if (!hub) {
      res.status(503).json({ error: 'MCP hub not available' });
      return;
    }
    const { name, command, args: argsRaw } = req.body as {
      name?: string;
      command?: string;
      args?: string[];
    };

    if (!name || !command) {
      res.status(400).json({ error: 'name and command are required' });
      return;
    }

    const args = Array.isArray(argsRaw) ? argsRaw : [];
    const id = randomUUID();

    try {
      store.saveMcpConnection(id, name, command, args, 'active');
      const { toolsAdded } = await hub.addProxyById(id, name, command, args);
      res.status(201).json({ id, name, toolsAdded });
    } catch (error) {
      store.saveMcpConnection(id, name, command, args, 'error');
      res.status(500).json({ error: formatError(error) });
    }
  });

  /** DELETE /api/mcp-connections/:id — A-API-13 */
  router.delete('/api/mcp-connections/:id', async (req: Request, res: Response) => {
    if (!hub) {
      res.status(503).json({ error: 'MCP hub not available' });
      return;
    }
    const id = String(req.params.id);
    try {
      await hub.removeProxyById(id);
      store.deleteMcpConnection(id);
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: formatError(error) });
    }
  });

  return router;
}
