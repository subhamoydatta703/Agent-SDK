# @subhamoy/somoy

**Somoy** is a transparent, hand-written AI Agent SDK for TypeScript.
Every line of the think → act → observe loop is inspectable. No frameworks underneath, no hidden
prompt injection, no magic retry logic you cannot read.

- **Provider-agnostic from day one** — one `ModelProvider` interface; Gemini, OpenAI, and a zero-key
  `MockProvider` adapters ship in the box.
- **TypeScript-first types** — tool inputs/outputs, structured outputs, and events are inferred from
  zod schemas so types flow through your code without manual duplication.
- **Runtime-agnostic** — runs on Bun and Node 18+. All three state kinds (agent config, run state,
  session state) are distinct, typed modules.

```bash
npm add @subhamoy/somoy
bun add @subhamoy/somoy
```

## Why it exists

Somoy exists because most agent frameworks ask you to inherit a lot of opinion before you can see a
single line of the loop. This SDK makes the opposite bet: **a runtime you can fully read and modify in
an afternoon.**

- **Who it is for** — TypeScript developers who want an agent runtime they can fully read and modify
  in an afternoon, without inheriting a framework's opinions.
- **What problem it solves** — transparency and control. Every step of the loop is an inspectable
  state machine; there is no hidden prompt injection or magical retry logic.
- **Why it must exist given LangChain / CrewAI / OpenAI Agents SDK** — honestly: those are powerful,
  but they are also (a) deep abstraction stacks, (b) often Python-first design ported to TS, and
  (c) in the OpenAI case, provider-locked. Somoy is a smaller surface area, provider-agnostic from
  the first commit, and TypeScript-first in DNA rather than in translation.
- **Why adopt it (demonstrable, not claimed)** — see the three differentiators below; each has a
  runnable example and can be shown on screen.

### Three differentiators you can watch happen

1. **A fully-readable agent loop.** The core is one explicit state machine in `src/loop.ts`. You can
   breakpoint every exit path. Run `bun run example` and watch the events stream live.
2. **One ModelProvider interface, three adapters.** Swap `MockProvider` → `GeminiProvider` →
   `OpenAIProvider` by changing one line. Nothing else in your agent changes.
3. **Every failure is a value, not a throw.** Loop detection, handoff ping-pong, guardrail rejections,
   timeouts, and model errors all return a `RunResult` with a `status` discriminant — you never catch
   exceptions for expected failure modes.

## Quick start (30 seconds)

```ts
import { Agent, calculatorTool, MockProvider } from '@subhamoy/somoy';

const agent = new Agent({
  name: 'math',
  instructions: 'Use the calculator tool for arithmetic.',
  model: new MockProvider(), // offline; swap for GeminiProvider in production
  tools: [calculatorTool()],
});

const result = await agent.run('What is (5+3)*2?');
console.log(result.status, result.text); // completed '...16'
```

Use a real model by swapping the provider:

```ts
import { GeminiProvider } from '@subhamoy/somoy';
const agent = new Agent({
  name: 'math',
  instructions: 'Be concise.',
  model: new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }),
  tools: [calculatorTool()],
});
```

## Architecture at a glance

```
src/
  types.ts          # Three distinct state types: AgentConfig, RunState, Turn
  result.ts         # RunResult with a status discriminant (never throw for expected failures)
  errors.ts         # Errors reserved for genuine bugs/misuse
  tool.ts           # defineTool() with zod-inferred types + AbortSignal
  guardrails/       # Input / Output / Tool guardrails + built-ins
  agent.ts          # Agent + AgentRegistry (handoffs)
  loop.ts           # The explicit, hand-written agent state machine
  events.ts         # EventEmitter3 bus + async-iterator event stream
  trace.ts          # Trace derived from the same event stream
  reliability.ts    # retries w/ backoff, model & run timeouts
  structured.ts     # structured output + one repair pass
  session/          # SessionStore: InMemory + SQLite adapters
  provider/         # ModelProvider: Gemini, OpenAI, Mock
```

## Features

| Capability | Where | Default / notes |
| --- | --- | --- |
| Agent loop (state machine) | `src/loop.ts` | configurable `maxTurns`, `maxToolCalls`, `timeoutMs` |
| Loop detection | `src/loop.ts` | same tool + identical args × 3 aborts with a result |
| Typed tools | `src/tool.ts` | sync/async, input+output zod validation, AbortSignal |
| Guardrails | `src/guardrails/` | input, output, tool (approval) — return `guardrail_rejected` |
| Structured output | `src/structured.ts` | one repair pass on invalid JSON |
| Sessions | `src/session/` | turns, not strings; memory + SQLite; pluggable truncate |
| Handoffs | `src/handoff.ts` | transcript transfer, chain tracking, ping-pong prevention |
| Events / tracing | `src/events.ts`, `src/trace.ts` | EventEmitter3 + async iterator; trace from the same stream |
| Reliability | `src/reliability.ts` | exponential backoff, model & run timeouts, secrets scrubbed |
| Providers | `src/provider/` | Gemini, OpenAI, Mock (offline) |

## Scripts

```bash
bun run typecheck        # tsc --noEmit
bun test                 # offline suite (no API keys)
bun run build            # emit dist/ (+ .d.ts)
bun run example          # basic single-agent tool demo
bun run example:handoff  # triage router -> specialist
bun run example:mock     # provider demo: smart MockProvider (offline)
bun run example:gemini   # provider demo: Gemini (needs GEMINI_API_KEY)
bun run example:openai   # provider demo: OpenAI (needs OPENAI_API_KEY)
bun run example:structured
bun run example:streaming
bun run docs:dev         # VitePress docs site
```

## License

MIT