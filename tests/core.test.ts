import { describe, expect, test } from 'bun:test';
import {
  Agent,
  AgentEventBus,
  InMemorySessionStore,
  Trace,
  TransientModelError,
  approvalToolGuardrail,
  calculatorTool,
  defineTool,
  safeEval,
} from '../src/index.js';
import { z } from 'zod';
import { MockProvider } from '../src/provider/mock.js';

const calc = calculatorTool();

function twoStepMock(): MockProvider {
  return new MockProvider((_messages, _opts, index) => {
    if (index === 0) {
      return {
        content: 'Using the calculator...',
        toolCalls: [{ id: 't1', name: 'calculator', args: { expression: '2+3*4' } }],
        finishReason: 'tool_calls' as const,
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      };
    }
    return { content: 'The answer is 14.', finishReason: 'stop' as const };
  });
}

describe('core loop', () => {
  test('single-tool loop completes with a typed result', async () => {
    const agent = new Agent({
      name: 'math',
      instructions: 'Use the calculator tool for arithmetic.',
      model: twoStepMock(),
      tools: [calc],
    });
    const result = await agent.run('What is 2+3*4?');
    expect(result.status).toBe('completed');
    expect(result.text).toBe('The answer is 14.');
    expect(result.toolCalls).toBe(1);
    expect(result.turns).toBe(2);
    expect(result.agents).toEqual(['math']);
  });

  test('loop detection aborts identical repeating tool calls', async () => {
    const model = new MockProvider(() => ({
      content: '',
      toolCalls: [{ id: 'loop', name: 'calculator', args: { expression: '1+1' } }],
      finishReason: 'tool_calls' as const,
    }));
    const agent = new Agent({
      name: 'spinner',
      instructions: 'Keep calling the tool.',
      model,
      tools: [calc],
    });
    const result = await agent.run('loop');
    expect(result.status).toBe('error');
    expect(result.error?.kind).toBe('loop_detected');
  });

  test('max_turns_exceeded returns a result, not a throw', async () => {
    const model = new MockProvider((_m, _o, index) => ({
      content: '',
      toolCalls: [{ id: 'c' + index, name: 'calculator', args: { expression: String(index) + '+1' } }],
      finishReason: 'tool_calls' as const,
    }));
    const agent = new Agent({
      name: 'busy',
      instructions: 'Call the tool forever.',
      model,
      tools: [calc],
    });
    const result = await agent.run('go', { runConfig: { maxTurns: 3, maxConsecutiveIdenticalCalls: 100 } });
    expect(result.status).toBe('max_turns_exceeded');
    expect(result.reason).toBeTruthy();
  });
});

describe('structured output', () => {
  test('parses typed structured output on success', async () => {
    const model = new MockProvider(() => ({
      content: '{"answer": "hello"}',
      finishReason: 'stop' as const,
    }));
    const agent = new Agent({
      name: 'structured',
      instructions: 'Always respond with JSON.',
      model,
      outputSchema: z.object({ answer: z.string() }),
    });
    const result = await agent.run<{ answer: string }>('hi');
    expect(result.status).toBe('completed');
    expect(result.data?.answer).toBe('hello');
  });

  test('repairs invalid JSON in one pass', async () => {
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) return { content: '{oops not json', finishReason: 'stop' as const };
      return { content: '{"answer": "repaired"}', finishReason: 'stop' as const };
    });
    const agent = new Agent({
      name: 'repair',
      instructions: 'Respond with JSON.',
      model,
      outputSchema: z.object({ answer: z.string() }),
    });
    const result = await agent.run<{ answer: string }>('fix');
    expect(result.status).toBe('completed');
    expect(result.data?.answer).toBe('repaired');
  });

  test('returns error when repair also fails', async () => {
    const model = new MockProvider(() => ({ content: 'still not json', finishReason: 'stop' as const }));
    const agent = new Agent({
      name: 'broken',
      instructions: 'Respond with JSON.',
      model,
      outputSchema: z.object({ answer: z.string() }),
    });
    const result = await agent.run<{ answer: string }>('fix');
    expect(result.status).toBe('error');
    expect(result.error?.kind).toBe('structured_output');
  });
});

