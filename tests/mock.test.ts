import { describe, expect, test } from 'bun:test';
import { Agent, calculatorTool, MockProvider } from '../src/index.js';

describe('MockProvider smart default', () => {
  test('answers arbitrary arithmetic without a custom handler', async () => {
    const agent = new Agent({
      name: 'math',
      instructions: 'Use the calculator tool for arithmetic.',
      model: new MockProvider(),
      tools: [calculatorTool()],
    });
    const result = await agent.run('What is 123*456?');
    expect(result.status).toBe('completed');
    expect(result.toolCalls).toBeGreaterThanOrEqual(1);
    expect(result.text).toContain('56088');
  });

  test('handles functions and multiple operators', async () => {
    const agent = new Agent({
      name: 'math',
      instructions: 'Use the calculator tool.',
      model: new MockProvider(),
      tools: [calculatorTool()],
    });
    const result = await agent.run('What is sqrt(81)+max(2,7)^2?');
    expect(result.status).toBe('completed');
    expect(result.text).toContain('58');
  });

  test('returns a non-empty reply when there is nothing to compute', async () => {
    const agent = new Agent({
      name: 'chat',
      instructions: 'Be helpful.',
      model: new MockProvider(),
    });
    const result = await agent.run('Hello there');
    expect(result.status).toBe('completed');
    expect(result.text.length).toBeGreaterThan(0);
  });

  test('custom handler still takes precedence', async () => {
    const model = new MockProvider(() => ({ content: 'custom', finishReason: 'stop' as const }));
    const agent = new Agent({ name: 'chat', instructions: 'x', model });
    const result = await agent.run('What is 1+1?');
    expect(result.status).toBe('completed');
    expect(result.text).toBe('custom');
    expect(result.toolCalls).toBe(0);
  });
});
