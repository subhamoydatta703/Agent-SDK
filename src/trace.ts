import type { AgentEventBus } from './events.js';
import type { ModelUsage } from './provider/types.js';

export interface TraceModelCall {
  agentName: string;
  attempt: number;
  usage?: ModelUsage;
}

export interface TraceToolCall {
  id: string;
  name: string;
  input: unknown;
  ok: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
}

export interface TraceHandoff {
  from: string;
  to: string;
  reason: string;
}

export interface TraceGuardrail {
  kind: 'input' | 'output' | 'tool';
  name: string;
  pass: boolean;
  reason?: string;
  toolName?: string;
}

export interface TraceRetry {
  attempt: number;
  delayMs: number;
  error: string;
}

export interface TraceError {
  kind: string;
  message: string;
}

export interface TraceEntry {
  runId: string;
  startedAt: number;
  finishedAt?: number;
  agents: string[];
  input: string;
  text: string;
  modelCalls: TraceModelCall[];
  toolCalls: TraceToolCall[];
  handoffs: TraceHandoff[];
  guardrails: TraceGuardrail[];
  retries: TraceRetry[];
  errors: TraceError[];
}

export class Trace implements TraceEntry {
  runId: string;
  startedAt: number;
  finishedAt?: number;
  agents: string[] = [];
  input = '';
  text = '';
  modelCalls: TraceModelCall[] = [];
  toolCalls: TraceToolCall[] = [];
  handoffs: TraceHandoff[] = [];
  guardrails: TraceGuardrail[] = [];
  retries: TraceRetry[] = [];
  errors: TraceError[] = [];

  constructor(runId: string) {
    this.runId = runId;
    this.startedAt = Date.now();
  }

  get totalDurationMs(): number | undefined {
    if (this.finishedAt === undefined) return undefined;
    return this.finishedAt - this.startedAt;
  }

  toJSON(): string {
    return JSON.stringify(this.toObject(), null, 2);
  }

  toObject(): TraceEntry {
    return {
      runId: this.runId,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      agents: this.agents,
      input: this.input,
      text: this.text,
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      handoffs: this.handoffs,
      guardrails: this.guardrails,
      retries: this.retries,
      errors: this.errors,
    };
  }

  prettyPrint(): string {
    const lines: string[] = [];
    lines.push(`=== Trace ${this.runId} ===`);
    lines.push(`agents  : ${this.agents.join(' -> ') || '-'}`);
    lines.push(`input   : ${this.input}`);
    lines.push(`duration: ${this.totalDurationMs ?? '-'}ms`);
    lines.push('');
    for (let i = 0; i < this.modelCalls.length; i++) {
      const mc = this.modelCalls[i]!;
      const usage = mc.usage
        ? ` (${mc.usage.promptTokens ?? '?'}p/${mc.usage.completionTokens ?? '?'}c)`
        : '';
      lines.push(`model[${i}]  ${mc.agentName} attempt=${mc.attempt}${usage}`);
    }
    for (const tc of this.toolCalls) {
      lines.push(
        `tool     ${tc.name} ok=${tc.ok} ${tc.durationMs}ms input=${JSON.stringify(tc.input)}${tc.ok ? ` -> ${JSON.stringify(tc.output)}` : ` ERR ${tc.error}`}`
      );
    }
    for (const h of this.handoffs) {
      lines.push(`handoff  ${h.from} -> ${h.to} (${h.reason})`);
    }
    for (const g of this.guardrails) {
      lines.push(`guardrail ${g.kind}:${g.name} pass=${g.pass}${g.reason ? ' ' + g.reason : ''}`);
    }
    for (const r of this.retries) {
      lines.push(`retry    attempt=${r.attempt} delay=${r.delayMs}ms err=${r.error}`);
    }
    for (const e of this.errors) {
      lines.push(`error    ${e.kind}: ${e.message}`);
    }
    lines.push(`result   text=${this.text}`);
    lines.push('=========================');
    return lines.join('\n');
  }
}

export function traceFromBus(bus: AgentEventBus, runId: string): Trace {
  const trace = new Trace(runId);
  bus.on('run:start', (ev) => {
    if (ev.runId !== runId) return;
    trace.input = ev.input;
    trace.agents.push(ev.agentName);
  });
  bus.on('text:delta', (ev) => {
    if (ev.runId !== runId) return;
    trace.text += ev.delta;
  });
  bus.on('model:call', (ev) => {
    if (ev.runId !== runId) return;
    trace.modelCalls.push({ agentName: ev.agentName, attempt: ev.attempt, usage: ev.usage });
  });
  bus.on('tool:end', (ev) => {
    if (ev.runId !== runId) return;
    const start = trace.toolCalls.find((t) => t.id === ev.toolCallId);
    if (start) start.durationMs = ev.durationMs;
    else trace.toolCalls.push({ id: ev.toolCallId, name: ev.name, input: '', ok: ev.ok, output: ev.data, error: ev.error, durationMs: ev.durationMs });
  });
  bus.on('tool:start', (ev) => {
    if (ev.runId !== runId) return;
    trace.toolCalls.push({ id: ev.toolCall.id, name: ev.toolCall.name, input: ev.toolCall.args, ok: false, durationMs: 0 });
  });
  bus.on('handoff:end', (ev) => {
    if (ev.runId !== runId) return;
    trace.handoffs.push({ from: ev.from, to: ev.to, reason: ev.reason });
    if (!trace.agents.includes(ev.to)) trace.agents.push(ev.to);
  });
  bus.on('guardrail:triggered', (ev) => {
    if (ev.runId !== runId) return;
    trace.guardrails.push({ kind: ev.kind, name: ev.name, pass: ev.pass, reason: ev.reason, toolName: ev.toolName });
  });
  bus.on('retry', (ev) => {
    if (ev.runId !== runId) return;
    trace.retries.push({ attempt: ev.attempt, delayMs: ev.delayMs, error: ev.error });
  });
  bus.on('run:error', (ev) => {
    if (ev.runId !== runId) return;
    trace.errors.push({ kind: 'run:error', message: ev.error });
    trace.finishedAt = Date.now();
  });
  bus.on('run:complete', (ev) => {
    if (ev.runId !== runId) return;
    trace.finishedAt = Date.now();
  });
  return trace;
}