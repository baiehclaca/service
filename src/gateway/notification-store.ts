import { randomUUID, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type Database from 'better-sqlite3';
import type { NotificationEvent, StoredNotification } from '../integrations/types.js';

const SERVICE_DIR = join(homedir(), '.service');
const ENCRYPTION_KEY_PATH = join(SERVICE_DIR, '.encryption_key');

/**
 * Manages notification storage and config encryption in SQLite.
 */
export class NotificationStore {
  private db: Database.Database;
  private encryptionKey: Buffer;

  constructor(db: Database.Database) {
    this.db = db;
    this.encryptionKey = this.loadOrCreateEncryptionKey();
  }

  /** Load or generate the AES-256-GCM encryption key */
  private loadOrCreateEncryptionKey(): Buffer {
    mkdirSync(SERVICE_DIR, { recursive: true });
    if (existsSync(ENCRYPTION_KEY_PATH)) {
      return Buffer.from(readFileSync(ENCRYPTION_KEY_PATH, 'utf-8').trim(), 'hex');
    }
    const key = randomBytes(32);
    writeFileSync(ENCRYPTION_KEY_PATH, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  /** Encrypt plaintext with AES-256-GCM. Returns IV + authTag + ciphertext as Buffer. */
  encrypt(plaintext: string): Buffer {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Layout: [12-byte IV][16-byte authTag][ciphertext]
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /** Decrypt an AES-256-GCM encrypted buffer. */
  decrypt(data: Buffer): string {
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  /** Insert a new notification and return its stored form */
  insert(event: NotificationEvent): StoredNotification {
    const id = event.id || randomUUID();
    const metadata = event.metadata ? JSON.stringify(event.metadata) : null;
    const timestamp = event.timestamp || new Date().toISOString();

    this.db.prepare(
      `INSERT INTO notifications (id, source, type, title, body, read, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
    ).run(id, event.source, event.type, event.title, event.body, timestamp, metadata);

    return {
      id,
      source: event.source,
      type: event.type,
      title: event.title,
      body: event.body,
      read: 0,
      created_at: timestamp,
      metadata,
    };
  }

  /** Get recent notifications with optional filters */
  getRecent(limit: number = 50, source?: string, unread?: boolean): StoredNotification[] {
    let sql = 'SELECT * FROM notifications WHERE 1=1';
    const params: unknown[] = [];

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }
    if (unread !== undefined && unread) {
      sql += ' AND read = 0';
    }

    sql += ' ORDER BY created_at DESC, rowid DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as StoredNotification[];
  }

  /** Mark a notification as read */
  markRead(id: string): boolean {
    const result = this.db.prepare(
      'UPDATE notifications SET read = 1 WHERE id = ?'
    ).run(id);
    return result.changes > 0;
  }

  /** Mark all notifications as read */
  markAllRead(): void {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
  }

  /** Get count of unread notifications */
  getUnreadCount(source?: string): number {
    let sql = 'SELECT COUNT(*) as count FROM notifications WHERE read = 0';
    const params: unknown[] = [];

    if (source) {
      sql += ' AND source = ?';
      params.push(source);
    }

    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  /** Full-text search notifications using FTS5 */
  search(query: string, limit: number = 50): StoredNotification[] {
    return this.db.prepare(
      `SELECT n.* FROM notifications n
       JOIN notifications_fts fts ON n.rowid = fts.rowid
       WHERE notifications_fts MATCH ?
       ORDER BY n.created_at DESC
       LIMIT ?`
    ).all(query, limit) as StoredNotification[];
  }

  /** Store an encrypted integration config in the database */
  storeIntegrationConfig(
    id: string,
    name: string,
    type: string,
    config: Record<string, string>,
    status: string = 'active'
  ): void {
    const encryptedConfig = this.encrypt(JSON.stringify(config));
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR REPLACE INTO integrations (id, name, type, config, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, type, encryptedConfig, status, now, now);
  }

  /** Update the status of an integration in the database */
  updateIntegrationStatus(id: string, status: string, errorMessage?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `UPDATE integrations SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`
    ).run(status, errorMessage ?? null, now, id);
  }

  /** Load and decrypt an integration config from the database */
  loadIntegrationConfig(id: string): Record<string, string> | null {
    const row = this.db.prepare(
      'SELECT config FROM integrations WHERE id = ?'
    ).get(id) as { config: Buffer } | undefined;

    if (!row || !row.config) return null;
    try {
      return JSON.parse(this.decrypt(Buffer.from(row.config)));
    } catch {
      return null;
    }
  }

  /** Update last_event_at for an integration */
  updateLastEventAt(integrationId: string): void {
    this.db.prepare(
      'UPDATE integrations SET last_event_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
    ).run(integrationId);
  }

  /** Get all integration rows from the database */
  getAllIntegrations(): Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    created_at: string;
    updated_at: string;
    last_event_at: string | null;
  }> {
    return this.db.prepare(
      'SELECT id, name, type, status, created_at, updated_at, last_event_at FROM integrations'
    ).all() as Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      created_at: string;
      updated_at: string;
      last_event_at: string | null;
    }>;
  }

  /** Save or update an MCP connection record */
  saveMcpConnection(id: string, name: string, command: string, args: string[], status: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT OR REPLACE INTO mcp_connections (id, name, command, args, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, name, command, JSON.stringify(args), status, now, now);
  }

  /** Delete an MCP connection record */
  deleteMcpConnection(id: string): void {
    this.db.prepare('DELETE FROM mcp_connections WHERE id = ?').run(id);
  }

  /** Delete an integration from the database */
  deleteIntegration(id: string): void {
    this.db.prepare('DELETE FROM integrations WHERE id = ?').run(id);
  }

  /** Get all saved MCP connections */
  getMcpConnections(): Array<{
    id: string;
    name: string;
    command: string;
    args: string[];
    status: string;
    created_at: string;
    updated_at: string;
  }> {
    const rows = this.db.prepare('SELECT * FROM mcp_connections ORDER BY created_at ASC').all() as Array<{
      id: string;
      name: string;
      command: string;
      args: string;
      status: string;
      created_at: string;
      updated_at: string;
    }>;
    return rows.map(r => ({ ...r, args: JSON.parse(r.args) as string[] }));
  }
}
