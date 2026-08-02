import type { SessionStore } from './types.js';
import type { Turn } from '../types.js';

export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, Turn[]>();

  async get(sessionId: string): Promise<Turn[]> {
    return [...(this.store.get(sessionId) ?? [])];
  }

  async append(sessionId: string, turn: Turn): Promise<void> {
    const arr = this.store.get(sessionId) ?? [];
    arr.push(turn);
    this.store.set(sessionId, arr);
  }

  async clear(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }

  size(): number {
    return this.store.size;
  }
}