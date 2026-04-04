import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { SCHEMA_SQL, MIGRATION_ADD_ERROR_MESSAGE } from './schema.js';

/**
 * SERVICE database wrapper.
 * Opens SQLite at ~/.service/service.db and runs migrations.
 */
export class ServiceDatabase {
  public readonly db: Database.Database;
  private static instance: ServiceDatabase | null = null;

  constructor(dbPath?: string) {
    const serviceDir = join(homedir(), '.service');
    mkdirSync(serviceDir, { recursive: true });

    const finalPath = dbPath ?? join(serviceDir, 'service.db');
    this.db = new Database(finalPath);

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.runMigrations();
  }

  /** Run schema migrations */
  private runMigrations(): void {
    this.db.exec(SCHEMA_SQL);

    // Safe migration: add error_message column if it doesn't exist
    const cols = (this.db.prepare("PRAGMA table_info(integrations)").all() as Array<{ name: string }>)
      .map(r => r.name);
    if (!cols.includes('error_message')) {
      try { this.db.exec(MIGRATION_ADD_ERROR_MESSAGE); } catch { /* already exists */ }
    }
  }

  /** Get or create singleton instance */
  static getInstance(dbPath?: string): ServiceDatabase {
    if (!ServiceDatabase.instance) {
      ServiceDatabase.instance = new ServiceDatabase(dbPath);
    }
    return ServiceDatabase.instance;
  }

  /** Reset singleton (for testing) */
  static resetInstance(): void {
    if (ServiceDatabase.instance) {
      ServiceDatabase.instance.close();
      ServiceDatabase.instance = null;
    }
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}
