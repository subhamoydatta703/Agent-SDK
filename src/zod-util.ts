import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * zod-to-json-schema emits JSON Schema v7 meta-keywords ($schema, additionalProperties)
 * that Gemini's OpenAPI-style function declarations reject ("Cannot find field"). The
 * keywords carry no meaning for tool-calling input schemas, so we strip them recursively.
 */
function stripUnsupportedKeys(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupportedKeys);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$schema' || key === 'additionalProperties') continue;
      out[key] = stripUnsupportedKeys(value);
    }
    return out;
  }
  return node;
}

export function toJsonSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  return stripUnsupportedKeys(zodToJsonSchema(schema, { target: 'jsonSchema7' })) as Record<string, unknown>;
}