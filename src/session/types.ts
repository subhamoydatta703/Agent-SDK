import type { Turn } from '../types.js';

export interface SessionStore {
  get(sessionId: string): Promise<Turn[]>;
  append(sessionId: string, turn: Turn): Promise<void>;
  clear(sessionId: string): Promise<void>;
}