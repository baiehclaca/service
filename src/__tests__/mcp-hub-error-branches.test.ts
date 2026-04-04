import { McpHub } from '../server/mcp-hub.js';
import http from 'node:http';

/**
 * Tests MCP hub tool handlers when tool modules are NOT set (null).
 * Exercises all the error branches for uninitialized tools.
 */
describe('McpHub tool error branches', () => {
  let hub: McpHub;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    hub = new McpHub();
    // Intentionally NOT setting any tool modules
    const app = hub.createApp();
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    port = (server.address() as { port: number }).port;
  });

  afterEach(async () => {
    await hub.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
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
    const sid = result.headers['mcp-session-id'] as string;
    await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sid },
    );
    return sid;
  }

  async function callToolRaw(sid: string, name: string, args: Record<string, unknown>): Promise<string> {
    const result = await post(
      { jsonrpc: '2.0', id: Math.floor(Math.random() * 10000), method: 'tools/call', params: { name, arguments: args } },
      { 'mcp-session-id': sid },
    );
    const parsed = parseSSE(result.body) as Record<string, unknown>;
    const r = parsed.result as { content: Array<{ text: string }> };
    return r.content[0].text;
  }

  it('service__get_notifications returns error when store not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__get_notifications', {});
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__get_unread_count returns error when store not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__get_unread_count', {});
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__mark_notification_read returns error when store not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__mark_notification_read', { id: 'x' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__save_note returns error when memory tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__save_note', { key: 'k', content: 'v' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__get_note returns error when memory tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__get_note', { key: 'k' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__list_notes returns error when memory tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__list_notes', {});
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__delete_note returns error when memory tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__delete_note', { key: 'k' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__connect_mcp returns error when mgmt tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__connect_mcp', { name: 'x', command: 'y' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__disconnect_mcp returns error when mgmt tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__disconnect_mcp', { id: 'x' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__list_connected_mcps returns error when mgmt tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__list_connected_mcps', {});
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__search_notifications returns error when search tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__search_notifications', { query: 'test' });
    const result = JSON.parse(raw);
    expect(result.error).toContain('not initialized');
  });

  it('service__help returns fallback when help tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__help', {});
    expect(raw).toContain('Help not yet initialized');
  });

  it('service__service_status uses fallback when status tools not set', async () => {
    const sid = await initSession();
    const raw = await callToolRaw(sid, 'service__service_status', {});
    const result = JSON.parse(raw);
    expect(result.status).toBe('running');
    expect(result.version).toBe('1.0.0');
  });
});
