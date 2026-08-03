/// <reference types="node" />

// Basic single-agent example: tool calling + session reuse, streamed live.
// Runs offline with a MockProvider. To use a real model, swap in:
//   import { GeminiProvider } from '../src/index.js';
//   const model = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
import { Agent, AgentEventBus, InMemorySessionStore, MockProvider, calculatorTool, docSenseTool, webSearchTool, type AgentEvent } from '../src/index.js';

async function main() {
  const events = new AgentEventBus();
  const model = new MockProvider((messages) => {
    const last = messages[messages.length - 1];
    const hasToolResult = last && last.role === 'tool';
    if (hasToolResult) {
      return { content: 'The result of (5+3)*2 is 16.', finishReason: 'stop' as const };
    }
    return {
      content: 'Let me compute that.',
      toolCalls: [{ id: 'c1', name: 'calculator', args: { expression: '(5+3)*2' } }],
      finishReason: 'tool_calls' as const,
    };
  });

  const agent = new Agent({
    name: 'basic',
    instructions: 'Use your tools whenever a calculation or retrieval is needed.',
    model,
    tools: [calculatorTool(), docSenseTool({ documents: { d1: 'Somoy is a transparent agent SDK for TypeScript.' } }), webSearchTool()],
  });

  console.log('Streaming events for this run:');
  events.onAny((ev: AgentEvent) => console.log('  -', ev.type, JSON.stringify(ev)));

  // Share a session store so the second run actually sees history from the first.
  const sessionStore = new InMemorySessionStore();

  const result = await agent.run('Calculate (5+3)*2', { events, sessionId: 'demo-session', sessionStore });
  console.log('\nRunResult:');
  console.log(JSON.stringify(result, null, 2));

  // Reusing the same sessionId + sessionStore keeps history across runs.
  const second = await agent.run('Give me the units again.', { events, sessionId: 'demo-session', sessionStore });
  console.log('\nSecond run (same session):', second.status);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});