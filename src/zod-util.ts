import type { ZodType } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function toJsonSchema<T>(schema: ZodType<T>): Record<string, unknown> {
  return zodToJsonSchema(schema, { target: 'jsonSchema7' }) as Record<string, unknown>;
}