import { describe, expect, test } from 'bun:test';
import { Agent, AgentEventBus, AgentRegistry, Trace, traceFromBus } from '../src/index.js';
import { MockProvider } from '../src/provider/mock.js';
import type { ChatMessage } from '../src/provider/types.js';

describe('handoffs', () => {
  test('router hands off to a specialist and completes', async () => {
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'needs research' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'Research complete.', finishReason: 'stop' as const };
    });
    const router = new Agent({ name: 'router', instructions: 'Route to a specialist.', model: shared });
    const researcher = new Agent({ name: 'researcher', instructions: 'You research things.', model: shared });
    const registry = new AgentRegistry([router, researcher]);
    const result = await router.run('find something', { registry });
    expect(result.status).toBe('completed');
    expect(result.agents).toEqual(['router', 'researcher']);
  });

  test('prevents A -> B -> A ping-pong loops', async () => {
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'x' } }], finishReason: 'tool_calls' as const };
      }
      return { content: '', toolCalls: [{ id: 'h2', name: 'handoff_to', args: { receiver: 'router', reason: 'hand back' } }], finishReason: 'tool_calls' as const };
    });
    const router = new Agent({ name: 'router', instructions: 'Route.', model: shared });
    const researcher = new Agent({ name: 'researcher', instructions: 'Research.', model: shared });
    const registry = new AgentRegistry([router, researcher]);
    const result = await router.run('ping', { registry });
    expect(result.status).toBe('error');
    expect(result.error?.kind).toBe('handoff_loop');
  });

  test('handles a provider-namespaced handoff tool name', async () => {
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'default_api:handoff_to', args: { receiver: 'researcher', reason: 'r' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'done', finishReason: 'stop' as const };
    });
    const router = new Agent({ name: 'router', instructions: 'Route.', model: shared });
    const researcher = new Agent({ name: 'researcher', instructions: 'Research.', model: shared });
    const result = await router.run('go', { registry: new AgentRegistry([router, researcher]) });
    expect(result.status).toBe('completed');
    expect(result.agents).toEqual(['router', 'researcher']);
  });

  test('keeps the tool call immediately before its result (no interleaved assistant turn)', async () => {
    let captured: ChatMessage[] = [];
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'r' } }], finishReason: 'tool_calls' as const };
      }
      captured = [..._m];
      return { content: 'done', finishReason: 'stop' as const };
    });
    const router = new Agent({ name: 'router', instructions: 'Route.', model: shared });
    const researcher = new Agent({ name: 'researcher', instructions: 'Research.', model: shared });
    const result = await router.run('go', { registry: new AgentRegistry([router, researcher]) });
    expect(result.status).toBe('completed');

    const declIdx = captured.findIndex((m) => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0);
    expect(declIdx).toBeGreaterThanOrEqual(0);
    const resultIdx = captured.findIndex((m, i) => i > declIdx && m.role === 'tool');
    expect(resultIdx).toBeGreaterThan(declIdx);
    const between = captured.slice(declIdx + 1, resultIdx);
    expect(between.every((m) => m.role === 'tool')).toBe(true);
  });

  test('handoff:end event and trace include the reason', async () => {
    let reason = '';
    const events = new AgentEventBus();
    events.on('handoff:end', (ev) => {
      reason = ev.reason;
    });
    let trace: Trace | undefined;
    events.on('run:start', (ev) => {
      trace = traceFromBus(events, ev.runId);
    });
    const shared = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'needs research' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'done', finishReason: 'stop' as const };
    });
    const router = new Agent({ name: 'router', instructions: 'Route.', model: shared });
    const researcher = new Agent({ name: 'researcher', instructions: 'Research.', model: shared });
    const result = await router.run('go', { registry: new AgentRegistry([router, researcher]), events });
    expect(result.status).toBe('completed');
    expect(reason).toBe('needs research');
    expect(trace?.handoffs[0]?.reason).toBe('needs research');
  });
});