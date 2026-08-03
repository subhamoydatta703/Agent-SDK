import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { InMemorySessionStore, calculatorTool, docSenseTool, extractJsonBlock, parseStructured, safeEval, webSearchTool } from '../src/index.js';
import { toJsonSchema } from '../src/zod-util.js';

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

describe('toJsonSchema (Gemini-compatible parameters)', () => {
  test('strips $schema and additionalProperties at the top level', () => {
    const schema = toJsonSchema(calculatorTool().inputSchema);
    expect(schema).not.toHaveProperty('$schema');
    expect(schema).not.toHaveProperty('additionalProperties');
    expect(schema.type).toBe('object');
    expect(schema.required).toEqual(['expression']);
    expect((schema.properties as Record<string, unknown>).expression).toBeDefined();
  });

  test('strips additionalProperties recursively on nested objects', () => {
    const schema = toJsonSchema(z.object({ a: z.string(), b: z.object({ c: z.number() }) }));
    const nested = (schema.properties as Record<string, Record<string, unknown>>).b!;
    expect(nested).not.toHaveProperty('additionalProperties');
    expect(nested).not.toHaveProperty('$schema');
    expect(nested.type).toBe('object');
    expect(schema.required).toEqual(['a', 'b']);
  });
});

describe('structured JSON extraction', () => {
  test('extracts balanced JSON and ignores trailing prose with braces', () => {
    expect(extractJsonBlock('Answer: {"a":1} and then {oops}')).toBe('{"a":1}');
    expect(extractJsonBlock('[1,2] more')).toBe('[1,2]');
    expect(extractJsonBlock('{"a":{"b":[1,2]}}')).toBe('{"a":{"b":[1,2]}}');
    expect(extractJsonBlock('{"s":"a{b}c"} done')).toBe('{"s":"a{b}c"}');
    expect(extractJsonBlock('no json here')).toBeNull();
  });

  test('parseStructured succeeds when prose trails the JSON', () => {
    const res = parseStructured('Here you go: {"answer": 42} hope that helps', z.object({ answer: z.number() }));
    expect(res.ok).toBe(true);
  });
});