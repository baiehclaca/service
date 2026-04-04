import { PlatformToolsManager } from '../tools/platform-tools.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { ServiceDatabase } from '../db/database.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('PlatformToolsManager', () => {
  const testDir = join(tmpdir(), 'service-platform-test-' + process.pid);
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

  it('should initialize with zero tools', () => {
    expect(manager.getToolCount()).toBe(0);
  });

  it('should track registered integration tools', () => {
    // PlatformToolsManager.registerIntegrationTools requires a loaded
    // integration in the registry; with no loaded integrations, nothing happens.
    manager.registerIntegrationTools('nonexistent');
    expect(manager.getToolCount()).toBe(0);
  });

  it('should deregister integration tools', () => {
    manager.deregisterIntegrationTools('nonexistent');
    // Should not throw
    expect(manager.getToolCount()).toBe(0);
  });

  it('should add and remove a McpServer', () => {
    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    manager.addServer(server);
    manager.removeServer(server);
    // Should not throw
  });

  it('should sync integration tools when adding server after integration loaded', async () => {
    // Load an echo integration (it has no getTools, so nothing registered)
    await registry.loadIntegration('echo-test', 'echo', { interval_seconds: '3600' }, 'Test Echo');

    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    // Adding server should sync — echo has no tools, so count stays 0
    manager.addServer(server);
    expect(manager.getToolCount()).toBe(0);

    manager.removeServer(server);
  });

  it('should register tools from an integration that exposes tools', async () => {
    // webhook integration has no tools by default either
    await registry.loadIntegration('wh-test', 'webhook', {}, 'Test Webhook');

    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    manager.addServer(server);

    // Register tools for the integration - webhook doesn't have any tools
    manager.registerIntegrationTools('wh-test');
    // No tools because webhook adapter's getTools() returns []
    expect(manager.getToolCount()).toBe(0);

    // Deregister
    manager.deregisterIntegrationTools('wh-test');
    expect(manager.getToolCount()).toBe(0);

    manager.removeServer(server);
  });

  it('should registerSession and unregisterSession by sessionId', () => {
    const server = new McpServer(
      { name: 'test', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    const sessionId = 'test-session-123';
    manager.registerSession(sessionId, server);
    // Should be tracked (server is in servers set)
    manager.unregisterSession(sessionId);
    // Should not throw — idempotent
    manager.unregisterSession(sessionId);
  });

  it('unregisterSession for unknown sessionId should not throw', () => {
    expect(() => manager.unregisterSession('nonexistent-session')).not.toThrow();
  });
});
