import { randomUUID } from 'crypto';
import type { ZodType } from 'zod';
import type { AgentConfig, RunConfig, RunState, ToolCallRecord, ToolResultRecord, Turn } from './types.js';
import type { SessionStore } from './session/types.js';
import type { AgentEventBus } from './events.js';
import type { ChatMessage, ModelResult, ToolSchema } from './provider/types.js';
import { toJsonSchema } from './zod-util.js';
import { runInputGuardrails, runOutputGuardrails, runToolGuardrails } from './guardrails/exec.js';
import { retryWithBackoff, withTimeout, TimeoutError } from './reliability.js';
import { TransientModelError } from './provider/errors.js';
import { LoopDetectedError, HandoffLoopError } from './errors.js';
import type { RunResult, RunErrorInfo } from './result.js';
import { HANDOFF_TOOL, handoffInputSchema } from './handoff.js';
import { parseStructured } from './structured.js';

function stableStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Providers may namespace tool-call names (e.g. Gemini returns `default_api:calculator`).
 * Match the registered tool name either exactly or as the suffix after the last colon,
 * while keeping the original namespaced name on records for replay/echo.
 */
function toolNameMatches(toolName: string, callName: string): boolean {
  return toolName === callName || callName.endsWith(`:${toolName}`);
}

export interface LoopContext {
  runId: string;
  registry: Map<string, AgentConfig>;
  events: AgentEventBus;
  runAbort: AbortController;
  agents: string[];
}

export interface ExecuteRequest {
  runId: string;
  sessionId: string;
  sessionStore: SessionStore;
  initialAgent: AgentConfig;
  input: string;
  runConfig: RunConfig;
  registry?: Map<string, AgentConfig>;
  events: AgentEventBus;
  signal?: AbortSignal;
}

async function appendTurn(state: RunState, turn: Omit<Turn, 'id' | 'timestamp'>): Promise<void> {
  const full: Turn = { ...turn, id: randomUUID(), timestamp: Date.now() };
  state.transcript.push(full);
  await state.sessionStore.append(state.sessionId, full);
}

function turnsToMessages(turns: Turn[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const t of turns) {
    if (t.role === 'user') {
      out.push({ role: 'user', content: t.content });
    } else if (t.role === 'assistant') {
      out.push({ role: 'assistant', content: t.content, toolCalls: t.toolCalls, name: t.agentName });
    } else if (t.role === 'tool' && t.toolResults?.length) {
      out.push({ role: 'tool', toolResults: t.toolResults, name: t.agentName });
    }
  }
  return out;
}

async function buildContext(state: RunState): Promise<ChatMessage[]> {
  const history = await state.sessionStore.get(state.sessionId);
  const turns = state.runConfig.truncate ? state.runConfig.truncate(history) : history;
  const messages = turnsToMessages(turns);
  return [{ role: 'system', content: state.config.instructions }, ...messages];
}

function buildToolSchemas(state: RunState, registry: Map<string, AgentConfig>): ToolSchema[] {
  const schemas: ToolSchema[] = (state.config.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    parameters: toJsonSchema(t.inputSchema),
  }));
  if (registry.size > 0) {
    schemas.push({
      name: HANDOFF_TOOL,
      description:
        'Transfer the conversation to another specialized agent to delegate a task that is outside your own expertise. Call this when you cannot or should not handle the request yourself.',
      parameters: toJsonSchema(handoffInputSchema),
    });
  }
  return schemas;
}

function detectLoop(state: RunState, calls: ToolCallRecord[]): { detected: boolean; toolName?: string } {
  if (!calls.length) return { detected: false };
  const first = calls[0]!;
  const key = `${first.name}:${stableStringify(first.args)}`;
  const cur = state.consecutiveIdentical;
  if (cur && cur.name === first.name && cur.argsKey === key) {
    cur.count += 1;
  } else {
    state.consecutiveIdentical = { name: first.name, argsKey: key, count: 1 };
  }
  if ((state.consecutiveIdentical?.count ?? 0) >= state.runConfig.maxConsecutiveIdenticalCalls) {
    return { detected: true, toolName: first.name };
  }
  return { detected: false };
}

function makeResult(state: RunState, ctx: LoopContext, status: RunResult['status'], extra: Partial<RunResult> = {}): RunResult {
  return {
    status,
    runId: state.runId,
    sessionId: state.sessionId,
    turns: state.turnCount,
    toolCalls: state.toolCallCount,
    agents: ctx.agents,
    durationMs: Date.now() - state.startTime,
    ...extra,
  };
}

