import { afterEach, describe, expect, test } from 'bun:test';
import { GeminiProvider } from '../src/index.js';
import type { ChatMessage, ModelResult } from '../src/provider/types.js';

const originalFetch = globalThis.fetch;

const cannedWithSignature = {
  candidates: [
    {
      content: {
        parts: [
          { functionCall: { name: 'default_api:calculator', args: { expression: '5+5' }, thoughtSignature: 'SIG123' } },
        ],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
};

function stubFetch(canned: unknown): { bodies: string[] } {
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(typeof init?.body === 'string' ? init.body : JSON.stringify(init?.body));
    return new Response(JSON.stringify(canned), { status: 200 });
  }) as typeof fetch;
  return { bodies };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GeminiProvider thought_signature round-trip', () => {
  test('captures thoughtSignature from the model response', async () => {
    stubFetch(cannedWithSignature);
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const result: ModelResult = await provider.complete([{ role: 'user', content: 'hi' }]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls?.[0]?.name).toBe('default_api:calculator');
    expect(result.toolCalls?.[0]?.thoughtSignature).toBe('SIG123');
  });

  test('echoes thoughtSignature and uses the tool name on functionResponse', async () => {
    const { bodies } = stubFetch(cannedWithSignature);
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const messages: ChatMessage[] = [
      { role: 'user', content: 'what is 5+5' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'a1', name: 'default_api:calculator', args: { expression: '5+5' }, thoughtSignature: 'SIG123' }],
      },
      { role: 'tool', toolResults: [{ toolCallId: 'a1', name: 'default_api:calculator', ok: true, data: { result: 10 } }] },
    ];
    await provider.complete(messages, { tools: [{ name: 'calculator', description: 'x', parameters: {} }] });

    const body = JSON.parse(bodies[0]!) as { contents: any[] };
    const modelPart = body.contents[1]!.parts[0];
    expect(modelPart.functionCall.thoughtSignature).toBe('SIG123');
    const userPart = body.contents[2]!.parts[0];
    expect(userPart.functionResponse.name).toBe('default_api:calculator');
  });

  test('omits thoughtSignature when the call carries none', async () => {
    const { bodies } = stubFetch(cannedWithSignature);
    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const messages: ChatMessage[] = [
      { role: 'assistant', content: '', toolCalls: [{ id: 'a1', name: 'calculator', args: { expression: '1+1' } }] },
    ];
    await provider.complete(messages);

    const body = JSON.parse(bodies[0]!) as { contents: any[] };
    expect(body.contents[0]!.parts[0].functionCall.thoughtSignature).toBeUndefined();
  });
});
