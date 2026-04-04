/**
 * SQL schema definitions for SERVICE database.
 * Creates all required tables on first run.
 */

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config BLOB,
    status TEXT NOT NULL DEFAULT 'inactive',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_event_at TEXT,
    error_message TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS mcp_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    args TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'disconnected',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    disconnected_at TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS agent_notes (
    key TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS notifications_fts USING fts5(
    title,
    body,
    source,
    content='notifications',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS notifications_ai AFTER INSERT ON notifications BEGIN
    INSERT INTO notifications_fts(rowid, title, body, source)
    VALUES (new.rowid, new.title, new.body, new.source);
  END;

  CREATE TRIGGER IF NOT EXISTS notifications_ad AFTER DELETE ON notifications BEGIN
    INSERT INTO notifications_fts(notifications_fts, rowid, title, body, source)
    VALUES ('delete', old.rowid, old.title, old.body, old.source);
  END;

  CREATE TRIGGER IF NOT EXISTS notifications_au AFTER UPDATE ON notifications BEGIN
    INSERT INTO notifications_fts(notifications_fts, rowid, title, body, source)
    VALUES ('delete', old.rowid, old.title, old.body, old.source);
    INSERT INTO notifications_fts(rowid, title, body, source)
    VALUES (new.rowid, new.title, new.body, new.source);
  END;
`;

/**
 * Migration: add error_message column to integrations if missing.
 * Safe to run on existing databases.
 */
export const MIGRATION_ADD_ERROR_MESSAGE = `
  ALTER TABLE integrations ADD COLUMN error_message TEXT;
`;
