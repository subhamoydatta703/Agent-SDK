# Example: A tool-calling agent with streaming + sessions

This worked example builds the `basic` agent end-to-end: a calculator tool, live event streaming,
and a reusable session. Run it offline with no API key:

```bash
bun run example
```

## 1. Pick a model

For now we use the keyless `MockProvider`. The handler returns a tool call first, then a final
answer once the tool result is available:

```ts
const model = new MockProvider((messages) => {
  const last = messages[messages.length - 1];
  if (last && last.role === 'tool') {
    return { content: 'The result of (5+3)*2 is 16.', finishReason: 'stop' };
  }
  return {
    content: 'Let me compute that.',
    toolCalls: [{ id: 'c1', name: 'calculator', args: { expression: '(5+3)*2' } }],
    finishReason: 'tool_calls',
  };
});
```

## 2. Build the agent

```ts
const agent = new Agent({
  name: 'basic',
  instructions: 'Use your tools whenever a calculation or retrieval is needed.',
  model,
  tools: [calculatorTool(), docSenseTool({ documents: { d1: 'Somoy is a transparent agent SDK.' } }), webSearchTool()],
});
```

## 3. Stream events and run

```ts
const events = new AgentEventBus();
events.onAny((ev) => console.log(' -', ev.type, ev));

const result = await agent.run('Calculate (5+3)*2', { events, sessionId: 'demo-session' });
console.log(result.status, result.text);
```

You'll see `run:start → model:call → text:delta → tool:start → tool:end → model:call → text:delta →
run:complete`. This is the same stream the `Trace` is built from.

## 4. Reuse the session

```ts
await agent.run('Now repeat that', { events, sessionId: 'demo-session' });
```

Reusing `sessionId` keeps the multi-turn history across runs.

## 5. Go live

Swap `MockProvider` for `GeminiProvider` (or `OpenAIProvider`) — nothing else changes.

```ts
const model = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
```