async function callModel(
  state: RunState,
  ctx: LoopContext,
  messages: ChatMessage[]
): Promise<{ ok: true; value: ModelResult } | { ok: false; error: unknown; attempts: number }> {
  const tools = buildToolSchemas(state, ctx.registry);
  const opts = {
    tools,
    temperature: 0.2,
    jsonMode: !!state.config.outputSchema && tools.length === 0,
    signal: ctx.runAbort.signal,
  };
  const out = await retryWithBackoff({
    task: () =>
      withTimeout(
        state.config.model.complete(messages, opts),
        state.runConfig.modelTimeoutMs,
        `model:${state.config.model.id}`,
        ctx.runAbort.signal
      ),
    maxRetries: state.runConfig.maxRetries,
    baseDelayMs: state.runConfig.retryBaseDelayMs,
    isTransient: (e) => e instanceof TransientModelError || e instanceof TimeoutError,
    onRetry: (attempt, delayMs, error) => {
      ctx.events.emit({
        type: 'retry',
        runId: ctx.runId,
        attempt,
        maxRetries: state.runConfig.maxRetries,
        delayMs,
        error: errMsg(error),
      });
    },
    signal: ctx.runAbort.signal,
  });
  if (!out.ok) {
    return { ok: false, error: out.error, attempts: out.attempts };
  }
  ctx.events.emit({
    type: 'model:call',
    runId: ctx.runId,
    agentName: state.agentName,
    attempt: out.attempts,
    usage: out.value.usage,
  });
  return { ok: true, value: out.value };
}