describe('events & trace', () => {
  test('emits the full event lifecycle', async () => {
    const events = new AgentEventBus();
    const seen: string[] = [];
    events.onAny((ev) => seen.push(ev.type));
    const agent = new Agent({
      name: 'math',
      instructions: 'Use the calculator.',
      model: twoStepMock(),
      tools: [calc],
    });
    const result = await agent.run('calc', { events });
    expect(result.status).toBe('completed');
    expect(seen).toContain('run:start');
    expect(seen).toContain('tool:start');
    expect(seen).toContain('tool:end');
    expect(seen).toContain('run:complete');
    expect(seen).toContain('model:call');
  });

  test('Trace pretty-prints and serializes', () => {
    const t = new Trace('run-1');
    t.input = 'hello';
    t.modelCalls.push({ agentName: 'a', attempt: 1, usage: { totalTokens: 9 } });
    t.toolCalls.push({ id: 't', name: 'calculator', input: { expression: '1+1' }, ok: true, output: { result: 2 }, durationMs: 3 });
    t.finishedAt = t.startedAt + 100;
    const json = JSON.parse(t.toJSON());
    expect(json.runId).toBe('run-1');
    expect(t.prettyPrint()).toContain('=== Trace');
    expect(t.totalDurationMs).toBe(100);
  });
});

describe('jsonMode vs tools', () => {
  test('disables JSON mode when tools are declared so tool calling works with outputSchema', async () => {
    const schema = z.object({ title: z.string(), items: z.array(z.object({ name: z.string(), count: z.number() })) });
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return {
          content: '',
          toolCalls: [{ id: 't1', name: 'calculator', args: { expression: '5+5' } }],
          finishReason: 'tool_calls' as const,
        };
      }
      return { content: '{"title":"sum","items":[{"name":"x","count":10}]}', finishReason: 'stop' as const };
    });
    const agent = new Agent({
      name: 'math',
      instructions: 'Use tools.',
      model,
      tools: [calc],
      outputSchema: schema,
    });
    const result = await agent.run<{ title: string }>('x');
    expect(result.status).toBe('completed');
    expect(result.data?.title).toBe('sum');
    expect(model.calls[0]?.opts?.jsonMode).toBe(false);
  });

  test('keeps JSON mode when no tools are declared', async () => {
    const model = new MockProvider(() => ({ content: '{"answer":"ok"}', finishReason: 'stop' as const }));
    const agent = new Agent({
      name: 'solo',
      instructions: 'Reply with JSON.',
      model,
      outputSchema: z.object({ answer: z.string() }),
    });
    await agent.run('hi');
    expect(model.calls[0]?.opts?.jsonMode).toBe(true);
  });
});

describe('provider namespaced tool names (Gemini 400 regression)', () => {
  test('executes tools called with a namespaced name', async () => {
    let executed = 0;
    const calc = defineTool({
      name: 'calculator',
      description: 'x',
      inputSchema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => {
        executed += 1;
        return { result: safeEval(expression) };
      },
    });
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'g1', name: 'default_api:calculator', args: { expression: '5+5' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'ten', finishReason: 'stop' as const };
    });
    const agent = new Agent({ name: 'math', instructions: 'Use the calculator.', model, tools: [calc] });
    const result = await agent.run('what is 5+5?');
    expect(executed).toBe(1);
    expect(result.status).toBe('completed');
  });
});

describe('input guardrails', () => {
  test('run exactly once on the first turn', async () => {
    let runs = 0;
    const counting = {
      name: 'count',
      run: () => {
        runs += 1;
        return { pass: true };
      },
    };
    const agent = new Agent({
      name: 'a',
      instructions: 'x',
      model: new MockProvider(() => ({ content: 'ok', finishReason: 'stop' as const })),
      inputGuardrails: [counting],
    });
    await agent.run('hi');
    expect(runs).toBe(1);
  });

  test('run again for the agent reached after a handoff', async () => {
    let runs = 0;
    const counting = {
      name: 'count',
      run: () => {
        runs += 1;
        return { pass: true };
      },
    };
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'r' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'done', finishReason: 'stop' as const };
    });
    const { AgentRegistry } = await import('../src/index.js');
    const router = new Agent({ name: 'router', instructions: 'r', model: shared, inputGuardrails: [counting] });
    const researcher = new Agent({ name: 'researcher', instructions: 'R', model: shared, inputGuardrails: [counting] });
    const result = await router.run('go', { registry: new AgentRegistry([router, researcher]) });
    expect(result.status).toBe('completed');
    expect(runs).toBe(2);
  });
});

