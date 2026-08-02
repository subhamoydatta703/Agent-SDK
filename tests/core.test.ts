import { describe, expect, test } from 'bun:test';
import { Agent, AgentEventBus, Trace, calculatorTool } from '../src/index.js';
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