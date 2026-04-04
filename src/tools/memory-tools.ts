import type Database from 'better-sqlite3';

/** Row returned from agent_notes table */
interface NoteRow {
  key: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/**
 * Manages agent note CRUD operations against the agent_notes SQLite table.
 * Provides cross-session memory for AI agents.
 */
export class MemoryTools {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /** Save a key-value note. Upserts: creates or updates. A-MCP-11 */
  saveNote(key: string, content: string): { success: boolean; key: string } {
    const now = new Date().toISOString();
    this.db.prepare(
      `INSERT INTO agent_notes (key, content, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    ).run(key, content, now, now);
    return { success: true, key };
  }

  /** Retrieve a note by key. Returns null if not found. A-MCP-12 */
  getNote(key: string): NoteRow | null {
    const row = this.db.prepare(
      'SELECT key, content, created_at, updated_at FROM agent_notes WHERE key = ?'
    ).get(key) as NoteRow | undefined;
    return row ?? null;
  }

  /** List all saved notes. A-MCP-13 */
  listNotes(): NoteRow[] {
    return this.db.prepare(
      'SELECT key, content, created_at, updated_at FROM agent_notes ORDER BY updated_at DESC'
    ).all() as NoteRow[];
  }

  /** Delete a note by key. Returns true if a row was deleted. */
  deleteNote(key: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM agent_notes WHERE key = ?'
    ).run(key);
    return result.changes > 0;
  }
}
