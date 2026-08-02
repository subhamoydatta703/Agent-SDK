# Tools

Tools are the agent's hands. Each tool declares its input (and optional output) as a zod schema, so
types flow through without manual duplication.

```ts
import { z } from 'zod';
import { defineTool } from '@subhamoy/somoy';

const weather = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ tempC: z.number(), condition: z.string() }),
  execute: async ({ city }) => {
    // ... call an API
    return { tempC: 21, condition: 'sunny' };
  },
});
```

Semantics:

- **Input validation** — `inputSchema.safeParse` runs before execution; invalid args become an
  observation fed back to the model.
- **Output validation** — `outputSchema.safeParse` runs after execution; a schema violation is
  treated as a failed tool call.
- **Sync or async** — `execute` may return a value or a promise.
- **Never throws** — a throwing `execute` is caught and converted to `{ ok: false, error }`.
- **Cancellation** — `ctx.signal` is an `AbortSignal` aborted when the run times out or is cancelled.
- **Context** — `ctx` gives access to the `SessionStore` and `agentName`.

## Built-in demo tools

| Tool | Purpose |
| --- | --- |
| `calculatorTool()` | safe arithmetic evaluation (no `eval`; recursive-descent parser) |
| `docSenseTool({ documents })` | retrieval/query over an indexed corpus or a callback |
| `webSearchTool()` | web search (DDG instant answer by default, or an injected `performSearch`) |

You can also `defineTool` your own in a few lines.