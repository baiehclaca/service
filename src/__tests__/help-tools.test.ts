import { HelpTools } from '../tools/help-tools.js';
import { McpHub } from '../server/mcp-hub.js';
import { IntegrationRegistry } from '../integrations/registry.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { ServiceEventBus } from '../gateway/event-bus.js';
import { ServiceDatabase } from '../db/database.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('HelpTools', () => {
  const testDir = join(tmpdir(), 'service-help-test-' + process.pid);
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

  afterEach(() => {
    ServiceEventBus.resetInstance();
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should return markdown help content', async () => {
    const help = await helpTools.getHelp();
    expect(typeof help).toBe('string');
    expect(help).toContain('# SERVICE MCP Tools');
  });

  it('should list notification tools', async () => {
    const help = await helpTools.getHelp();
    expect(help).toContain('service__get_notifications');
    expect(help).toContain('service__get_unread_count');
    expect(help).toContain('service__mark_notification_read');
    expect(help).toContain('service__search_notifications');
  });

  it('should list memory tools', async () => {
    const help = await helpTools.getHelp();
    expect(help).toContain('service__save_note');
    expect(help).toContain('service__get_note');
    expect(help).toContain('service__list_notes');
    expect(help).toContain('service__delete_note');
  });

  it('should list MCP management tools', async () => {
    const help = await helpTools.getHelp();
    expect(help).toContain('service__connect_mcp');
    expect(help).toContain('service__disconnect_mcp');
    expect(help).toContain('service__list_connected_mcps');
  });

  it('should list status and help tools', async () => {
    const help = await helpTools.getHelp();
    expect(help).toContain('service__service_status');
    expect(help).toContain('service__help');
  });

  it('should include tool descriptions', async () => {
    const help = await helpTools.getHelp();
    expect(help).toContain('Full-text search');
    expect(help).toContain('cross-session memory');
  });
});
