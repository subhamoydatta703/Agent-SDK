import type { ChatMessage, ModelCallOptions, ModelResult, ModelProvider } from './types.js';

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
    return { content: '', finishReason: 'stop' };
  }
}