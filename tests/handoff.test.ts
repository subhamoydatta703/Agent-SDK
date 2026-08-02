import { describe, expect, test } from 'bun:test';
import { Agent, AgentRegistry } from '../src/index.js';
import { MockProvider } from '../src/provider/mock.js';

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
});