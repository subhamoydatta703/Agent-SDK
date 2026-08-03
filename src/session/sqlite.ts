import type { SessionStore } from './types.js';
import type { Turn } from '../types.js';

interface StatementLike {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface DatabaseLike {
  exec(sql: string): unknown;
  prepare(sql: string): StatementLike;
  close(): void;
}

interface DbModule {
  Database: new (path: string) => DatabaseLike;
}

/**
 * Loads whichever SQLite driver is available at runtime. bun:sqlite is tried
 * first (primary dev runtime), then node:sqlite (Node >= 22.5), then
 * better-sqlite3. All attempts are guarded so the public SDK surface never
 * depends on a specific runtime's SQLite API.
 */
async function loadDriver(): Promise<DbModule> {
  const attempts: Array<{ spec: string }> = [
    { spec: 'bun:sqlite' },
    { spec: 'node:sqlite' },
    { spec: 'better-sqlite3' },
  ];
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      let mod = (await import(attempt.spec)) as unknown;
      if (attempt.spec === 'better-sqlite3') mod = (mod as { default: unknown }).default;
      return mod as DbModule;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(
    'SQLiteSessionStore: no SQLite driver available. Run under Bun (bun:sqlite), Node >= 22.5 (node:sqlite), or install better-sqlite3. Driver errors: ' +
      errors.join(' | ')
  );
}

interface SessionRow {
  id: string;
  data: string;
}

export class SQLiteSessionStore implements SessionStore {
  private constructor(private db: DatabaseLike) {}

  static async open(path: string = ':memory:'): Promise<SQLiteSessionStore> {
    const mod = await loadDriver();
    const db = new mod.Database(path);
    db.exec(
      'CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL)'
    );
    return new SQLiteSessionStore(db);
  }

  async get(sessionId: string): Promise<Turn[]> {
    const row = this.db.prepare('SELECT data FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
    if (!row) return [];
    return JSON.parse(row.data) as Turn[];
  }

  async append(sessionId: string, turn: Turn): Promise<void> {
    const existing = await this.get(sessionId);
    existing.push(turn);
    const stmt = this.db.prepare(
      'INSERT INTO sessions (id, data, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
    );
    stmt.run(sessionId, JSON.stringify(existing), Date.now());
  }

  async clear(sessionId: string): Promise<void> {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  close(): void {
    this.db.close();
  }
}