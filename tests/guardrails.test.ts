import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import {
  Agent,
  approvalToolGuardrail,
  defineTool,
  emptyInputGuardrail,
  sensitiveOutputGuardrail,
} from '../src/index.js';
import { MockProvider } from '../src/provider/mock.js';

describe('guardrails', () => {
  test('input guardrail rejects empty input early', async () => {
    const agent = new Agent({
      name: 'gated',
      instructions: 'Reply.',
      model: new MockProvider(() => ({ content: 'should not run', finishReason: 'stop' as const })),
      inputGuardrails: [emptyInputGuardrail()],
    });
    const result = await agent.run('   ');
    expect(result.status).toBe('guardrail_rejected');
    expect(result.reason).toBeTruthy();
  });

  test('output guardrail rejects sensitive data', async () => {
    const agent = new Agent({
      name: 'safe',
      instructions: 'Reply freely.',
      model: new MockProvider(() => ({ content: 'my ssn is 123-45-6789', finishReason: 'stop' as const })),
      outputGuardrails: [sensitiveOutputGuardrail([/\d{3}-\d{2}-\d{4}/])],
    });
    const result = await agent.run('tell me');
    expect(result.status).toBe('guardrail_rejected');
  });

  test('tool guardrail blocks execution when approval is denied', async () => {
    let executed = false;
    const protectedTool = defineTool({
      name: 'delete_record',
      description: 'Deletes a record.',
      inputSchema: z.object({ id: z.string() }),
      execute: async () => {
        executed = true;
        return { deleted: true };
      },
    });
    const model = new MockProvider((_m, _o, index) => {
      if (index === 0) {
        return { content: '', toolCalls: [{ id: 'd1', name: 'delete_record', args: { id: 'x' } }], finishReason: 'tool_calls' as const };
      }
      return { content: 'blocked, moving on', finishReason: 'stop' as const };
    });
    const agent = new Agent({
      name: 'guarded',
      instructions: 'Use tools.',
      model,
      tools: [protectedTool],
      toolGuardrails: [approvalToolGuardrail({ requireApproval: async () => false })],
    });
    const result = await agent.run('delete x');
    expect(result.status).toBe('completed');
    expect(executed).toBe(false);
  });
});