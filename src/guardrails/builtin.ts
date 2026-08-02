import type { InputGuardrail, OutputGuardrail, ToolGuardrail } from '../guardrail.js';
import type { Tool } from '../tool.js';

export function emptyInputGuardrail(name = 'empty_input'): InputGuardrail {
  return {
    name,
    run: (input: string) => ({
      pass: input.trim().length > 0,
      reason: input.trim().length === 0 ? 'Input is empty.' : undefined,
    }),
  };
}

export function lengthLimitInputGuardrail(maxChars: number, name = 'length_limit'): InputGuardrail {
  return {
    name,
    run: (input: string) => ({
      pass: input.length <= maxChars,
      reason: input.length > maxChars ? `Input exceeds ${maxChars} characters (got ${input.length}).` : undefined,
    }),
  };
}

export function sensitiveOutputGuardrail(patterns: RegExp[], name = 'sensitive_data'): OutputGuardrail {
  return {
    name,
    run: (output: string) => {
      const hit = patterns.find((p) => p.test(output));
      return hit
        ? { pass: false, reason: `Output matched a sensitive-data pattern (${hit}).` }
        : { pass: true };
    },
  };
}

export interface ApprovalOptions {
  name?: string;
  requireApproval: (toolName: string, input: unknown) => boolean | Promise<boolean>;
  message?: string;
}

export function approvalToolGuardrail(opts: ApprovalOptions): ToolGuardrail {
  return {
    name: opts.name ?? 'tool_approval',
    run: async (tool: Tool, input: unknown) => {
      const allowed = await opts.requireApproval(tool.name, input);
      return allowed
        ? { pass: true }
        : {
            pass: false,
            reason: opts.message ?? `Tool '${tool.name}' requires explicit approval, which was not granted. The tool call was blocked.`,
          };
    },
  };
}