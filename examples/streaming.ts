/// <reference types="node" />

// Streaming via an async iterator built on top of the event bus.
// The event stream is the single debugging surface (trace is derived from it too).
import { Agent, AgentEventBus, MockProvider, calculatorTool, eventStream } from '../src/index.js';

async function main() {
  const events = new AgentEventBus();
  const model = new MockProvider((messages) => {
    const last = messages[messages.length - 1];
    if (last && last.role === 'tool') {
      return { content: 'Final answer: 42.', finishReason: 'stop' as const };
    }
    return {
      content: 'I will calculate that.',
      toolCalls: [{ id: 's1', name: 'calculator', args: { expression: '6*7' } }],
      finishReason: 'tool_calls' as const,
    };
  });
  const agent = new Agent({ name: 'streamer', instructions: 'Use tools when asked.', model, tools: [calculatorTool()] });

  // Attach the stream before starting the run so no event (incl. run:start) is missed.
  const stream = eventStream(events);
  const runPromise = agent.run('what is 6*7', { events });
  console.log('Consuming events incrementally as they arrive:');
  for await (const ev of stream) {
    console.log('  [' + new Date().toISOString().slice(11, 23) + ']', ev.type);
    if (ev.type === 'text:delta') console.log('      ->', ev.delta);
  }
  const result = await runPromise;
  console.log('\nDone with status:', result.status, '| text:', result.text);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});