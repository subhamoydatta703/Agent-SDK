import type { ZodType } from 'zod';
import type { ModelProvider } from './provider/types.js';
import type { Tool } from './tool.js';
import type { InputGuardrail, OutputGuardrail, ToolGuardrail } from './guardrail.js';
import type { SessionStore } from './session/types.js';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
}

export interface ToolResultRecord {
  toolCallId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  durationMs?: number;
}

export interface HandoffRecord {
  from: string;
  to: string;
  reason: string;
}

export interface Turn {
  id: string;
  role: Role;
  agentName?: string;
  content?: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
  handoff?: HandoffRecord;
  timestamp: number;
}

export interface RunConfig {
  maxTurns: number;
  maxToolCalls: number;
  timeoutMs: number;
  modelTimeoutMs: number;
  maxConsecutiveIdenticalCalls: number;
  handoffLoopWindow: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  truncate: ((turns: Turn[]) => Turn[]) | null;
}

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxTurns: 12,
  maxToolCalls: 30,
  timeoutMs: 60_000,
  modelTimeoutMs: 30_000,
  maxConsecutiveIdenticalCalls: 3,
  handoffLoopWindow: 3,
  maxRetries: 3,
  retryBaseDelayMs: 200,
  truncate: null,
};

export interface AgentConfig {
  name: string;
  instructions: string;
  model: ModelProvider;
  tools?: Tool[];
  inputGuardrails?: InputGuardrail[];
  outputGuardrails?: OutputGuardrail[];
  toolGuardrails?: ToolGuardrail[];
  outputSchema?: ZodType;
}

export interface RunState {
  runId: string;
  sessionId: string;
  input: string;
  config: AgentConfig;
  runConfig: RunConfig;
  sessionStore: SessionStore;
  transcript: Turn[];
  agentName: string;
  turnCount: number;
  toolCallCount: number;
  handoffChain: string[];
  startTime: number;
  signal?: AbortSignal;
  consecutiveIdentical: { name: string; argsKey: string; count: number } | null;
}
