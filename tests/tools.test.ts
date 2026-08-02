import { describe, expect, test } from 'bun:test';
import { InMemorySessionStore, calculatorTool, docSenseTool, safeEval, webSearchTool } from '../src/index.js';

const ctx = { session: new InMemorySessionStore(), agentName: 'test' };

describe('calculator / safeEval', () => {
  test('safeEval arithmetic and precedence', () => {
    expect(safeEval('2+3*4')).toBe(14);
    expect(safeEval('(2+3)*4')).toBe(20);
    expect(safeEval('2^3')).toBe(8);
    expect(safeEval('max(1,5,3)')).toBe(5);
    expect(() => safeEval('2+')).toThrow();
  });
  test('calculatorTool returns schema-valid output', async () => {
    const t = calculatorTool();
    const out = await t.execute({ expression: '10/2' }, ctx);
    expect(out).toEqual({ result: 5 });
  });
});

describe('docSense retrieval', () => {
  test('ranks documents by token overlap', async () => {
    const t = docSenseTool({
      documents: {
        a: 'The capital of France is Paris.',
        b: 'Pizza is a delicious Italian food.',
      },
      topK: 1,
    });
    const out = (await t.execute({ query: 'French capital' }, ctx)) as Array<{ id: string }>;
    expect(out[0]?.id).toBe('a');
  });
});

describe('web search', () => {
  test('uses injected searcher (no network)', async () => {
    const t = webSearchTool({ performSearch: async () => 'sample result' });
    const out = await t.execute({ query: 'anything' }, ctx);
    expect(out).toBe('sample result');
  });
});