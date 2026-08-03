# Quick Start

Here is a complete, working agent in under 30 seconds — offline, with a `MockProvider`.

```ts
import { Agent, calculatorTool, MockProvider } from '@subhamoy/somoy';

const agent = new Agent({
  name: 'math',
  instructions: 'Use the calculator tool for arithmetic.',
  model: new MockProvider(),
  tools: [calculatorTool()],
});

const result = await agent.run('What is (5+3)*2?');
console.log(result.status, result.text);
```

`MockProvider` needs no key and never touches the network. When you are ready for a real model,
swap one line:

```ts
import { GeminiProvider } from '@subhamoy/somoy';

const agent = new Agent({
  name: 'math',
  instructions: 'Be concise.',
  model: new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY }),
  tools: [calculatorTool()],
});
```

## What you get back

`run()` resolves to a `RunResult` — a value, never a throw:

```ts
{
  status: 'completed',        // 'completed' | 'max_turns_exceeded' | 'max_tool_calls_exceeded' | 'error' | 'guardrail_rejected'
  text: '...',                // final assistant text
  data: undefined,            // present when an outputSchema is declared
  turns: 1, toolCalls: 0,     // iteration counters
  agents: ['math'],           // handoff chain visited
  durationMs: 12,
}
```

## Streaming events

```ts
const events = new AgentEventBus();
const result = await agent.run('hi', { events });
events.on('run:complete', (ev) => console.log(ev.result.status));
```

See [Streaming & Events](/guide/streaming-events).