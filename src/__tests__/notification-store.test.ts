import { ServiceDatabase } from '../db/database.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { NotificationEvent } from '../integrations/types.js';

describe('NotificationStore', () => {
  const testDir = join(tmpdir(), 'service-notif-test-' + process.pid);
  const testDbPath = join(testDir, 'notif-test.db');
  let db: ServiceDatabase;
  let store: NotificationStore;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
    db = new ServiceDatabase(testDbPath);
    store = new NotificationStore(db.db);
  });

  afterEach(() => {
    db.close();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  function makeEvent(overrides?: Partial<NotificationEvent>): NotificationEvent {
    return {
      id: randomUUID(),
      source: 'test',
      type: 'info',
      title: 'Test Notification',
      body: 'This is a test notification body',
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it('should insert a notification and return stored form', () => {
    const event = makeEvent();
    const stored = store.insert(event);
    expect(stored.id).toBe(event.id);
    expect(stored.source).toBe('test');
    expect(stored.title).toBe('Test Notification');
    expect(stored.read).toBe(0);
  });

  it('should retrieve recent notifications', () => {
    store.insert(makeEvent({ title: 'First' }));
    store.insert(makeEvent({ title: 'Second' }));
    store.insert(makeEvent({ title: 'Third' }));

    const recent = store.getRecent(10);
    expect(recent.length).toBe(3);
    // Most recent first
    expect(recent[0].title).toBe('Third');
  });

  it('should filter by source', () => {
    store.insert(makeEvent({ source: 'slack' }));
    store.insert(makeEvent({ source: 'email' }));
    store.insert(makeEvent({ source: 'slack' }));

    const slackOnly = store.getRecent(10, 'slack');
    expect(slackOnly.length).toBe(2);
    expect(slackOnly.every(n => n.source === 'slack')).toBe(true);
  });

  it('should filter by unread', () => {
    const e1 = makeEvent({ title: 'Unread1' });
    const e2 = makeEvent({ title: 'Read1' });
    store.insert(e1);
    store.insert(e2);
    store.markRead(e2.id);

    const unread = store.getRecent(10, undefined, true);
    expect(unread.length).toBe(1);
    expect(unread[0].title).toBe('Unread1');
  });

  it('should mark a notification as read', () => {
    const event = makeEvent();
    store.insert(event);
    expect(store.markRead(event.id)).toBe(true);

    const recent = store.getRecent(10);
    expect(recent[0].read).toBe(1);
  });

  it('should return false when marking non-existent notification', () => {
    expect(store.markRead('nonexistent-id')).toBe(false);
  });

  it('should get unread count', () => {
    store.insert(makeEvent());
    store.insert(makeEvent());
    const e3 = makeEvent();
    store.insert(e3);
    store.markRead(e3.id);

    expect(store.getUnreadCount()).toBe(2);
  });

  it('should get unread count filtered by source', () => {
    store.insert(makeEvent({ source: 'slack' }));
    store.insert(makeEvent({ source: 'email' }));
    store.insert(makeEvent({ source: 'slack' }));

    expect(store.getUnreadCount('slack')).toBe(2);
    expect(store.getUnreadCount('email')).toBe(1);
  });

  it('should search notifications via FTS5', () => {
    store.insert(makeEvent({ title: 'Meeting Reminder', body: 'Team standup at 10am' }));
    store.insert(makeEvent({ title: 'Deploy Done', body: 'Production deployed' }));

    const results = store.search('standup');
    expect(results.length).toBe(1);
    expect(results[0].title).toBe('Meeting Reminder');
  });

  it('should respect limit on getRecent', () => {
    for (let i = 0; i < 10; i++) {
      store.insert(makeEvent({ title: `Event ${i}` }));
    }
    const recent = store.getRecent(3);
    expect(recent.length).toBe(3);
  });

  it('should encrypt and decrypt integration configs', () => {
    store.storeIntegrationConfig('int1', 'My Webhook', 'webhook', {
      token: 'placeholder-value-for-test',
      url: 'https://example.com',
    });

    // Verify the raw value in DB is encrypted (not plaintext)
    const raw = db.db.prepare('SELECT config FROM integrations WHERE id = ?').get('int1') as { config: Buffer };
    expect(raw.config).toBeInstanceOf(Buffer);
    // Should NOT contain plaintext
    const rawStr = raw.config.toString('utf-8');
    expect(rawStr).not.toContain('placeholder-value-for-test');

    // Decrypt and verify
    const decrypted = store.loadIntegrationConfig('int1');
    expect(decrypted).toBeDefined();
    expect(decrypted!.token).toBe('placeholder-value-for-test');
    expect(decrypted!.url).toBe('https://example.com');
  });

  it('should return null for non-existent integration config', () => {
    const config = store.loadIntegrationConfig('nonexistent');
    expect(config).toBeNull();
  });

  it('should update last_event_at on integration', () => {
    store.storeIntegrationConfig('int1', 'Test', 'echo', {});

    store.updateLastEventAt('int1');

    const row = db.db.prepare('SELECT last_event_at FROM integrations WHERE id = ?').get('int1') as { last_event_at: string | null };
    expect(row.last_event_at).not.toBeNull();
  });

  it('should get all integrations', () => {
    store.storeIntegrationConfig('i1', 'Webhook1', 'webhook', {});
    store.storeIntegrationConfig('i2', 'Echo1', 'echo', {});

    const all = store.getAllIntegrations();
    expect(all.length).toBe(2);
    expect(all.map(i => i.id).sort()).toEqual(['i1', 'i2']);
  });

  it('should handle metadata in notifications', () => {
    const event = makeEvent({ metadata: { custom_field: 'value', count: 42 } });
    const stored = store.insert(event);
    expect(stored.metadata).toBe(JSON.stringify({ custom_field: 'value', count: 42 }));
  });
});