async function executeTool(state: RunState, ctx: LoopContext, call: ToolCallRecord): Promise<ToolResultRecord> {
  const tool = (state.config.tools ?? []).find((t) => toolNameMatches(t.name, call.name));
  const finish = (rec: ToolResultRecord): ToolResultRecord => {
    const record: ToolResultRecord = { name: call.name, ...rec };
    ctx.events.emit({
      type: 'tool:end',
      runId: ctx.runId,
      toolCallId: call.id,
      name: tool?.name ?? call.name,
      ok: record.ok,
      data: record.data,
      error: record.error,
      durationMs: record.durationMs ?? 0,
    });
    return record;
  };
  if (!tool) {
    return finish({ toolCallId: call.id, ok: false, error: `Unknown tool '${call.name}'.`, durationMs: 0 });
  }
  const gr = await runToolGuardrails(state.config, tool, call.args, state.agentName, ctx.events, ctx.runId);
  if (!gr.pass) {
    return finish({ toolCallId: call.id, ok: false, error: gr.reason ?? `Tool '${call.name}' blocked by a guardrail.`, durationMs: 0 });
  }
  const parsed = tool.inputSchema.safeParse(call.args);
  if (!parsed.success) {
    return finish({
      toolCallId: call.id,
      ok: false,
      error: `Invalid arguments for '${call.name}': ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      durationMs: 0,
    });
  }
  ctx.events.emit({ type: 'tool:start', runId: ctx.runId, toolCall: call });
  const started = Date.now();
  const toolAbort = new AbortController();
  const wireAbort = () => toolAbort.abort();
  ctx.runAbort.signal.addEventListener('abort', wireAbort, { once: true });
  try {
    const out = await tool.execute(parsed.data, {
      session: state.sessionStore,
      signal: toolAbort.signal,
      agentName: state.agentName,
      rawInput: call.args,
    });
    if (tool.outputSchema) {
      const v = tool.outputSchema.safeParse(out);
      if (!v.success) {
        return finish({
          toolCallId: call.id,
          ok: false,
          error: `Output of '${tool.name}' failed schema validation: ${v.error.issues.map((i) => i.message).join('; ')}`,
          durationMs: Date.now() - started,
        });
      }
      return finish({ toolCallId: call.id, ok: true, data: v.data, durationMs: Date.now() - started });
    }
    return finish({ toolCallId: call.id, ok: true, data: out, durationMs: Date.now() - started });
  } catch (e) {
    return finish({
      toolCallId: call.id,
      ok: false,
      error: `Tool '${tool.name}' failed: ${errMsg(e)}`,
      durationMs: Date.now() - started,
    });
  } finally {
    ctx.runAbort.signal.removeEventListener('abort', wireAbort);
  }
}

async function loop(state: RunState, ctx: LoopContext): Promise<RunResult> {
  while (state.turnCount < state.runConfig.maxTurns) {
    if (ctx.runAbort.signal.aborted) {
      return makeResult(state, ctx, 'error', {
        error: { kind: 'timeout', message: 'Run exceeded the timeout or was aborted.' },
      });
    }
    if (state.turnCount > 0) {
      const gir = await runInputGuardrails(state.config, state.input, state.agentName, ctx.events, ctx.runId);
      if (!gir.pass) {
        return makeResult(state, ctx, 'guardrail_rejected', { reason: gir.reason });
      }
    }
    const messages = await buildContext(state);
    const call = await callModel(state, ctx, messages);
    if (!call.ok) {
      if (ctx.runAbort.signal.aborted) {
        return makeResult(state, ctx, 'error', {
          error: { kind: 'timeout', message: 'Run exceeded the timeout or was aborted.' },
        });
      }
      return makeResult(state, ctx, 'error', {
        error: {
          kind: 'model_error',
          message: `Model call failed after retries: ${errMsg(call.error)}`,
        },
      });
    }
    const modelResult = call.value;
    state.turnCount += 1;
    if (modelResult.content) {
      ctx.events.emit({ type: 'text:delta', runId: ctx.runId, agentName: state.agentName, delta: modelResult.content });
    }

    if (modelResult.toolCalls && modelResult.toolCalls.length > 0) {
      if (state.toolCallCount + modelResult.toolCalls.length > state.runConfig.maxToolCalls) {
        return makeResult(state, ctx, 'max_tool_calls_exceeded', { reason: 'Maximum number of tool calls exceeded.' });
      }
      const ld = detectLoop(state, modelResult.toolCalls);
      if (ld.detected) {
        return makeResult(state, ctx, 'error', {
          error: {
            kind: 'loop_detected',
            message: new LoopDetectedError(ld.toolName!).message,
            details: { toolName: ld.toolName },
          },
        });
      }
      await appendTurn(state, {
        role: 'assistant',
        agentName: state.agentName,
        content: modelResult.content,
        toolCalls: modelResult.toolCalls,
      });

      for (const call of modelResult.toolCalls) {
        if (toolNameMatches(HANDOFF_TOOL, call.name)) {
          const parsed = handoffInputSchema.safeParse(call.args);
          if (!parsed.success) {
            await appendTurn(state, {
              role: 'tool',
              agentName: state.agentName,
              toolResults: [
                { toolCallId: call.id, name: call.name, ok: false, error: `Invalid handoff arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` },
              ],
            });
            continue;
          }
          const outcome = await handleHandoff(state, ctx, call, parsed.data.receiver, parsed.data.reason);
          if (outcome !== 'continue') return outcome;
        } else {
          const tr = await executeTool(state, ctx, call);
          state.toolCallCount += 1;
          await appendTurn(state, { role: 'tool', agentName: state.agentName, toolResults: [tr] });
        }
      }
      continue;
    }

    // Final answer path.
    return await finalize(state, ctx, modelResult.content ?? '');
  }
  return makeResult(state, ctx, 'max_turns_exceeded', { reason: 'Exceeded the maximum number of turns.' });
}

async function handleHandoff(
  state: RunState,
  ctx: LoopContext,
  call: ToolCallRecord,
  receiver: string,
  reason: string
): Promise<'continue' | RunResult> {
  const from = state.agentName;
  const target = ctx.registry.get(receiver);
  if (!target) {
    await appendTurn(state, {
      role: 'tool',
      agentName: state.agentName,
      toolResults: [
        {
          toolCallId: call.id,
          name: call.name,
          ok: false,
          error: `Unknown agent '${receiver}'. Available agents: [${[...ctx.registry.keys()].join(', ')}].`,
        },
      ],
    });
    return 'continue';
  }
  const recent = state.handoffChain.slice(-state.runConfig.handoffLoopWindow);
  if (recent.includes(receiver)) {
    const err = new HandoffLoopError(state.handoffChain, receiver);
    return makeResult(state, ctx, 'error', {
      error: { kind: 'handoff_loop', message: err.message, details: { chain: state.handoffChain, target: receiver } },
    });
  }
  ctx.events.emit({ type: 'handoff:start', runId: ctx.runId, from, to: receiver, reason });
  await appendTurn(state, {
    role: 'tool',
    agentName: from,
    toolResults: [{ toolCallId: call.id, name: call.name, ok: true, data: { handedOffTo: receiver, reason } }],
  });
  state.config = target;
  state.agentName = target.name;
  state.handoffChain.push(target.name);
  ctx.agents.push(target.name);
  ctx.events.emit({ type: 'handoff:end', runId: ctx.runId, from, to: receiver, reason });
  return 'continue';
}

async function finalize(state: RunState, ctx: LoopContext, text: string): Promise<RunResult> {
  let finalText = text;
  let structured = false;
  let data: unknown;
  let finalPersisted = false;
  const schema: ZodType | undefined = state.config.outputSchema;
  if (schema) {
    structured = true;
    let parsed = parseStructured(finalText, schema);
    if (!parsed.ok) {
      const fixRequest =
        'Your previous response failed schema validation:\n' +
        parsed.errors.join('\n') +
        '\nPlease respond again with ONLY valid JSON matching the requested schema.';
      const messages = await buildContext(state);
      messages.push({ role: 'assistant', content: finalText });
      messages.push({ role: 'user', content: fixRequest });
      const call = await callModel(state, ctx, messages);
      state.turnCount += 1;
      if (!call.ok) {
        return makeResult(state, ctx, 'error', {
          error: {
            kind: 'structured_output',
            message: `Structured-output repair failed because the model call failed: ${errMsg(call.error)}`,
          },
        });
      }
      await appendTurn(state, { role: 'assistant', agentName: state.agentName, content: finalText });
      await appendTurn(state, { role: 'user', agentName: state.agentName, content: fixRequest });
      const repaired = parseStructured(call.value.content, schema);
      await appendTurn(state, { role: 'assistant', agentName: state.agentName, content: call.value.content });
      ctx.events.emit({ type: 'text:delta', runId: ctx.runId, agentName: state.agentName, delta: call.value.content });
      if (!repaired.ok) {
        return makeResult(state, ctx, 'error', {
          error: { kind: 'structured_output', message: 'Structured output failed validation after the repair pass.', details: repaired.errors },
        });
      }
      finalText = call.value.content;
      parsed = repaired;
      finalPersisted = true;
    }
    data = parsed.ok ? parsed.data : undefined;
  }
  if (!finalPersisted) {
    await appendTurn(state, { role: 'assistant', agentName: state.agentName, content: finalText });
  }
  const og = await runOutputGuardrails(state.config, finalText, state.agentName, ctx.events, ctx.runId);
  if (!og.pass) {
    return makeResult(state, ctx, 'guardrail_rejected', { reason: og.reason, ...(structured ? { data } : {}) });
  }
  return makeResult(state, ctx, 'completed', {
    text: finalText,
    ...(structured ? { data } : {}),
  });
}

export async function execute(req: ExecuteRequest): Promise<RunResult> {
  const registry = req.registry ?? new Map<string, AgentConfig>();
  const ctx: LoopContext = {
    runId: req.runId,
    registry,
    events: req.events,
    runAbort: new AbortController(),
    agents: [req.initialAgent.name],
  };
  const state: RunState = {
    runId: req.runId,
    sessionId: req.sessionId,
    input: req.input,
    config: req.initialAgent,
    runConfig: req.runConfig,
    sessionStore: req.sessionStore,
    transcript: [],
    agentName: req.initialAgent.name,
    turnCount: 0,
    toolCallCount: 0,
    handoffChain: [req.initialAgent.name],
    startTime: Date.now(),
    consecutiveIdentical: null,
  };
  const deadlineTimer = setTimeout(() => ctx.runAbort.abort(), req.runConfig.timeoutMs);
  if (req.signal) {
    if (req.signal.aborted) ctx.runAbort.abort();
    else req.signal.addEventListener('abort', () => ctx.runAbort.abort(), { once: true });
  }
  try {
    req.events.emit({
      type: 'run:start',
      runId: req.runId,
      agentName: req.initialAgent.name,
      sessionId: req.sessionId,
      input: req.input,
    });
    const gir = await runInputGuardrails(state.config, req.input, state.agentName, req.events, req.runId);
    if (!gir.pass) {
      return makeResult(state, ctx, 'guardrail_rejected', { reason: gir.reason });
    }
    await appendTurn(state, { role: 'user', agentName: state.agentName, content: req.input });
    const result = await loop(state, ctx);
    if (result.status === 'completed') {
      req.events.emit({ type: 'run:complete', runId: req.runId, result });
    } else {
      req.events.emit({
        type: 'run:error',
        runId: req.runId,
        error: result.error?.message ?? result.reason ?? 'Run did not complete successfully.',
      });
    }
    return result;
  } finally {
    clearTimeout(deadlineTimer);
  }
}