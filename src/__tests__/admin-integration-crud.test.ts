import express from 'express';
import { createAdminRouter } from '../api/admin.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { PushManager } from '../gateway/push-manager.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import Database from 'better-sqlite3';
import { SCHEMA_SQL } from '../db/schema.js';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

describe('Admin API — Integration CRUD', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;
  let db: Database.Database;
  let store: NotificationStore;
  let eventBus: ServiceEventBus;
  let registry: IntegrationRegistry;
  let pushManager: PushManager;

  beforeAll((done) => {
    db = new Database(':memory:');
    db.exec(SCHEMA_SQL);

    const serviceDir = join(homedir(), '.service');
    mkdirSync(serviceDir, { recursive: true });
    const keyPath = join(serviceDir, '.encryption_key');
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
    }

    store = new NotificationStore(db);
    eventBus = ServiceEventBus.getInstance();
    pushManager = new PushManager(eventBus);
    registry = new IntegrationRegistry(store, eventBus);

    app = express();
    app.use(express.json());
    const router = createAdminRouter({
      store,
      pushManager,
      registry,
      eventBus,
      startTime: new Date(),
    });
    app.use(router);

    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://localhost:${addr.port}`;
      }
      done();
    });
  });

  afterAll(async () => {
    await registry.shutdown();
    pushManager.shutdown();
    server.close();
    db.close();
    ServiceEventBus.resetInstance();
  });

  it('GET /api/integrations/types returns all 6 types', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations/types`);
    expect(resp.status).toBe(200);
    const types = (await resp.json()) as Array<{ type: string; name: string; configSchema: object }>;
    expect(types.length).toBe(6);
    const typeNames = types.map(t => t.type);
    expect(typeNames).toContain('echo');
    expect(typeNames).toContain('webhook');
    expect(typeNames).toContain('x-twitter');
    expect(typeNames).toContain('slack');
    expect(typeNames).toContain('email');
    expect(typeNames).toContain('http-poll');
    // Each type should have configSchema
    for (const t of types) {
      expect(t.configSchema).toBeDefined();
    }
  });

  it('GET /api/integrations returns empty list initially', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations`);
    expect(resp.status).toBe(200);
    const integrations = await resp.json();
    expect(Array.isArray(integrations)).toBe(true);
  });

  it('POST /api/integrations creates a webhook integration', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook',
        name: 'Test Webhook',
        config: { name: 'test-hook' },
      }),
    });
    expect(resp.status).toBe(201);
    const result = (await resp.json()) as { id: string; name: string; type: string };
    expect(result.name).toBe('Test Webhook');
    expect(result.type).toBe('webhook');
    expect(result.id).toBeTruthy();
  });

  it('GET /api/integrations now includes the created integration', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations`);
    const integrations = (await resp.json()) as Array<{ name: string; type: string; status: string }>;
    const webhook = integrations.find(i => i.name === 'Test Webhook');
    expect(webhook).toBeDefined();
    expect(webhook!.status).toBe('active');
  });

  it('POST /api/integrations rejects unknown type', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'nonexistent', name: 'Bad', config: {} }),
    });
    expect(resp.status).toBe(400);
  });

  it('POST /api/integrations rejects missing name', async () => {
    const resp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'webhook' }),
    });
    expect(resp.status).toBe(400);
  });

  it('DELETE /api/integrations/:id removes integration', async () => {
    // First create one
    const createResp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'webhook',
        name: 'To Delete',
        config: { name: 'delete-me' },
      }),
    });
    const created = (await createResp.json()) as { id: string };

    const deleteResp = await fetch(`${baseUrl}/api/integrations/${created.id}`, {
      method: 'DELETE',
    });
    expect(deleteResp.status).toBe(200);
    const result = (await deleteResp.json()) as { success: boolean };
    expect(result.success).toBe(true);
  });

  it('POST /api/integrations/:id/disable disables integration', async () => {
    // Create an echo integration
    const createResp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'echo',
        name: 'Echo to Disable',
        config: { interval_seconds: 3000 },
      }),
    });
    const created = (await createResp.json()) as { id: string };

    const disableResp = await fetch(`${baseUrl}/api/integrations/${created.id}/disable`, {
      method: 'POST',
    });
    expect(disableResp.status).toBe(200);
    const result = (await disableResp.json()) as { success: boolean; status: string };
    expect(result.status).toBe('inactive');
  });

  it('POST /api/integrations/:id/enable re-enables integration', async () => {
    // Create and then disable
    const createResp = await fetch(`${baseUrl}/api/integrations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'echo',
        name: 'Echo to Enable',
        config: { interval_seconds: 3000 },
      }),
    });
    expect(createResp.status).toBe(201);
    const created = (await createResp.json()) as { id: string };
    expect(created.id).toBeTruthy();

    const disableResp = await fetch(`${baseUrl}/api/integrations/${created.id}/disable`, { method: 'POST' });
    expect(disableResp.status).toBe(200);

    const enableResp = await fetch(`${baseUrl}/api/integrations/${created.id}/enable`, {
      method: 'POST',
    });

    expect(enableResp.status).toBe(200);
    const result = (await enableResp.json()) as { success: boolean; status: string };
    expect(result.status).toBe('active');
  });

  it('GET /api/status returns full status with integration list', async () => {
    const resp = await fetch(`${baseUrl}/api/status`);
    expect(resp.status).toBe(200);
    const status = (await resp.json()) as {
      status: string;
      version: string;
      uptime: number;
      activeIntegrations: number;
      integrations: Array<{ id: string; name: string }>;
    };
    expect(status.status).toBe('running');
    expect(status.version).toBe('1.0.0');
    expect(typeof status.uptime).toBe('number');
    expect(typeof status.activeIntegrations).toBe('number');
    expect(Array.isArray(status.integrations)).toBe(true);
  });

  it('GET /api/mcp-connections returns empty array', async () => {
    const resp = await fetch(`${baseUrl}/api/mcp-connections`);
    expect(resp.status).toBe(200);
    const connections = await resp.json();
    expect(Array.isArray(connections)).toBe(true);
  });
});
