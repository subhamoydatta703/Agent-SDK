import { EventEmitter } from 'eventemitter3';
import type { RunResult } from './result.js';
import type { ToolCallRecord } from './types.js';
import type { ModelUsage } from './provider/types.js';

export type AgentEvent =
  | { type: 'run:start'; runId: string; agentName: string; sessionId: string; input: string }
  | { type: 'text:delta'; runId: string; agentName: string; delta: string }
  | { type: 'tool:start'; runId: string; toolCall: ToolCallRecord }
  | {
      type: 'tool:end';
      runId: string;
      toolCallId: string;
      name: string;
      ok: boolean;
      data?: unknown;
      error?: string;
      durationMs: number;
    }
  | { type: 'model:call'; runId: string; agentName: string; attempt: number; usage?: ModelUsage }
  | { type: 'retry'; runId: string; attempt: number; maxRetries: number; delayMs: number; error: string }
  | { type: 'handoff:start'; runId: string; from: string; to: string; reason: string }
  | { type: 'handoff:end'; runId: string; from: string; to: string; reason: string }
  | {
      type: 'guardrail:triggered';
      runId: string;
      kind: 'input' | 'output' | 'tool';
      name: string;
      pass: boolean;
      reason?: string;
      toolName?: string;
    }
  | { type: 'run:complete'; runId: string; result: RunResult }
  | { type: 'run:error'; runId: string; error: string };

export type AgentEventMap = {
  [K in AgentEvent['type']]: (ev: Extract<AgentEvent, { type: K }>) => void;
};

export class AgentEventBus {
  private emitter = new EventEmitter();
  private anyListeners = new Set<(ev: AgentEvent) => void>();

  on<K extends AgentEvent['type']>(type: K, fn: AgentEventMap[K]): this {
    this.emitter.on(type, fn as unknown as (...args: unknown[]) => void);
    return this;
  }

  once<K extends AgentEvent['type']>(type: K, fn: AgentEventMap[K]): this {
    this.emitter.once(type, fn as unknown as (...args: unknown[]) => void);
    return this;
  }

  off<K extends AgentEvent['type']>(type: K, fn: AgentEventMap[K]): this {
    this.emitter.off(type, fn as unknown as (...args: unknown[]) => void);
    return this;
  }

  onAny(fn: (ev: AgentEvent) => void): this {
    this.anyListeners.add(fn);
    return this;
  }

  emit(ev: AgentEvent): void {
    this.emitter.emit(ev.type, ev as unknown as never);
    for (const fn of this.anyListeners) fn(ev);
  }
}

export function eventStream(bus: AgentEventBus): AsyncIterable<AgentEvent> {
  const queue: AgentEvent[] = [];
  let done = false;
  let resolveWait: (() => void) | null = null;
  bus.onAny((ev) => {
    queue.push(ev);
    if (resolveWait) {
      const r = resolveWait;
      resolveWait = null;
      r();
    }
    if (ev.type === 'run:complete' || ev.type === 'run:error') done = true;
  });
  return {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          while (queue.length === 0 && !done) {
            await new Promise<void>((res) => {
              resolveWait = res;
            });
          }
          if (queue.length === 0 && done) return { done: true, value: undefined };
          return { done: false, value: queue.shift()! };
        },
      };
    },
  };
}

export type { AgentEvent as SomoyEvent };