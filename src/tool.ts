import type { ZodType } from 'zod';
import type { SessionStore } from './session/types.js';
import { ToolDefinitionError } from './errors.js';

export interface ToolContext {
  session: SessionStore;
  signal?: AbortSignal;
  agentName: string;
  rawInput?: unknown;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T; durationMs?: number }
  | { ok: false; error: string; durationMs?: number };

export interface Tool<In = any, Out = any> {
  name: string;
  description: string;
  inputSchema: ZodType<In>;
  outputSchema?: ZodType<Out>;
  execute: (input: In, ctx: ToolContext) => Out | Promise<Out>;
}

export interface DefineToolOptions<In, Out> {
  name: string;
  description: string;
  inputSchema: ZodType<In>;
  outputSchema?: ZodType<Out>;
  execute: (input: In, ctx: ToolContext) => Out | Promise<Out>;
}

export function defineTool<In, Out>(opts: DefineToolOptions<In, Out>): Tool<In, Out> {
  if (!opts.name || !/^[a-zA-Z0-9_]+$/.test(opts.name)) {
    throw new ToolDefinitionError(
      `Tool name '${String(opts.name)}' must be non-empty and contain only [a-zA-Z0-9_].`
    );
  }
  if (!opts.description || !opts.description.trim()) {
    throw new ToolDefinitionError(`Tool '${String(opts.name)}' requires a description.`);
  }
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: opts.inputSchema,
    outputSchema: opts.outputSchema,
    execute: opts.execute,
  };
}