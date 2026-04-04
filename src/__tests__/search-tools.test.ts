import { ServiceDatabase } from '../db/database.js';
import { NotificationStore } from '../gateway/notification-store.js';
import { SearchTools } from '../tools/search-tools.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SearchTools', () => {
  const testDir = join(tmpdir(), 'service-search-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let store: NotificationStore;
  let searchTools: SearchTools;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
    db = new ServiceDatabase(testDbPath);
    store = new NotificationStore(db.db);
    searchTools = new SearchTools(store);
  });

  afterEach(() => {
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should return empty results for no matches', () => {
    const results = searchTools.searchNotifications('nonexistent');
    expect(results).toEqual([]);
  });

  it('should find notifications by title', () => {
    store.insert({
      id: 'n1', source: 'test', type: 'info',
      title: 'Production deployment complete',
      body: 'All services healthy', timestamp: new Date().toISOString(),
    });
    store.insert({
      id: 'n2', source: 'test', type: 'info',
      title: 'Code review needed',
      body: 'PR #42 awaiting review', timestamp: new Date().toISOString(),
    });

    const results = searchTools.searchNotifications('deployment');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('n1');
  });

  it('should find notifications by body content', () => {
    store.insert({
      id: 'n1', source: 'email', type: 'info',
      title: 'Meeting', body: 'Team standup at 10am',
      timestamp: new Date().toISOString(),
    });

    const results = searchTools.searchNotifications('standup');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('n1');
  });

  it('should find notifications by source', () => {
    store.insert({
      id: 'n1', source: 'slack', type: 'info',
      title: 'Alert', body: 'Server warning from slack',
      timestamp: new Date().toISOString(),
    });

    const results = searchTools.searchNotifications('slack');
    expect(results.length).toBe(1);
  });

  it('should respect limit parameter', () => {
    for (let i = 0; i < 10; i++) {
      store.insert({
        id: `n${i}`, source: 'test', type: 'info',
        title: `Alert number ${i}`, body: 'Test alert body',
        timestamp: new Date().toISOString(),
      });
    }

    const results = searchTools.searchNotifications('alert', 3);
    expect(results.length).toBe(3);
  });
});
