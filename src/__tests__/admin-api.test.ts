import express from 'express';
import http from 'node:http';
import { ServiceDatabase } from '../db/database.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { PushManager } from '../gateway/push-manager.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { createAdminRouter } from '../api/admin.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Admin API', () => {
  const testDir = join(tmpdir(), 'service-admin-test-' + process.pid);
  const testDbPath = join(testDir, 'admin-test.db');
  let db: ServiceDatabase;
  let store: NotificationStore;
  let eventBus: ServiceEventBus;
  let pushManager: PushManager;
  let registry: IntegrationRegistry;
  let server: http.Server;
  const PORT = 14334;

  beforeEach(async () => {
    ServiceDatabase.resetInstance();
    ServiceEventBus.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    eventBus = ServiceEventBus.getInstance();
    store = new NotificationStore(db.db);
    pushManager = new PushManager(eventBus);
    registry = new IntegrationRegistry(store, eventBus);

    const app = express();
    app.use(express.json());
    const router = createAdminRouter({
      store,
      pushManager,
      registry,
      eventBus,
      startTime: new Date(),
    });
    app.use(router);

    await new Promise<void>((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  });

  afterEach(async () => {
    pushManager.shutdown();
    await registry.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    db.close();
    ServiceEventBus.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  function request(method: string, path: string, body?: object): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: PORT,
          path,
          method,
          agent: false,
          headers: {
            'Content-Type': 'application/json',
            'Connection': 'close',
            ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          },
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => { responseBody += chunk; });
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseBody }));
        },
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it('GET /health should return status ok', async () => {
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('1.0.0');
    expect(typeof body.uptime).toBe('number');
  });

  it('GET /api/notifications should return empty array initially', async () => {
    const res = await request('GET', '/api/notifications');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  it('POST /webhooks/:id should create a notification', async () => {
    const res = await request('POST', '/webhooks/test-webhook', {
      title: 'Test Webhook',
      body: 'Hello from webhook',
    });
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.source).toBe('test-webhook');
    expect(body.title).toBe('Test Webhook');
    expect(body.body).toBe('Hello from webhook');
  });

  it('POST webhook + GET notifications should return the notification', async () => {
    await request('POST', '/webhooks/test-webhook', {
      title: 'Persisted Event',
      body: 'This should persist',
    });

    const res = await request('GET', '/api/notifications');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Persisted Event');
  });

  it('GET /api/notifications?unread=true should filter unread', async () => {
    // Create 2 notifications
    const res1 = await request('POST', '/webhooks/wh1', { title: 'Event1', body: 'body1' });
    const event1 = JSON.parse(res1.body);
    await request('POST', '/webhooks/wh2', { title: 'Event2', body: 'body2' });

    // Mark first as read
    await request('PATCH', `/api/notifications/${event1.id}/read`);

    // Get unread only
    const res = await request('GET', '/api/notifications?unread=true');
    const body = JSON.parse(res.body);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Event2');
  });

  it('GET /api/notifications?source=wh1 should filter by source', async () => {
    await request('POST', '/webhooks/wh1', { title: 'From WH1', body: 'body' });
    await request('POST', '/webhooks/wh2', { title: 'From WH2', body: 'body' });

    const res = await request('GET', '/api/notifications?source=wh1');
    const body = JSON.parse(res.body);
    expect(body.length).toBe(1);
    expect(body[0].source).toBe('wh1');
  });

  it('PATCH /api/notifications/:id/read should mark as read', async () => {
    const createRes = await request('POST', '/webhooks/test', { title: 'Markable', body: 'body' });
    const event = JSON.parse(createRes.body);

    const patchRes = await request('PATCH', `/api/notifications/${event.id}/read`);
    expect(patchRes.status).toBe(200);
    const patchBody = JSON.parse(patchRes.body);
    expect(patchBody.success).toBe(true);
  });

  it('PATCH /api/notifications/:id/read should return 404 for nonexistent', async () => {
    const res = await request('PATCH', '/api/notifications/nonexistent/read');
    expect(res.status).toBe(404);
  });

  it('GET /events should establish SSE connection', async () => {
    return new Promise<void>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: PORT,
          path: '/events',
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toBe('text/event-stream');
          expect(res.headers['cache-control']).toBe('no-cache');

          let data = '';
          res.on('data', (chunk) => {
            data += chunk.toString();
            // We got the initial connected message
            if (data.includes(': connected')) {
              req.destroy();
              resolve();
            }
          });
          res.on('error', () => {
            // Connection destroyed, that's fine
            resolve();
          });
        },
      );
      req.on('error', () => {
        // Expected when we destroy
        resolve();
      });
      req.end();

      // Timeout
      setTimeout(() => {
        req.destroy();
        reject(new Error('SSE connection timeout'));
      }, 5000);
    });
  }, 10000);
});
