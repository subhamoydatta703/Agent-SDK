import type { ZodType } from 'zod';

/** Scans from an opening `{`/`[` to its balanced close, ignoring braces inside string literals. */
function balancedSlice(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1]!.trim();
  return balancedSlice(trimmed, '{', '}') ?? balancedSlice(trimmed, '[', ']');
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