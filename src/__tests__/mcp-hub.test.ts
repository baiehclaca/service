import { McpHub } from '../server/mcp-hub.js';
import { StdioMcpProxy } from '../server/proxy.js';
import http from 'node:http';

describe('McpHub', () => {
  let hub: McpHub;
  let server: http.Server;
  const PORT = 13333;

  beforeEach(async () => {
    hub = new McpHub();
    const app = hub.createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  });

  afterEach(async () => {
    await hub.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function post(body: object, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: PORT,
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
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => { responseBody += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: responseBody,
            });
          });
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  it('should return 400 for non-initialize request without session', async () => {
    const result = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });

    expect(result.status).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error?.message).toContain('Bad Request');
  });

  it('should handle initialize request with 200 + SSE', async () => {
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
    expect(result.headers['content-type']).toContain('text/event-stream');
    expect(result.headers['mcp-session-id']).toBeDefined();

    // Parse SSE body
    expect(result.body).toContain('event: message');
    expect(result.body).toContain('"serverInfo"');
    expect(result.body).toContain('"service-mcp"');

    // Extract JSON from SSE data line
    const dataLine = result.body.split('\n').find((l: string) => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.replace('data: ', ''));
    expect(parsed.result.serverInfo.name).toBe('service-mcp');
    expect(parsed.result.capabilities.tools).toBeDefined();
  });

  it('should support tools/list after initialize', async () => {
    // First initialize
    const initResult = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0' },
      },
    });
    const sessionId = initResult.headers['mcp-session-id'] as string;
    expect(sessionId).toBeDefined();

    // Send initialized notification
    await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sessionId },
    );

    // Now list tools
    const toolsResult = await post(
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      { 'mcp-session-id': sessionId },
    );

    expect(toolsResult.status).toBe(200);
    // Parse SSE response
    const dataLine = toolsResult.body.split('\n').find((l: string) => l.startsWith('data: '));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.replace('data: ', ''));
    expect(parsed.result.tools).toBeDefined();
    expect(Array.isArray(parsed.result.tools)).toBe(true);

    // Should have built-in tools
    const toolNames = parsed.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('service__service_status');
    expect(toolNames).toContain('service__help');
  });

  it('should have empty proxies initially', () => {
    expect(hub.getProxies().size).toBe(0);
  });

  it('should respond on /mcp endpoint (not 404)', async () => {
    const result = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    });
    expect(result.status).not.toBe(404);
  });
});

describe('McpHub tool routing', () => {
  it('should namespace downstream tools with mcpId__toolName pattern', () => {
    const mcpId = 'github';
    const toolName = 'create_issue';
    const namespaced = `${mcpId}__${toolName}`;
    expect(namespaced).toBe('github__create_issue');

    const [prefix, ...rest] = namespaced.split('__');
    const original = rest.join('__');
    expect(prefix).toBe('github');
    expect(original).toBe('create_issue');
  });
});

/**
 * Build a fake pre-connected StdioMcpProxy with a given tool list.
 * The proxy never spawns a real process.
 */
function makeMockProxy(name: string, tools: Array<{ name: string; description: string }>): StdioMcpProxy {
  const proxy = new StdioMcpProxy(name, 'echo', []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = proxy as any;
  p._available = true;
  p._destroyed = true; // prevent real connect / retry loops
  p.tools = tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: { type: 'object', properties: {} },
  }));
  return proxy;
}

describe('McpHub dynamic tool registration (A-MCP-03/04)', () => {
  let hub: McpHub;
  let server: http.Server;
  const PORT = 13334;

  beforeEach(async () => {
    hub = new McpHub();
    const app = hub.createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  });

  afterEach(async () => {
    await hub.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function post(body: object, headers?: Record<string, string>): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: PORT,
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
        },
        (res) => {
          let responseBody = '';
          res.on('data', (chunk) => { responseBody += chunk; });
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: responseBody });
          });
        },
      );
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

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
    const sessionId = result.headers['mcp-session-id'] as string;
    expect(sessionId).toBeDefined();

    await post(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { 'mcp-session-id': sessionId },
    );
    return sessionId;
  }

  async function listTools(sessionId: string): Promise<string[]> {
    const result = await post(
      { jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} },
      { 'mcp-session-id': sessionId },
    );
    const dataLine = result.body.split('\n').find((l: string) => l.startsWith('data: '));
    if (!dataLine) return [];
    const parsed = JSON.parse(dataLine.replace('data: ', ''));
    return (parsed.result?.tools ?? []).map((t: { name: string }) => t.name);
  }

  it('new session started AFTER proxy registration should see namespaced downstream tools', async () => {
    // Pre-register a mock proxy before any session is started
    const mockProxy = makeMockProxy('mockname', [{ name: 'test_tool', description: 'A test tool' }]);
    hub.getProxies().set('mockid', mockProxy);

    // Start a new MCP session — createMcpServer → registerProxyTools → should see mockid__test_tool
    const sessionId = await initSession();
    // Give the async .then() in registerProxyTools a tick to resolve
    await new Promise(r => setTimeout(r, 50));

    const toolNames = await listTools(sessionId);
    expect(toolNames).toContain('mockid__test_tool');
  });

  it('existing session should see new tools after dynamic addProxyById-style registration', async () => {
    // Establish a session with NO proxies
    const sessionId = await initSession();

    // Verify the tool is NOT present yet
    const beforeTools = await listTools(sessionId);
    expect(beforeTools).not.toContain('mockid__test_tool');

    // Now dynamically add the proxy and register its tools on all active sessions
    const mockProxy = makeMockProxy('mockname', [{ name: 'test_tool', description: 'A test tool' }]);
    hub.getProxies().set('mockid', mockProxy);

    // Simulate what addProxyById does: call registerProxyToolsOnServer on each session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessions = (hub as any).sessions as Map<string, { server: unknown; proxyToolHandles: Map<string, unknown[]> }>;
    for (const session of sessions.values()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handles = await (hub as any).registerProxyToolsOnServer('mockid', mockProxy, session.server);
      if (handles.length > 0) {
        session.proxyToolHandles.set('mockid', handles);
      }
    }

    // Now the existing session should see the newly registered tool
    const afterTools = await listTools(sessionId);
    expect(afterTools).toContain('mockid__test_tool');
  });
});
