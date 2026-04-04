import { ServiceDatabase } from '../db/database.js';
import { MemoryTools } from '../tools/memory-tools.js';
import { mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('MemoryTools', () => {
  const testDir = join(tmpdir(), 'service-memory-test-' + process.pid);
  const testDbPath = join(testDir, 'test.db');
  let db: ServiceDatabase;
  let tools: MemoryTools;

  beforeEach(() => {
    ServiceDatabase.resetInstance();
    mkdirSync(testDir, { recursive: true });
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
    db = new ServiceDatabase(testDbPath);
    tools = new MemoryTools(db.db);
  });

  afterEach(() => {
    db.close();
    ServiceDatabase.resetInstance();
    try { unlinkSync(testDbPath); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-wal'); } catch { /* ignore */ }
    try { unlinkSync(testDbPath + '-shm'); } catch { /* ignore */ }
  });

  describe('saveNote', () => {
    it('should save a new note', () => {
      const result = tools.saveNote('test-key', 'hello world');
      expect(result.success).toBe(true);
      expect(result.key).toBe('test-key');
    });

    it('should upsert an existing note', () => {
      tools.saveNote('test-key', 'first');
      tools.saveNote('test-key', 'second');
      const note = tools.getNote('test-key');
      expect(note).not.toBeNull();
      expect(note!.content).toBe('second');
    });
  });

  describe('getNote', () => {
    it('should retrieve a saved note', () => {
      tools.saveNote('mykey', 'my content');
      const note = tools.getNote('mykey');
      expect(note).not.toBeNull();
      expect(note!.key).toBe('mykey');
      expect(note!.content).toBe('my content');
      expect(note!.created_at).toBeDefined();
      expect(note!.updated_at).toBeDefined();
    });

    it('should return null for nonexistent key', () => {
      const note = tools.getNote('nonexistent');
      expect(note).toBeNull();
    });
  });

  describe('listNotes', () => {
    it('should return empty array when no notes', () => {
      const notes = tools.listNotes();
      expect(notes).toEqual([]);
    });

    it('should return all saved notes', () => {
      tools.saveNote('key1', 'value1');
      tools.saveNote('key2', 'value2');
      tools.saveNote('key3', 'value3');
      const notes = tools.listNotes();
      expect(notes.length).toBe(3);
      const keys = notes.map(n => n.key);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('deleteNote', () => {
    it('should delete an existing note', () => {
      tools.saveNote('delme', 'content');
      const deleted = tools.deleteNote('delme');
      expect(deleted).toBe(true);
      expect(tools.getNote('delme')).toBeNull();
    });

    it('should return false for nonexistent note', () => {
      const deleted = tools.deleteNote('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('round-trip', () => {
    it('should save and get a note correctly (A-MCP-11, A-MCP-12)', () => {
      tools.saveNote('test', 'hello');
      const note = tools.getNote('test');
      expect(note).not.toBeNull();
      expect(note!.content).toBe('hello');
    });

    it('should save, update, and get correctly', () => {
      tools.saveNote('evolving', 'version1');
      tools.saveNote('evolving', 'version2');
      const note = tools.getNote('evolving');
      expect(note!.content).toBe('version2');
    });
  });
});
