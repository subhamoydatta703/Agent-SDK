# API Reference

## Agent

A stateless runtime config for one agent. Construct it once with static configuration.

```ts
new Agent({
  name: string,                  // required, [a-zA-Z0-9_-]
  instructions: string,          // required, system prompt
  model: ModelProvider,          // required
  tools?: Tool[],
  inputGuardrails?: InputGuardrail[],
  outputGuardrails?: OutputGuardrail[],
  toolGuardrails?: ToolGuardrail[],
  outputSchema?: ZodType,        // structured output
})
```

**`agent.run<T>(input, opts)` → `Promise<RunResult<T>>`**

```ts
run(input, {
  sessionId?: string,          // reuse to continue a conversation
  sessionStore?: SessionStore, // defaults to InMemory
  signal?: AbortSignal,
  events?: AgentEventBus,
  runConfig?: Partial<RunConfig>,
  registry?: AgentRegistry,    // enables handoffs
})
```

## AgentRegistry

```ts
const registry = new AgentRegistry([router, researcher, calculator]);
registry.add(agent); registry.has(name); registry.names();
```

## Tool

```ts
defineTool({
  name: string,
  description: string,
  inputSchema: ZodType,      // validated before execution
  outputSchema?: ZodType,    // validated after execution
  execute: async (input, ctx) => result,
})
```

`ctx` provides `{ session, signal, agentName }`. Tools may be sync or async; a throwing tool is
caught and surfaced as an observation — it never crashes the run. Long-running tools receive an
`AbortSignal` wired to the run-level timeout.

## Guardrail

```ts
type GuardrailResult = { pass: boolean; reason?: string };

interface InputGuardrail  { name: string; run(input, ctx): GuardrailResult | Promise<GuardrailResult> }
interface OutputGuardrail { name: string; run(output, ctx): GuardrailResult | Promise<GuardrailResult> }
interface ToolGuardrail   { name: string; run(tool, input, ctx): GuardrailResult | Promise<GuardrailResult> }
```

## Session

```ts
interface SessionStore {
  get(sessionId: string): Promise<Turn[]>;
  append(sessionId: string, turn: Turn): Promise<void>;
  clear(sessionId: string): Promise<void>;
}
```

Built-ins: `InMemorySessionStore`, `SQLiteSessionStore`.

## Provider

```ts
interface ModelProvider {
  readonly id: string;
  complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult>;
}
```

Built-ins: `GeminiProvider`, `OpenAIProvider`, `MockProvider`.

## RunResult

```ts
type RunStatus = 'completed' | 'max_turns_exceeded' | 'error' | 'guardrail_rejected';
interface RunResult<T> { status, data?, text?, runId, sessionId, turns, toolCalls, agents, durationMs, reason?, error? }
```