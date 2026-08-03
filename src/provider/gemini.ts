import type { ChatMessage, ModelCallOptions, ModelResult, ModelProvider, ToolSchema } from './types.js';
import { PermanentModelError, TransientModelError } from './errors.js';
import { randomUUID } from 'crypto';

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  /** Opaque per-part signature for Gemini thinking models; must be echoed back on the same part when history is replayed. */
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string; status?: string };
}

export class GeminiProvider implements ModelProvider {
  readonly id = 'gemini';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(opts: GeminiProviderOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = opts.model ?? 'gemini-2.0-flash';
    this.baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  static fromEnv(model?: string): GeminiProvider {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GeminiProvider.fromEnv(): GEMINI_API_KEY is not set. Add it to your environment (or a .env file loaded with dotenv) before constructing the provider.'
      );
    }
    return new GeminiProvider({ apiKey, ...(model ? { model } : {}) });
  }

  async complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult> {
    if (!this.apiKey) {
      throw new PermanentModelError(
        'GeminiProvider: missing API key. Set the GEMINI_API_KEY environment variable or pass apiKey in the adapter options.'
      );
    }
    const { contents, systemInstruction } = this.toGemini(messages);
    const body: Record<string, unknown> = { contents };
    if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
    if (opts?.tools?.length) {
      body.tools = [{ functionDeclarations: opts.tools.map((t: ToolSchema) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })) }];
    }
    if (opts?.jsonMode) {
      body.generationConfig = { responseMimeType: 'application/json' };
    }
    const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts?.signal,
      });
    } catch (e) {
      throw new TransientModelError(`Gemini network request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!resp.ok) {
      const txt = (await resp.text().catch(() => '')) || '';
      if (resp.status === 429 || resp.status >= 500) {
        throw new TransientModelError(`Gemini error ${resp.status}: ${txt}`);
      }
      throw new PermanentModelError(`Gemini error ${resp.status}: ${txt}`);
    }
    const json = (await resp.json()) as GeminiResponse;
    return this.fromGemini(json);
  }

  private toGemini(messages: ChatMessage[]): { contents: GeminiContent[]; systemInstruction?: string } {
    let systemInstruction: string | undefined;
    const contents: GeminiContent[] = [];
    for (const m of messages) {
      if (m.role === 'system') {
        systemInstruction = (systemInstruction ? systemInstruction + '\n' : '') + (m.content ?? '');
        continue;
      }
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content ?? '' }] });
      } else if (m.role === 'assistant') {
        const parts: GeminiPart[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.toolCalls ?? []) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: (tc.args ?? {}) as Record<string, unknown>,
            },
            ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
          });
        }
        contents.push({ role: 'model', parts });
      } else if (m.role === 'tool' && m.toolResults) {
        for (const tr of m.toolResults) {
          contents.push({
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: tr.name ?? '',
                  response: tr.ok ? ({ result: tr.data } as Record<string, unknown>) : ({ error: tr.error ?? 'tool failed' } as Record<string, unknown>),
                },
              },
            ],
          });
        }
      }
    }
    return { contents, systemInstruction };
  }

  private fromGemini(json: GeminiResponse): ModelResult {
    if (json.error?.message) {
      throw new PermanentModelError(`Gemini API error: ${json.error.message}`);
    }
    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    let content = '';
    const toolCalls = [];
    for (const p of parts) {
      if (p.text) content += p.text;
      if (p.functionCall) {
        toolCalls.push({
          id: randomUUID(),
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
          thoughtSignature: p.thoughtSignature,
        });
      }
    }
    const finish = candidate?.finishReason;
    return {
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: json.usageMetadata
        ? {
            promptTokens: json.usageMetadata.promptTokenCount,
            completionTokens: json.usageMetadata.candidatesTokenCount,
            totalTokens: json.usageMetadata.totalTokenCount,
          }
        : undefined,
      finishReason:
        finish === 'MAX_TOKENS'
          ? 'length'
          : finish === 'SAFETY'
            ? 'content_filter'
            : toolCalls.length
              ? 'tool_calls'
              : 'stop',
      raw: json,
    };
  }
}