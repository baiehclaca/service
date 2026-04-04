import { ServiceDatabase } from '../db/database.js';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('ServiceDatabase', () => {
  const testDir = join(tmpdir(), 'service-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    mkdirSync(testDir, { recursive: true });
    // Clean up any existing test db
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  afterEach(() => {
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('should create database file', () => {
    const db = new ServiceDatabase(testDbPath);
    expect(existsSync(testDbPath)).toBe(true);
    db.close();
  });

  it('should create all required tables', () => {
    const db = new ServiceDatabase(testDbPath);
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('integrations');
    expect(tableNames).toContain('notifications');
    expect(tableNames).toContain('mcp_connections');
    expect(tableNames).toContain('agent_sessions');
    expect(tableNames).toContain('agent_notes');
    db.close();
  });

  it('should create FTS5 virtual table for notifications', () => {
    const db = new ServiceDatabase(testDbPath);
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications_fts'"
    ).all() as Array<{ name: string }>;

    expect(tables.length).toBe(1);
    db.close();
  });

  it('should support CRUD on notifications', () => {
    const db = new ServiceDatabase(testDbPath);

    // Insert
    db.db.prepare(
      `INSERT INTO notifications (id, source, type, title, body) VALUES (?, ?, ?, ?, ?)`
    ).run('n1', 'test', 'info', 'Test Notification', 'Hello world');

    // Read
    const row = db.db.prepare('SELECT * FROM notifications WHERE id = ?').get('n1') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.title).toBe('Test Notification');
    expect(row.body).toBe('Hello world');
    expect(row.read).toBe(0);

    // Update (mark as read)
    db.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run('n1');
    const updated = db.db.prepare('SELECT read FROM notifications WHERE id = ?').get('n1') as Record<string, unknown>;
    expect(updated.read).toBe(1);

    // Delete
    db.db.prepare('DELETE FROM notifications WHERE id = ?').run('n1');
    const deleted = db.db.prepare('SELECT * FROM notifications WHERE id = ?').get('n1');
    expect(deleted).toBeUndefined();

    db.close();
  });

  it('should support FTS5 search on notifications', () => {
    const db = new ServiceDatabase(testDbPath);

    db.db.prepare(
      `INSERT INTO notifications (id, source, type, title, body) VALUES (?, ?, ?, ?, ?)`
    ).run('n1', 'email', 'info', 'Meeting Reminder', 'Team standup at 10am');
    db.db.prepare(
      `INSERT INTO notifications (id, source, type, title, body) VALUES (?, ?, ?, ?, ?)`
    ).run('n2', 'slack', 'info', 'Deploy Complete', 'Production deployed successfully');

    // Search for "standup"
    const results = db.db.prepare(
      `SELECT n.* FROM notifications n
       JOIN notifications_fts fts ON n.rowid = fts.rowid
       WHERE notifications_fts MATCH ?`
    ).all('standup') as Array<Record<string, unknown>>;

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('n1');

    db.close();
  });

  it('should support CRUD on integrations', () => {
    const db = new ServiceDatabase(testDbPath);

    db.db.prepare(
      `INSERT INTO integrations (id, name, type, status) VALUES (?, ?, ?, ?)`
    ).run('i1', 'Test Webhook', 'webhook', 'active');

    const row = db.db.prepare('SELECT * FROM integrations WHERE id = ?').get('i1') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.name).toBe('Test Webhook');
    expect(row.type).toBe('webhook');
    expect(row.status).toBe('active');

    db.close();
  });

  it('should support CRUD on agent_notes', () => {
    const db = new ServiceDatabase(testDbPath);

    db.db.prepare(
      `INSERT INTO agent_notes (key, content) VALUES (?, ?)`
    ).run('mykey', 'myvalue');

    const row = db.db.prepare('SELECT * FROM agent_notes WHERE key = ?').get('mykey') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.content).toBe('myvalue');

    db.close();
  });

  it('should support singleton pattern', () => {
    ServiceDatabase.resetInstance();
    const db1 = ServiceDatabase.getInstance(testDbPath);
    const db2 = ServiceDatabase.getInstance(testDbPath);
    expect(db1).toBe(db2);
    ServiceDatabase.resetInstance();
  });
});
