import { describe, expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InMemorySessionStore, SQLiteSessionStore } from '../src/index.js';

describe('InMemorySessionStore', () => {
  test('get/append/clear round-trips structured turns', async () => {
    const store = new InMemorySessionStore();
    expect(await store.get('s1')).toEqual([]);
    await store.append('s1', { id: 'a', role: 'user', content: 'hi', timestamp: 1 });
    await store.append('s1', { id: 'b', role: 'assistant', content: 'yo', timestamp: 2 });
    const turns = await store.get('s1');
    expect(turns).toHaveLength(2);
    expect(turns[1]?.role).toBe('assistant');
    await store.clear('s1');
    expect(await store.get('s1')).toEqual([]);
  });
});

describe('SQLiteSessionStore', () => {
  test('persists turns through bun:sqlite (in-memory file)', async () => {
    const store = await SQLiteSessionStore.open(':memory:');
    await store.append('s', { id: 'i', role: 'user', content: 'c', timestamp: 0 });
    expect(await store.get('s')).toHaveLength(1);
    await store.clear('s');
    expect(await store.get('s')).toEqual([]);
  });

  test('close() closes the handle and data persists across reopen', async () => {
    const file = join(tmpdir(), `somoy-session-test-${Math.random()}.db`);
    const store = await SQLiteSessionStore.open(file);
    await store.append('s', { id: 'i', role: 'user', content: 'c', timestamp: 0 });
    store.close();

    const reopened = await SQLiteSessionStore.open(file);
    const turns = await reopened.get('s');
    expect(turns).toHaveLength(1);
    reopened.close();

    // bun:sqlite statement objects keep the file handle alive on Windows until GC,
    // so deletion may race; retry briefly and otherwise leave the temp file for the OS.
    for (let i = 0; i < 40; i++) {
      try {
        rmSync(file, { force: true });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 25));
      }
    }
  });
});