import { StatusTools } from '../tools/status-tools.js';
import { McpHub } from '../server/mcp-hub.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { PushManager } from '../gateway/push-manager.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { ServiceDatabase } from '../db/database.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('StatusTools', () => {
  const testDir = join(tmpdir(), 'service-status-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let hub: McpHub;
  let registry: IntegrationRegistry;
  let pushManager: PushManager;
  let statusTools: StatusTools;

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
    pushManager = new PushManager(eventBus);

    statusTools = new StatusTools({
      hub,
      registry,
      pushManager,
      startTime: new Date(),
      version: '1.0.0',
    });
  });

  afterEach(() => {
    pushManager.shutdown();
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should return running status', () => {
    const status = statusTools.getStatus();
    expect(status.status).toBe('running');
  });

  it('should return version', () => {
    const status = statusTools.getStatus();
    expect(status.version).toBe('1.0.0');
  });

  it('should return uptime as non-negative number', () => {
    const status = statusTools.getStatus();
    expect(typeof status.uptime).toBe('number');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should return startedAt as ISO string', () => {
    const status = statusTools.getStatus();
    expect(status.startedAt).toBeDefined();
    // Should be parseable as a date
    expect(new Date(status.startedAt).getTime()).not.toBeNaN();
  });

  it('should return integration count', () => {
    const status = statusTools.getStatus();
    expect(status.activeIntegrations).toBe(0);
    expect(Array.isArray(status.integrations)).toBe(true);
  });

  it('should return MCP count', () => {
    const status = statusTools.getStatus();
    expect(status.connectedMcps).toBe(0);
    expect(Array.isArray(status.mcps)).toBe(true);
  });

  it('should return SSE connection count', () => {
    const status = statusTools.getStatus();
    expect(status.activeSseConnections).toBe(0);
  });
});
