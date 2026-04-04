import { McpHub } from '../server/mcp-hub.js';
import { MemoryTools } from '../tools/memory-tools.js';
import { McpManagementTools } from '../tools/mcp-management-tools.js';
import { SearchTools } from '../tools/search-tools.js';
import { StatusTools } from '../tools/status-tools.js';
import { HelpTools } from '../tools/help-tools.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { PushManager } from '../gateway/push-manager.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { ServiceDatabase } from '../db/database.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';

describe('McpHub all tools coverage', () => {
  const testDir = join(tmpdir(), 'service-hub-cov-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let hub: McpHub;
  let store: NotificationStore;
  let pushManager: PushManager;
  let server: http.Server;
  let port: number;

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
    const registry = new IntegrationRegistry(store, eventBus);

    hub = new McpHub();
    hub.setNotificationStore(store);
    hub.setMemoryTools(new MemoryTools(db.db));
    hub.setMcpManagementTools(new McpManagementTools(hub, store));
    hub.setSearchTools(new SearchTools(store));
    hub.setStatusTools(new StatusTools({
      hub, registry, pushManager,
      startTime: new Date(),
      version: '1.0.0',
    }));
    hub.setHelpTools(new HelpTools(hub, registry));

    const app = hub.createApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    pushManager.shutdown();
    await hub.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  function post(body: object, headers?: Record<string, string>): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1', port,
        path: '/mcp', method: 'POST', agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          Accept: 'application/json, text/event-stream',
          Connection: 'close',
          ...headers,
        },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: responseBody });
        });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  function parseSSE(body: string): unknown {
    const dataLine = body.split('\n').find((l: string) => l.startsWith('data: '));
    if (!dataLine) return null;
    return JSON.parse(dataLine.replace('data: ', ''));
  }

  async function initSession(): Promise<string> {
    const result = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05', capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });
    const sessionId = result.headers['mcp-session-id'] as string;
    await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sessionId },
    );
    return sessionId;
  }

  async function callTool(sid: string, name: string, args: Record<string, unknown>): Promise<string> {
    const result = await post(
      { jsonrpc: '2.0', id: Math.floor(Math.random() * 10000), method: 'tools/call', params: { name, arguments: args } },
      { 'mcp-session-id': sid },
    );
    const parsed = parseSSE(result.body);
    if (!parsed) {
      // Fallback: try to parse the full body as JSON
      try {
        const json = JSON.parse(result.body);
        const r = json.result as { content: Array<{ text: string }> };
        return r.content[0].text;
      } catch {
        return result.body;
      }
    }
    const p = parsed as Record<string, unknown>;
    const r = p.result as { content: Array<{ text: string }> };
    return r.content[0].text;
  }

  it('should handle get_unread_count', async () => {
    const sid = await initSession();
    const raw = await callTool(sid, 'service__get_unread_count', {});
    const result = JSON.parse(raw);
    expect(result.unread).toBe(0);
  });

  it('should handle mark_notification_read', async () => {
    store.insert({
      id: 'n1', source: 'test', type: 'info',
      title: 'Test', body: 'body',
      timestamp: new Date().toISOString(),
    });
    const sid = await initSession();
    const raw = await callTool(sid, 'service__mark_notification_read', { id: 'n1' });
    const result = JSON.parse(raw);
    expect(result.success).toBe(true);
  });

  it('should handle get_notifications with source filter', async () => {
    store.insert({
      id: 'n1', source: 'email', type: 'info',
      title: 'From email', body: 'body',
      timestamp: new Date().toISOString(),
    });
    store.insert({
      id: 'n2', source: 'slack', type: 'info',
      title: 'From slack', body: 'body',
      timestamp: new Date().toISOString(),
    });
    const sid = await initSession();
    const raw = await callTool(sid, 'service__get_notifications', { source: 'email', limit: 10 });
    const result = JSON.parse(raw);
    expect(result.length).toBe(1);
    expect(result[0].source).toBe('email');
  });

  it('should handle list_connected_mcps returning empty array', async () => {
    const sid = await initSession();
    const raw = await callTool(sid, 'service__list_connected_mcps', {});
    const result = JSON.parse(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should handle disconnect_mcp for nonexistent', async () => {
    const sid = await initSession();
    const raw = await callTool(sid, 'service__disconnect_mcp', { id: 'nonexistent' });
    expect(raw).toBeDefined();
    const result = JSON.parse(raw);
    expect(result.success).toBe(true);
  });

  it('should handle search_notifications with limit', async () => {
    store.insert({
      id: 'sn1', source: 'test', type: 'info',
      title: 'SearchMe', body: 'findable',
      timestamp: new Date().toISOString(),
    });
    const sid = await initSession();
    const raw = await callTool(sid, 'service__search_notifications', { query: 'SearchMe', limit: 5 });
    const result = JSON.parse(raw);
    expect(result.length).toBe(1);
  });

  it('should getSessionCount', () => {
    expect(hub.getSessionCount()).toBe(0);
  });

  it('should getSessionCount after init', async () => {
    await initSession();
    expect(hub.getSessionCount()).toBe(1);
  });

  it('addTool + removeTool removes tool from active sessions (tools/list)', async () => {
    // Establish a session first
    const sid = await initSession();
    await new Promise(r => setTimeout(r, 20));

    // Add a dynamic tool
    hub.addTool(
      'test__dynamic_tool',
      'A test dynamic tool',
      {},
      async () => ({ content: [{ type: 'text' as const, text: 'done' }] }),
    );

    // Verify it appears in tools/list
    const before = await post(
      { jsonrpc: '2.0', id: 50, method: 'tools/list', params: {} },
      { 'mcp-session-id': sid },
    );
    const beforeData = before.body.split('\n').find((l: string) => l.startsWith('data: '));
    expect(beforeData).toBeDefined();
    const beforeParsed = JSON.parse(beforeData!.replace('data: ', ''));
    const beforeNames = (beforeParsed.result?.tools ?? []).map((t: { name: string }) => t.name) as string[];
    expect(beforeNames).toContain('test__dynamic_tool');

    // Now remove the tool
    hub.removeTool('test__dynamic_tool');

    // Verify it no longer appears in tools/list
    const after = await post(
      { jsonrpc: '2.0', id: 51, method: 'tools/list', params: {} },
      { 'mcp-session-id': sid },
    );
    const afterData = after.body.split('\n').find((l: string) => l.startsWith('data: '));
    expect(afterData).toBeDefined();
    const afterParsed = JSON.parse(afterData!.replace('data: ', ''));
    const afterNames = (afterParsed.result?.tools ?? []).map((t: { name: string }) => t.name) as string[];
    expect(afterNames).not.toContain('test__dynamic_tool');
  });
});
