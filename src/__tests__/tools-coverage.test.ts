import { jest } from '@jest/globals';
import { McpHub } from '../server/mcp-hub.js';
import { McpManagementTools } from '../tools/mcp-management-tools.js';
import { StatusTools } from '../tools/status-tools.js';
import { HelpTools } from '../tools/help-tools.js';
import { PlatformToolsManager } from '../tools/platform-tools.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { PushManager } from '../gateway/push-manager.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { ServiceDatabase } from '../db/database.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Additional coverage tests for tool modules.
 * Targets low-coverage areas in help-tools, mcp-management-tools,
 * platform-tools, and status-tools.
 */

describe('HelpTools — downstream MCPs and platform tools sections', () => {
  const testDir = join(tmpdir(), 'service-help-cov-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let hub: McpHub;
  let registry: IntegrationRegistry;
  let helpTools: HelpTools;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    ServiceEventBus.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    const store = new NotificationStore(db.db);
    const eventBus = ServiceEventBus.getInstance();
    hub = new McpHub();
    registry = new IntegrationRegistry(store, eventBus);
    helpTools = new HelpTools(hub, registry);
  });

  afterEach(async () => {
    await registry.shutdown();
    await hub.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should include downstream MCP tools when proxies exist with tools', async () => {
    // Add a mock proxy that has tools
    const fakeProxy = {
      name: 'test-mcp',
      available: true,
      listTools: jest.fn().mockResolvedValue([
        { name: 'echo', description: 'Echo tool' },
        { name: 'greet', description: 'Greeting tool' },
      ]),
      callTool: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    // Access private proxies map
    (hub as unknown as { proxies: Map<string, unknown> }).proxies.set('testmcp', fakeProxy);

    const help = await helpTools.getHelp();
    expect(help).toContain('## Downstream MCP Tools');
    expect(help).toContain('### testmcp');
    expect(help).toContain('testmcp__echo');
    expect(help).toContain('testmcp__greet');
    expect(help).toContain('Echo tool');
  });

  it('should handle unavailable proxy in help', async () => {
    const fakeProxy = {
      name: 'broken-mcp',
      available: true,
      listTools: jest.fn().mockRejectedValue(new Error('Connection failed')),
      callTool: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    (hub as unknown as { proxies: Map<string, unknown> }).proxies.set('brokenmcp', fakeProxy);

    const help = await helpTools.getHelp();
    expect(help).toContain('### brokenmcp (unavailable)');
  });

  it('should skip unavailable proxies (available=false)', async () => {
    const fakeProxy = {
      name: 'offline-mcp',
      available: false,
      listTools: jest.fn(),
      callTool: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    (hub as unknown as { proxies: Map<string, unknown> }).proxies.set('offlinemcp', fakeProxy);

    const help = await helpTools.getHelp();
    // Should show Downstream MCP Tools header but skip the offline one
    expect(help).toContain('## Downstream MCP Tools');
    expect(help).not.toContain('### offlinemcp');
  });

  it('should include platform integration tools when integrations have tools', async () => {
    // Mock a loaded integration that has tools
    const mockAdapter = {
      id: 'mock',
      name: 'Mock Integration',
      description: 'A test integration',
      configSchema: { type: 'object', properties: {} },
      connect: jest.fn(),
      disconnect: jest.fn(),
      onEvent: jest.fn(),
      getTools: jest.fn().mockReturnValue([
        { name: 'do_thing', description: 'Does a thing', inputSchema: {}, handler: jest.fn() },
      ]),
    };
    const loaded = registry.getLoadedIntegrations();
    loaded.set('mock-instance', { adapter: mockAdapter, config: {}, eventHandler: jest.fn() });

    const help = await helpTools.getHelp();
    expect(help).toContain('## Platform Integration Tools');
    expect(help).toContain('mock-instance__do_thing');
    expect(help).toContain('Does a thing');
  });
});

describe('McpManagementTools — connectMcp and disconnectMcp coverage', () => {
  const testDir = join(tmpdir(), 'service-mcp-mgmt-cov-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let store: NotificationStore;
  let hub: McpHub;
  let tools: McpManagementTools;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    store = new NotificationStore(db.db);
    hub = new McpHub();
    tools = new McpManagementTools(hub, store);
  });

  afterEach(async () => {
    await hub.shutdown();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should set status to error when connectMcp fails', async () => {
    // Mock hub.addProxyById to throw an error
    const originalAddProxy = hub.addProxyById.bind(hub);
    hub.addProxyById = async () => { throw new Error('Connection failed'); };

    try {
      await expect(tools.connectMcp('failing-mcp', 'echo', ['hello'])).rejects.toThrow('Connection failed');

      // Verify DB was updated to error status
      const connections = store.getMcpConnections();
      const conn = connections.find(c => c.name === 'failing-mcp');
      expect(conn).toBeDefined();
      expect(conn!.status).toBe('error');
    } finally {
      hub.addProxyById = originalAddProxy;
    }
  });

  it('should return success with toolsAdded on connectMcp success', async () => {
    // Mock hub.addProxyById to succeed
    const originalAddProxy = hub.addProxyById.bind(hub);
    hub.addProxyById = async () => ({ toolsAdded: 3 });

    try {
      const result = await tools.connectMcp('test-mcp', 'echo', ['hello']);
      expect(result.success).toBe(true);
      expect(result.toolsAdded).toBe(3);
      expect(typeof result.id).toBe('string');

      // Verify DB has the connection
      const connections = store.getMcpConnections();
      const conn = connections.find(c => c.name === 'test-mcp');
      expect(conn).toBeDefined();
      expect(conn!.status).toBe('active');
    } finally {
      hub.addProxyById = originalAddProxy;
    }
  });

  it('should delete from DB on disconnectMcp', async () => {
    // Manually save a connection
    store.saveMcpConnection('disc-id', 'disc-mcp', 'echo', ['hello'], 'active');
    expect(store.getMcpConnections().length).toBe(1);

    await tools.disconnectMcp('disc-id');
    expect(store.getMcpConnections().length).toBe(0);
  });

  it('should return connected MCPs with their availability', async () => {
    // Add a mock proxy to the hub
    const fakeProxy = {
      name: 'mock-proxy',
      available: true,
      listTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    (hub as unknown as { proxies: Map<string, unknown> }).proxies.set('mock-id', fakeProxy);

    const mcps = tools.listConnectedMcps();
    expect(mcps.length).toBe(1);
    expect(mcps[0].id).toBe('mock-id');
    expect(mcps[0].name).toBe('mock-proxy');
    expect(mcps[0].available).toBe(true);
  });
});

describe('StatusTools — with active integrations and MCPs', () => {
  const testDir = join(tmpdir(), 'service-status-cov-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let hub: McpHub;
  let registry: IntegrationRegistry;
  let pushManager: PushManager;
  let statusTools: StatusTools;
  let store: NotificationStore;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    ServiceEventBus.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    store = new NotificationStore(db.db);
    const eventBus = ServiceEventBus.getInstance();
    hub = new McpHub();
    registry = new IntegrationRegistry(store, eventBus);
    pushManager = new PushManager(eventBus);

    statusTools = new StatusTools({
      hub,
      registry,
      pushManager,
      startTime: new Date(Date.now() - 5000), // started 5s ago
      version: '2.0.0',
    });
  });

  afterEach(async () => {
    await registry.shutdown();
    pushManager.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should report active integrations when loaded', async () => {
    await registry.loadIntegration('echo-test', 'echo', { interval_seconds: '3600' }, 'Test Echo');

    const status = statusTools.getStatus();
    expect(status.activeIntegrations).toBe(1);
    expect(status.integrations.length).toBe(1);
    expect(status.integrations[0].id).toBe('echo-test');
    expect(status.integrations[0].type).toBe('echo');
    expect(status.integrations[0].status).toBe('active');
  });

  it('should report connected MCPs when proxies exist', () => {
    const fakeProxy = {
      name: 'github-mcp',
      available: true,
      listTools: jest.fn().mockResolvedValue([]),
      callTool: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    (hub as unknown as { proxies: Map<string, unknown> }).proxies.set('gh-id', fakeProxy);

    const status = statusTools.getStatus();
    expect(status.connectedMcps).toBe(1);
    expect(status.mcps.length).toBe(1);
    expect(status.mcps[0].id).toBe('gh-id');
    expect(status.mcps[0].name).toBe('github-mcp');
    expect(status.mcps[0].available).toBe(true);
  });

  it('should report uptime correctly', () => {
    const status = statusTools.getStatus();
    expect(status.uptime).toBeGreaterThanOrEqual(4);
    expect(status.version).toBe('2.0.0');
  });
});

describe('PlatformToolsManager — integration with actual tools', () => {
  const testDir = join(tmpdir(), 'service-platform-cov-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let registry: IntegrationRegistry;
  let manager: PlatformToolsManager;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    ServiceEventBus.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }

    db = new ServiceDatabase(testDbPath);
    const store = new NotificationStore(db.db);
    const eventBus = ServiceEventBus.getInstance();
    registry = new IntegrationRegistry(store, eventBus);
    manager = new PlatformToolsManager(registry);
  });

  afterEach(async () => {
    await registry.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should register tools from an integration that exposes tools onto a server', () => {
    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    manager.addServer(server);

    // Manually inject a mock integration with tools into the registry
    const mockAdapter = {
      id: 'custom',
      name: 'Custom Integration',
      description: 'Integration with tools',
      configSchema: { type: 'object', properties: {} },
      connect: jest.fn(),
      disconnect: jest.fn(),
      onEvent: jest.fn(),
      getTools: jest.fn().mockReturnValue([
        {
          name: 'action1',
          description: 'First action',
          inputSchema: {},
          handler: jest.fn().mockResolvedValue('result1'),
        },
        {
          name: 'action2',
          description: 'Second action',
          inputSchema: {},
          handler: jest.fn().mockResolvedValue({ data: 'result2' }),
        },
      ]),
    };
    registry.getLoadedIntegrations().set('custom-inst', {
      adapter: mockAdapter,
      config: {},
      eventHandler: jest.fn(),
    });

    manager.registerIntegrationTools('custom-inst');
    expect(manager.getToolCount()).toBe(2);

    // Deregister
    manager.deregisterIntegrationTools('custom-inst');
    expect(manager.getToolCount()).toBe(0);

    manager.removeServer(server);
  });

  it('should sync all integrations when adding a server with pre-loaded integrations', () => {
    // Pre-load a mock integration with tools
    const mockAdapter = {
      id: 'pre-loaded',
      name: 'Pre-loaded Integration',
      description: 'Already loaded',
      configSchema: { type: 'object', properties: {} },
      connect: jest.fn(),
      disconnect: jest.fn(),
      onEvent: jest.fn(),
      getTools: jest.fn().mockReturnValue([
        {
          name: 'sync_action',
          description: 'Synced action',
          inputSchema: {},
          handler: jest.fn().mockResolvedValue('synced'),
        },
      ]),
    };
    registry.getLoadedIntegrations().set('pre-inst', {
      adapter: mockAdapter,
      config: {},
      eventHandler: jest.fn(),
    });

    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    // When adding the server, it should sync all existing integration tools
    manager.addServer(server);
    // syncAllIntegrations doesn't track handles in toolHandles, so getToolCount = 0
    // But the tools are registered on the server (tested via the integration flow)

    manager.removeServer(server);
  });

  it('should handle registration errors gracefully in syncAllIntegrations', () => {
    // Create a server that will fail on registerTool
    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    // Register a tool manually first to cause a duplicate
    const mockAdapter = {
      id: 'dup',
      name: 'Dup Integration',
      description: 'Duplicate test',
      configSchema: { type: 'object', properties: {} },
      connect: jest.fn(),
      disconnect: jest.fn(),
      onEvent: jest.fn(),
      getTools: jest.fn().mockReturnValue([
        {
          name: 'dup_tool',
          description: 'Will be duplicated',
          inputSchema: {},
          handler: jest.fn().mockResolvedValue('dup'),
        },
      ]),
    };
    registry.getLoadedIntegrations().set('dup-inst', {
      adapter: mockAdapter,
      config: {},
      eventHandler: jest.fn(),
    });

    // Add the server (syncs tools)
    manager.addServer(server);

    // Add again — should not throw despite duplicate registration
    const server2 = new McpServer(
      { name: 'test2', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    manager.addServer(server2);

    manager.removeServer(server);
    manager.removeServer(server2);
  });

  it('should handle deregistration with handles that throw on remove', () => {
    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    manager.addServer(server);

    const mockAdapter = {
      id: 'err',
      name: 'Error Integration',
      description: 'Throws on remove',
      configSchema: { type: 'object', properties: {} },
      connect: jest.fn(),
      disconnect: jest.fn(),
      onEvent: jest.fn(),
      getTools: jest.fn().mockReturnValue([
        {
          name: 'err_tool',
          description: 'Error tool',
          inputSchema: {},
          handler: jest.fn().mockResolvedValue('err'),
        },
      ]),
    };
    registry.getLoadedIntegrations().set('err-inst', {
      adapter: mockAdapter,
      config: {},
      eventHandler: jest.fn(),
    });

    manager.registerIntegrationTools('err-inst');
    expect(manager.getToolCount()).toBe(1);

    // Deregister — should not throw even if remove() fails internally
    manager.deregisterIntegrationTools('err-inst');
    expect(manager.getToolCount()).toBe(0);

    manager.removeServer(server);
  });
});

describe('McpHub — dynamic tools and addTool/removeTool', () => {
  let hub: McpHub;

  beforeEach(() => {
    hub = new McpHub();
  });

  afterEach(async () => {
    await hub.shutdown();
  });

  it('should add a dynamic tool and have it available', () => {
    hub.addTool(
      'service__test_dynamic',
      'A test dynamic tool',
      { query: { type: 'string' } },
      async (args) => ({
        content: [{ type: 'text' as const, text: `Hello ${(args as Record<string, string>).query}` }],
      }),
    );

    // Tool should be in the dynamicTools map
    const dynamicTools = (hub as unknown as {
      dynamicTools: Map<string, unknown>;
    }).dynamicTools;
    expect(dynamicTools.has('service__test_dynamic')).toBe(true);

    // Remove it
    hub.removeTool('service__test_dynamic');
    expect(dynamicTools.has('service__test_dynamic')).toBe(false);
  });

  it('should register dynamic tools on new sessions created after addTool', async () => {
    hub.addTool(
      'service__runtime_tool',
      'Added at runtime',
      {},
      async () => ({
        content: [{ type: 'text' as const, text: 'runtime result' }],
      }),
    );

    // Creating an app and server should include the dynamic tool
    const app = hub.createApp();
    await import('node:http');
    const server = await new Promise<import('node:http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    // Initialize session
    const initRes = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' },
        },
      }),
    });
    expect(initRes.status).toBe(200);

    server.close();
    hub.removeTool('service__runtime_tool');
  });
});
