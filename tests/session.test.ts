import { describe, expect, test } from 'bun:test';
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
});