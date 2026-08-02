import type { ToolCallRecord, ToolResultRecord } from '../types.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  toolCalls?: ToolCallRecord[];
  toolResults?: ToolResultRecord[];
  name?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ModelCallOptions {
  tools?: ToolSchema[];
  temperature?: number;
  jsonMode?: boolean;
  signal?: AbortSignal;
  stop?: string[];
}

export interface ModelUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export type ModelFinishReason = 'stop' | 'tool_calls' | 'length' | 'content_filter' | 'unknown';

export interface ModelResult {
  content: string;
  toolCalls?: ToolCallRecord[];
  usage?: ModelUsage;
  finishReason: ModelFinishReason;
  raw?: unknown;
}

export interface ModelProvider {
  readonly id: string;
  complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult>;
}