import type { ChatMessage, ModelCallOptions, ModelResult, ModelProvider, ToolSchema } from './types.js';
import { PermanentModelError, TransientModelError } from './errors.js';
import { randomUUID } from 'crypto';

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export class OpenAIProvider implements ModelProvider {
  readonly id = 'openai';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts: OpenAIProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = opts.model ?? 'gpt-4o-mini';
    this.baseUrl = opts.baseUrl ?? 'https://api.openai.com/v1';
  }

  async complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult> {
    if (!this.apiKey) {
      throw new PermanentModelError(
        'OpenAIProvider: missing API key. Set the OPENAI_API_KEY environment variable or pass apiKey in the adapter options.'
      );
    }
    const body = this.toPayload(messages, opts);
    let resp: Response;
    try {
      resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: opts?.signal,
      });
    } catch (e) {
      throw new TransientModelError(`OpenAI network request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!resp.ok) {
      const txt = (await resp.text().catch(() => '')) || '';
      if (resp.status === 429 || resp.status >= 500) {
        throw new TransientModelError(`OpenAI error ${resp.status}: ${txt}`);
      }
      throw new PermanentModelError(`OpenAI error ${resp.status}: ${txt}`);
    }
    const json = (await resp.json()) as unknown;
    return this.fromPayload(json);
  }

  private toPayload(messages: ChatMessage[], opts?: ModelCallOptions): Record<string, unknown> {
    const apiMessages: unknown[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        apiMessages.push({ role: 'system', content: m.content });
      } else if (m.role === 'user') {
        apiMessages.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const msg: Record<string, unknown> = { role: 'assistant', content: m.content ?? null };
        if (m.toolCalls?.length) {
          msg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: this.safeStringify(tc.args) },
          }));
        }
        apiMessages.push(msg);
      } else if (m.role === 'tool' && m.toolResults) {
        for (const tr of m.toolResults) {
          apiMessages.push({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.ok ? this.safeStringify(tr.data) : `Error: ${tr.error ?? 'tool failed'}`,
          });
        }
      }
    }
    const payload: Record<string, unknown> = {
      model: this.model,
      messages: apiMessages,
      temperature: opts?.temperature ?? 0.2,
    };
    if (opts?.tools?.length) {
      payload.tools = opts.tools.map((t: ToolSchema) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }
    if (opts?.jsonMode) payload.response_format = { type: 'json_object' };
    return payload;
  }

  private fromPayload(json: unknown): ModelResult {
    const body = json as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: OpenAIToolCall[] };
        finish_reason?: string;
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = body.choices?.[0];
    const content = choice?.message?.content ?? '';
    const toolCalls = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id ?? randomUUID(),
      name: tc.function.name,
      args: this.parseArgs(tc.function.arguments),
    }));
    const finish = choice?.finish_reason;
    return {
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens,
            completionTokens: body.usage.completion_tokens,
            totalTokens: body.usage.total_tokens,
          }
        : undefined,
      finishReason: finish === 'tool_calls' ? 'tool_calls' : finish === 'length' ? 'length' : 'stop',
      raw: body,
    };
  }

  private parseArgs(args: string): unknown {
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }

  private safeStringify(v: unknown): string {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
}