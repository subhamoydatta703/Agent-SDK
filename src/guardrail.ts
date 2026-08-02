import type { Tool } from './tool.js';

export interface GuardrailResult {
  pass: boolean;
  reason?: string;
}

export interface GuardrailContext {
  agentName: string;
}

export interface InputGuardrail {
  name: string;
  run(input: string, ctx: GuardrailContext): GuardrailResult | Promise<GuardrailResult>;
}

export interface OutputGuardrail {
  name: string;
  run(output: string, ctx: GuardrailContext): GuardrailResult | Promise<GuardrailResult>;
}

export interface ToolGuardrail {
  name: string;
  run(tool: Tool, input: unknown, ctx: GuardrailContext): GuardrailResult | Promise<GuardrailResult>;
}