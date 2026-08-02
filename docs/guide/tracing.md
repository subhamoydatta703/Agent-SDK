# Tracing

Every run produces a `Trace` derived from the same event stream you subscribe to — one debugging
surface, not two parallel systems.

```ts
import { traceFromBus, AgentEventBus } from '@subhamoy/somoy';

const events = new AgentEventBus();
// capture the runId from run:start and build a trace for it
let runId = '';
events.on('run:start', (ev) => {
  runId = ev.runId;
  const trace = traceFromBus(events, ev.runId);
});
await agent.run('hello', { events });
```

A `Trace` captures: run ID, agent names involved, every model call (with token usage when the
provider returns it), every tool call (name, input, output, duration), every handoff, every retry,
every error, and total wall-clock time.

## Dump as JSON

```ts
trace.toJSON();
```

## Pretty-print to console (demo-friendly)

```ts
trace.prettyPrint();
```

```
=== Trace <runId> ===
agents  : router -> researcher
input   : ...
model[0]   router attempt=1 (12p/8c)
tool     docsense ok=true 3ms input={"query":"x"} -> [...]
handoff  router -> researcher (needs research)
=========================
```

Because the trace is built from the same events you can observe, nothing is faked — what you watch
stream live is exactly what the trace reports.