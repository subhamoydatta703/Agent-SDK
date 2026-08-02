import type { ZodType } from 'zod';

export function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) return brace[0];
  const bracket = trimmed.match(/\[[\s\S]*\]/);
  if (bracket) return bracket[0];
  return null;
}

export type ParseOutcome<T> = { ok: true; data: T } | { ok: false; errors: string[] };

export function parseStructured<T>(text: string, schema: ZodType<T>): ParseOutcome<T> {
  const json = extractJsonBlock(text);
  if (!json) return { ok: false, errors: ['No JSON object/array found in model output.'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, errors: ['Invalid JSON: ' + (e instanceof Error ? e.message : String(e))] };
  }
  const res = schema.safeParse(parsed);
  if (!res.success) {
    return { ok: false, errors: res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  return { ok: true, data: res.data };
}