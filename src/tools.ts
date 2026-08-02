import { z } from 'zod';
import { defineTool, type Tool } from './tool.js';

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

export function safeEval(expression: string): number {
  const s = expression.replace(/\s+/g, '');
  if (!s) throw new Error('Empty expression');
  let i = 0;
  function peek(): string | undefined {
    return s[i];
  }
  function parseValue(): number {
    const c = peek();
    if (c === '(') {
      i++;
      const v = parseAddSub();
      if (peek() !== ')') throw new Error('Expected )');
      i++;
      return v;
    }
    if (c === '-') {
      i++;
      return -parseValue();
    }
    if (c === '+') {
      i++;
      return parseValue();
    }
    if (c && /[a-zA-Z_]/.test(c)) {
      let name = '';
      while (i < s.length && /[a-zA-Z_]/.test(s[i]!)) {
        name += s[i];
        i++;
      }
      if (peek() !== '(') throw new Error(`Expected ( after '${name}'`);
      i++;
      const args: number[] = [];
      if (peek() !== ')') {
        args.push(parseAddSub());
        while (peek() === ',') {
          i++;
          args.push(parseAddSub());
        }
      }
      if (peek() !== ')') throw new Error('Expected )');
      i++;
      switch (name) {
        case 'sqrt': return Math.sqrt(args[0]!);
        case 'abs': return Math.abs(args[0]!);
        case 'round': return Math.round(args[0]!);
        case 'floor': return Math.floor(args[0]!);
        case 'ceil': return Math.ceil(args[0]!);
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        default: throw new Error(`Unknown function '${name}'`);
      }
    }
    const start = i;
    let num = '';
    while (i < s.length && /[0-9.]/.test(s[i]!)) {
      num += s[i];
      i++;
    }
    if (num === '' || i === start) throw new Error(`Unexpected token '${s[i] ?? 'end'}'`);
    return Number(num);
  }
  function parsePower(): number {
    let left = parseValue();
    while (peek() === '^') {
      i++;
      const right = parsePower();
      left = Math.pow(left, right);
    }
    return left;
  }
  function parseMulDiv(): number {
    let left = parsePower();
    while (peek() === '*' || peek() === '/') {
      const op = s[i]!;
      i++;
      const right = parsePower();
      if (op === '*') left = left * right;
      else {
        if (right === 0) throw new Error('Division by zero');
        left = left / right;
      }
    }
    return left;
  }
  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === '+' || peek() === '-') {
      const op = s[i]!;
      i++;
      const right = parseMulDiv();
      if (op === '+') left = left + right;
      else left = left - right;
    }
    return left;
  }
  if (i < s.length && !/[0-9(a-zA-Z_\-+]/.test(s[i]!)) {
    throw new Error(`Unexpected start token '${s[i]}'`);
  }
  const result = parseAddSub();
  if (i < s.length) throw new Error(`Unexpected trailing token '${s.slice(i)}'`);
  return result;
}

export function calculatorTool(): Tool {
  return defineTool({
    name: 'calculator',
    description:
      'Evaluate a mathematical expression safely. Supports + - * / ^ and parentheses, plus functions sqrt, abs, round, floor, ceil, min, max.',
    inputSchema: z.object({ expression: z.string().describe('The mathematical expression to evaluate') }),
    outputSchema: z.object({ result: z.number() }),
    execute: async ({ expression }) => ({ result: safeEval(expression) }),
  });
}

export interface DocSenseOptions {
  documents: Record<string, string> | ((query: string) => Promise<Array<{ id: string; content: string; score?: number }>>);
  topK?: number;
}

export interface DocSenseHit {
  id: string;
  content: string;
  score?: number;
}

export function docSenseTool(opts: DocSenseOptions): Tool {
  const staticDocs = typeof opts.documents === 'function' ? null : opts.documents;
  const fetchDocs = typeof opts.documents === 'function' ? opts.documents : null;
  return defineTool({
    name: 'docsense',
    description: 'Retrieve the most relevant document snippets from the indexed knowledge base for a given query.',
    inputSchema: z.object({ query: z.string(), topK: z.number().optional() }),
    outputSchema: z.array(
      z.object({ id: z.string(), content: z.string(), score: z.number().optional() })
    ),
    execute: async ({ query, topK }): Promise<DocSenseHit[]> => {
      const k = topK ?? opts.topK ?? 3;
      if (fetchDocs) {
        const results = await fetchDocs(query);
        return results.slice(0, k);
      }
      const q = tokenize(query);
      const scored = Object.entries(staticDocs ?? {})
        .map(([id, content]) => {
          const toks = tokenize(content);
          const score = q.reduce((acc, t) => acc + (toks.includes(t) ? 1 : 0), 0);
          return { id, content, score };
        })
        .sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    },
  });
}

export function webSearchTool(opts?: { performSearch?: (query: string) => Promise<string> }): Tool {
  const performSearch = opts?.performSearch;
  return defineTool({
    name: 'web_search',
    description: 'Search the web and return a short text summary of the top results for a query.',
    inputSchema: z.object({ query: z.string(), maxResults: z.number().optional() }),
    execute: async ({ query, maxResults }): Promise<string> => {
      if (performSearch) return await performSearch(query);
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const resp = await fetch(url);
      if (!resp.ok) return `Search request failed with status ${resp.status}.`;
      const json = (await resp.json()) as {
        AbstractText?: string;
        RelatedTopics?: Array<{ Text?: string }>;
      };
      const limit = maxResults ?? 3;
      const topics = (json.RelatedTopics ?? [])
        .map((t) => t.Text ?? '')
        .filter(Boolean)
        .slice(0, limit);
      const parts = [json.AbstractText, ...topics].filter(Boolean);
      return parts.length ? parts.join('\n') : 'No web results found for the query.';
    },
  });
}