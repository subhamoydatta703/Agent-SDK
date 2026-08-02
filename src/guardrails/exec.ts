import type { AgentConfig } from '../types.js';
import type { AgentEventBus } from '../events.js';
import type { GuardrailResult } from '../guardrail.js';
import type { Tool } from '../tool.js';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function runInputGuardrails(
  config: AgentConfig,
  input: string,
  agentName: string,
  events: AgentEventBus,
  runId: string
): Promise<GuardrailResult> {
  for (const g of config.inputGuardrails ?? []) {
    let res: GuardrailResult;
    try {
      res = await g.run(input, { agentName });
    } catch (e) {
      res = { pass: false, reason: `Input guardrail '${g.name}' threw: ${errMsg(e)}` };
    }
    events.emit({ type: 'guardrail:triggered', runId, kind: 'input', name: g.name, pass: res.pass, reason: res.reason });
    if (!res.pass) {
      return { pass: false, reason: res.reason ?? `Rejected by input guardrail '${g.name}'.` };
    }
  }
  return { pass: true };
}

export async function runOutputGuardrails(
  config: AgentConfig,
  output: string,
  agentName: string,
  events: AgentEventBus,
  runId: string
): Promise<GuardrailResult> {
  for (const g of config.outputGuardrails ?? []) {
    let res: GuardrailResult;
    try {
      res = await g.run(output, { agentName });
    } catch (e) {
      res = { pass: false, reason: `Output guardrail '${g.name}' threw: ${errMsg(e)}` };
    }
    events.emit({ type: 'guardrail:triggered', runId, kind: 'output', name: g.name, pass: res.pass, reason: res.reason });
    if (!res.pass) {
      return { pass: false, reason: res.reason ?? `Rejected by output guardrail '${g.name}'.` };
    }
  }
  return { pass: true };
}

export async function runToolGuardrails(
  config: AgentConfig,
  tool: Tool | undefined,
  input: unknown,
  agentName: string,
  events: AgentEventBus,
  runId: string
): Promise<GuardrailResult> {
  for (const g of config.toolGuardrails ?? []) {
    let res: GuardrailResult;
    try {
      res = await g.run(tool as Tool, input, { agentName });
    } catch (e) {
      res = { pass: false, reason: `Tool guardrail '${g.name}' threw: ${errMsg(e)}` };
    }
    events.emit({
      type: 'guardrail:triggered',
      runId,
      kind: 'tool',
      name: g.name,
      pass: res.pass,
      reason: res.reason,
      toolName: tool?.name,
    });
    if (!res.pass) {
      return { pass: false, reason: res.reason ?? `Tool '${tool?.name ?? ''}' rejected by guardrail '${g.name}'.` };
    }
  }
  return { pass: true };
}