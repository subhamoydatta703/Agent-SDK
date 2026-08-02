# Streaming & Events

Somoy exposes events through an **EventEmitter3-based bus** (synchronous subscribe, zero deps) and a
convenient async-iterator wrapper on top. The event stream is the **primary debugging surface** —
`Trace` is derived from the same stream rather than maintained as a parallel system.

```ts
import { Agent, AgentEventBus } from '@subhamoy/somoy';

const events = new AgentEventBus();
events.on('tool:start', (ev) => console.log('executing', ev.toolCall.name));
events.on('run:complete', (ev) => console.log('status', ev.result.status));

await agent.run('hello', { events });
```

## Minimum event set

| Event | Meaning |
| --- | --- |
| `run:start` | run began |
| `text:delta` | assistant text chunk |
| `tool:start` / `tool:end` | tool execution began / finished |
| `handoff:start` / `handoff:end` | handoff to another agent |
| `guardrail:triggered` | a guardrail ran (pass/fail) |
| `run:complete` / `run:error` | run finished |

Extra events: `model:call`, `retry`.

## Async iteration

```ts
import { eventStream } from '@subhamoy/somoy';

const stream = eventStream(events);        // attach BEFORE running
const runPromise = agent.run('hello', { events });
for await (const ev of stream) {
  console.log(ev.type);
}
await runPromise;
```

> Attach the stream before calling `run` so `run:start` is captured.