import type { ChatMessage, ModelCallOptions, ModelResult, ModelProvider } from './types.js';
import { safeEval } from '../tools.js';

export type MockHandler = (
  messages: ChatMessage[],
  opts: ModelCallOptions | undefined,
  index: number
) => ModelResult | Promise<ModelResult>;

export interface MockCall {
  messages: ChatMessage[];
  opts?: ModelCallOptions;
  index: number;
}

const CALCULATOR = 'calculator';

function extractExpression(text: string): string | null {
  let candidate = text.replace(/\s*[=?.!]+\s*$/g, '').trim();
  if (!candidate || candidate.length > 200 || !/\d/.test(candidate)) return null;
  const words = candidate.split(/\s+/);
  for (let start = 0; start < words.length; start++) {
    const sub = words.slice(start).join(' ');
    try {
      const value = safeEval(sub);
      if (Number.isFinite(value)) return sub;
    } catch {
      // not a valid expression; drop the next leading word and retry
    }
  }
  return null;
}

function defaultMockHandler(messages: ChatMessage[], opts: ModelCallOptions | undefined, index: number): ModelResult {
  const last = messages[messages.length - 1];
  if (last?.role === 'tool') {
    const tr = last.toolResults?.[0];
    if (tr) {
      return tr.ok
        ? { content: `The result is ${JSON.stringify(tr.data)}.`, finishReason: 'stop' }
        : { content: `The tool failed: ${tr.error ?? 'unknown error'}.`, finishReason: 'stop' };
    }
  }
  const hasCalculator = (opts?.tools ?? []).some((t) => t.name === CALCULATOR);
  const userText = last?.role === 'user' ? (last.content ?? '') : '';
  const expr = extractExpression(userText);
  if (hasCalculator && expr) {
    return {
      content: '',
      toolCalls: [{ id: `mock-tc-${index}`, name: CALCULATOR, args: { expression: expr } }],
      finishReason: 'tool_calls',
    };
  }
  return { content: userText ? `Mock reply: ${userText}` : 'Mock reply.', finishReason: 'stop' };
}

export class MockProvider implements ModelProvider {
  readonly id = 'mock';
  calls: MockCall[] = [];
  private handler: MockHandler | null;

  constructor(handler?: MockHandler) {
    this.handler = handler ?? null;
  }

  setHandler(handler: MockHandler): this {
    this.handler = handler;
    return this;
  }

  async complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult> {
    const index = this.calls.length;
    this.calls.push({ messages, opts, index });
    if (this.handler) return await this.handler(messages, opts, index);
    return defaultMockHandler(messages, opts, index);
  }
}