describe('session persistence', () => {
  test('persists the final assistant turn', async () => {
    const store = new InMemorySessionStore();
    const agent = new Agent({
      name: 'a',
      instructions: 'x',
      model: new MockProvider(() => ({ content: 'hello', finishReason: 'stop' as const })),
    });
    const result = await agent.run('hi', { sessionStore: store });
    expect(result.status).toBe('completed');
    const turns = await store.get(result.sessionId);
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(turns[1]?.content).toBe('hello');
  });

  test('persists the structured-output repair turns', async () => {
    const store = new InMemorySessionStore();
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) return { content: '{oops', finishReason: 'stop' as const };
      return { content: '{"answer":"fixed"}', finishReason: 'stop' as const };
    });
    const agent = new Agent({
      name: 'a',
      instructions: 'x',
      model,
      outputSchema: z.object({ answer: z.string() }),
    });
    const result = await agent.run<{ answer: string }>('fix', { sessionStore: store });
    expect(result.status).toBe('completed');
    const turns = await store.get(result.sessionId);
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(turns[3]?.content).toBe('{"answer":"fixed"}');
  });
});

describe('tool-call budget', () => {
  test('exhausting maxToolCalls returns max_tool_calls_exceeded', async () => {
    const model = new MockProvider((_m, _o, index) => ({
      content: '',
      toolCalls: [{ id: 'c' + index, name: 'calculator', args: { expression: '1+1' } }],
      finishReason: 'tool_calls' as const,
    }));
    const agent = new Agent({
      name: 'busy',
      instructions: 'Keep calling.',
      model,
      tools: [calc],
    });
    const result = await agent.run('go', { runConfig: { maxToolCalls: 2, maxTurns: 10, maxConsecutiveIdenticalCalls: 100 } });
    expect(result.status).toBe('max_tool_calls_exceeded');
    expect(result.reason).toContain('tool calls');
  });
});

describe('tool:end events', () => {
  test('emits tool:end with ok:false for unknown tools', async () => {
    const events = new AgentEventBus();
    const ends: string[] = [];
    events.on('tool:end', (ev) => ends.push(`${ev.name}:${ev.ok}`));
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'u1', name: 'no_such_tool', args: {} }], finishReason: 'tool_calls' as const };
      }
      return { content: 'ok', finishReason: 'stop' as const };
    });
    const agent = new Agent({ name: 'a', instructions: 'x', model, tools: [calc] });
    const result = await agent.run('hi', { events });
    expect(result.status).toBe('completed');
    expect(ends).toContain('no_such_tool:false');
  });

  test('emits tool:end with ok:false when a tool guardrail blocks', async () => {
    const events = new AgentEventBus();
    const ends: string[] = [];
    events.on('tool:end', (ev) => ends.push(`${ev.name}:${ev.ok}`));
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'b1', name: 'calculator', args: { expression: '1+1' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'ok', finishReason: 'stop' as const };
    });
    const agent = new Agent({
      name: 'a',
      instructions: 'x',
      model,
      tools: [calc],
      toolGuardrails: [approvalToolGuardrail({ requireApproval: async () => false })],
    });
    const result = await agent.run('hi', { events });
    expect(result.status).toBe('completed');
    expect(ends).toContain('calculator:false');
  });

  test('unknown tools bypass tool guardrails without crashing', async () => {
    let guardrailSawUndefined = false;
    const readsTool = {
      name: 'reads_tool',
      run: (tool: unknown) => {
        if (tool === undefined) guardrailSawUndefined = true;
        return { pass: true };
      },
    };
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'u1', name: 'mystery', args: {} }], finishReason: 'tool_calls' as const };
      }
      return { content: 'ok', finishReason: 'stop' as const };
    });
    const agent = new Agent({ name: 'a', instructions: 'x', model, tools: [calc], toolGuardrails: [readsTool] });
    const result = await agent.run('hi');
    expect(result.status).toBe('completed');
    expect(guardrailSawUndefined).toBe(false);
  });
});

describe('abort handling', () => {
  test('aborting the run short-circuits model retries and reports timeout', async () => {
    let attempts = 0;
    const model = new MockProvider(() => {
      attempts += 1;
      throw new TransientModelError('boom');
    });
    const agent = new Agent({ name: 'a', instructions: 'x', model });
    const ac = new AbortController();
    const promise = agent.run('hi', { signal: ac.signal, runConfig: { maxRetries: 3, retryBaseDelayMs: 100 } });
    setTimeout(() => ac.abort(), 10);
    const result = await promise;
    expect(attempts).toBe(1);
    expect(result.status).toBe('error');
    expect(result.error?.kind).toBe('timeout');
  });
});