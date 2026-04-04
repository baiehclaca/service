import { McpHub } from '../server/mcp-hub.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { PushManager } from '../gateway/push-manager.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { ServiceDatabase } from '../db/database.js';
import { createAdminRouter } from '../api/admin.js';
import express from 'express';
import http from 'node:http';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Admin API extended coverage', () => {
  const testDir = join(tmpdir(), 'service-admin-ext-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let app: express.Express;
  let server: http.Server;
  let port: number;
  let store: NotificationStore;
  let registry: IntegrationRegistry;
  let pushManager: PushManager;

  beforeEach(async () => {
    ServiceDatabase.resetInstance();
    ServiceEventBus.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    store = new NotificationStore(db.db);
    const eventBus = ServiceEventBus.getInstance();
    pushManager = new PushManager(eventBus);
    registry = new IntegrationRegistry(store, eventBus);
    const hub = new McpHub();

    app = express();
    app.use(express.json());
    app.use(createAdminRouter({
      store, pushManager, registry, eventBus, hub,
      startTime: new Date(),
    }));

    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    pushManager.shutdown();
    await registry.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  async function request(method: string, path: string, body?: object): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : '';
      const req = http.request({
        hostname: '127.0.0.1', port,
        path, method, agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Connection: 'close',
        },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(responseBody) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: responseBody });
          }
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it('GET /api/status returns full status', async () => {
    const res = await request('GET', '/api/status');
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('running');
    expect(body.version).toBeDefined();
    expect(body.uptime).toBeDefined();
    expect(body.activeIntegrations).toBeDefined();
    expect(body.connectedMcps).toBeDefined();
  });

  it('POST /api/integrations validates missing type', async () => {
    const res = await request('POST', '/api/integrations', { name: 'test' });
    expect(res.status).toBe(400);
  });

  it('POST /api/integrations validates missing name', async () => {
    const res = await request('POST', '/api/integrations', { type: 'echo' });
    expect(res.status).toBe(400);
  });

  it('POST /api/integrations rejects unknown type', async () => {
    const res = await request('POST', '/api/integrations', {
      type: 'nonexistent', name: 'test',
    });
    expect(res.status).toBe(400);
    const body = res.body as Record<string, unknown>;
    expect(body.error).toContain('Unknown integration type');
  });

  it('POST /api/integrations/:id/enable for nonexistent returns 500', async () => {
    const res = await request('POST', '/api/integrations/nonexistent/enable');
    expect(res.status).toBe(500);
  });

  it('POST /api/integrations/:id/disable for nonexistent returns 200', async () => {
    const res = await request('POST', '/api/integrations/nonexistent/disable');
    expect(res.status).toBe(200);
  });

  it('PATCH /api/notifications/:id/read returns 404 for nonexistent', async () => {
    const res = await request('PATCH', '/api/notifications/nonexistent/read');
    expect(res.status).toBe(404);
  });

  it('GET /api/notifications returns empty array', async () => {
    const res = await request('GET', '/api/notifications');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/integrations returns array', async () => {
    const res = await request('GET', '/api/integrations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /api/integrations/types returns available types', async () => {
    const res = await request('GET', '/api/integrations/types');
    expect(res.status).toBe(200);
    const body = res.body as Array<{ type: string }>;
    expect(body.length).toBeGreaterThan(0);
    const types = body.map(t => t.type);
    expect(types).toContain('echo');
    expect(types).toContain('webhook');
  });

  it('DELETE /api/integrations/:id removes integration', async () => {
    // First create an integration entry
    store.storeIntegrationConfig('del-test', 'Test', 'echo', {}, 'inactive');
    const res = await request('DELETE', '/api/integrations/del-test');
    expect(res.status).toBe(200);
  });

  it('GET /api/mcp-connections returns array', async () => {
    const res = await request('GET', '/api/mcp-connections');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /api/mcp-connections validates missing fields', async () => {
    const res = await request('POST', '/api/mcp-connections', { name: 'test' });
    expect(res.status).toBe(400);
  });
});
