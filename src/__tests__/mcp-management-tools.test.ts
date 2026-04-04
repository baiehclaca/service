import { McpManagementTools } from '../tools/mcp-management-tools.js';
import { McpHub } from '../server/mcp-hub.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceDatabase } from '../db/database.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('McpManagementTools', () => {
  const testDir = join(tmpdir(), 'service-mcp-mgmt-test-' + process.pid);
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

  describe('listConnectedMcps', () => {
    it('should return empty array when no MCPs connected', () => {
      const mcps = tools.listConnectedMcps();
      expect(mcps).toEqual([]);
    });
  });

  describe('connectMcp', () => {
    it('should persist connection info in the database', () => {
      // Test the DB persistence directly without spawning
      store.saveMcpConnection('test-id', 'test-mcp', 'echo', ['hello'], 'active');
      const connections = store.getMcpConnections();
      expect(connections.length).toBe(1);
      expect(connections[0].name).toBe('test-mcp');
      expect(connections[0].command).toBe('echo');
      expect(connections[0].status).toBe('active');
    });
  });

  describe('disconnectMcp', () => {
    it('should handle disconnecting nonexistent MCP gracefully', async () => {
      // Should not throw for nonexistent ID
      const result = await tools.disconnectMcp('nonexistent-id');
      expect(result.success).toBe(true);
    });
  });
});
