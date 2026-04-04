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

describe('McpHub Agent Tools Integration', () => {
  const testDir = join(tmpdir(), 'service-hub-tools-test-' + process.pid);
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
      hub,
      registry,
      pushManager,
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

  /** Helper: send JSON-RPC POST and return raw body + headers */
  function post(body: object, headers?: Record<string, string>): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        agent: false,
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

  /** Parse SSE response body to extract JSON data */
  function parseSSE(body: string): unknown {
    const dataLine = body.split('\n').find((l: string) => l.startsWith('data: '));
    if (!dataLine) return null;
    return JSON.parse(dataLine.replace('data: ', ''));
  }

  /** Initialize a session and return session ID */
  async function initSession(): Promise<string> {
    const result = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });
    expect(result.status).toBe(200);
    const sessionId = result.headers['mcp-session-id'] as string;
    expect(sessionId).toBeDefined();

    // Send initialized notification
    await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sessionId },
    );

    return sessionId;
  }

  /** Call a tool and return parsed result */
  async function callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await post(
      {
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 10000),
        method: 'tools/call',
        params: { name, arguments: args },
      },
      { 'mcp-session-id': sessionId },
    );
    expect(result.status).toBe(200);
    const parsed = parseSSE(result.body) as Record<string, unknown>;
    const resultObj = parsed.result as { content: Array<{ type: string; text: string }> };
    return JSON.parse(resultObj.content[0].text);
  }

  it('should list all service__ tools via tools/list', async () => {
    const sid = await initSession();
    const result = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { 'mcp-session-id': sid },
    );
    expect(result.status).toBe(200);

    const parsed = parseSSE(result.body) as Record<string, unknown>;
    const toolResult = parsed.result as { tools: Array<{ name: string }> };
    const toolNames = toolResult.tools.map(t => t.name);

    const requiredTools = [
      'service__service_status',
      'service__help',
      'service__get_notifications',
      'service__get_unread_count',
      'service__mark_notification_read',
      'service__save_note',
      'service__get_note',
      'service__list_notes',
      'service__delete_note',
      'service__connect_mcp',
      'service__disconnect_mcp',
      'service__list_connected_mcps',
      'service__search_notifications',
    ];

    for (const tool of requiredTools) {
      expect(toolNames).toContain(tool);
    }
  });

  it('should save and retrieve a note via tools/call (A-MCP-11, A-MCP-12)', async () => {
    const sid = await initSession();

    // Save a note
    const saveData = await callTool(sid, 'service__save_note', { key: 'test', content: 'hello' });
    expect((saveData as Record<string, unknown>).success).toBe(true);

    // Get the note
    const noteData = await callTool(sid, 'service__get_note', { key: 'test' });
    expect((noteData as Record<string, unknown>).content).toBe('hello');
  });

  it('should list connected MCPs via tools/call', async () => {
    const sid = await initSession();
    const mcps = await callTool(sid, 'service__list_connected_mcps', {});
    expect(Array.isArray(mcps)).toBe(true);
  });

  it('should get service status via tools/call (A-MCP-10)', async () => {
    const sid = await initSession();
    const status = await callTool(sid, 'service__service_status', {}) as Record<string, unknown>;
    expect(status.version).toBe('1.0.0');
    expect(status.status).toBe('running');
    expect(typeof status.uptime).toBe('number');
    expect(typeof status.activeIntegrations).toBe('number');
  });

  it('should get help via tools/call (A-MCP-16)', async () => {
    const sid = await initSession();
    const result = await post(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'service__help', arguments: {} },
      },
      { 'mcp-session-id': sid },
    );
    expect(result.status).toBe(200);
    const parsed = parseSSE(result.body) as Record<string, unknown>;
    const resultObj = parsed.result as { content: Array<{ type: string; text: string }> };
    const helpText = resultObj.content[0].text;
    expect(helpText).toContain('SERVICE MCP Tools');
    expect(helpText).toContain('service__save_note');
  });

  it('should search notifications via tools/call (A-MCP-15)', async () => {
    // Insert a notification first
    store.insert({
      id: 'sn1', source: 'test', type: 'info',
      title: 'Deployment alert', body: 'Production deployed',
      timestamp: new Date().toISOString(),
    });

    const sid = await initSession();
    const results = await callTool(sid, 'service__search_notifications', { query: 'deployment' });
    expect(Array.isArray(results)).toBe(true);
    expect((results as Array<Record<string, unknown>>).length).toBeGreaterThan(0);
    expect((results as Array<Record<string, unknown>>)[0].title).toContain('Deployment');
  });

  it('should support addTool and removeTool for dynamic registration', () => {
    hub.addTool(
      'service__custom_tool',
      'A custom dynamic tool',
      {},
      async () => ({ content: [{ type: 'text' as const, text: 'custom result' }] }),
    );
    // Should not throw
    hub.removeTool('service__custom_tool');
  });

  it('should list notes returning empty array when none exist', async () => {
    const sid = await initSession();
    const notes = await callTool(sid, 'service__list_notes', {});
    expect(Array.isArray(notes)).toBe(true);
    expect((notes as unknown[]).length).toBe(0);
  });

  it('should delete a note', async () => {
    const sid = await initSession();
    await callTool(sid, 'service__save_note', { key: 'delme', content: 'todelete' });
    const result = await callTool(sid, 'service__delete_note', { key: 'delme' }) as Record<string, unknown>;
    expect(result.success).toBe(true);
    // Verify it's gone
    const note = await callTool(sid, 'service__get_note', { key: 'delme' }) as Record<string, unknown>;
    expect(note.error).toBe('Note not found');
  });
});
