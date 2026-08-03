/// <reference types="node" />

// Provider demo: MockProvider (offline, no key) — how you get the output.
//
// The DEFAULT MockProvider is smart: when a `calculator` tool is registered it
// auto-extracts the arithmetic expression from the question and answers with the
// computed value. No hardcoded handler needed, and it works for ANY expression.
//
// Expected output for `What is 123*456?`:
//
//   Q: What is 123*456?
//      [tool:end] calculator -> {"result":56088}
//      status     : completed
//      text       : "The result is {\"result\":56088}."
//      data       : undefined          <- no outputSchema declared, so data is absent
//      turns      : 2                  <- model called twice (tool call + final answer)
//      toolCalls  : 1
//      agents     : ["math"]
//      durationMs : 3
//
// `run()` ALWAYS resolves to a `RunResult` VALUE, never a throw:
//   - check `result.status` first  ('completed' | 'error' | 'max_turns_exceeded' | 'guardrail_rejected')
//   - read the plain answer from `result.text`
//   - read typed structured output from `result.data` (only when the agent declares an outputSchema)
import { Agent, AgentEventBus, calculatorTool, MockProvider, type RunResult } from '../src/index.js';

function showResult(q: string, result: RunResult) {
  console.log(`Q: ${q}`);
  console.log('   status     :', result.status);
  console.log('   text       :', JSON.stringify(result.text));
  console.log('   data       :', JSON.stringify(result.data));
  console.log('   turns      :', result.turns);
  console.log('   toolCalls  :', result.toolCalls);
  console.log('   agents     :', JSON.stringify(result.agents));
  console.log('   durationMs :', result.durationMs);
  if (result.status !== 'completed') {
    console.log('   error      :', result.error?.kind, result.error?.message, result.reason);
  }
  console.log('');
}

async function main() {
  const events = new AgentEventBus();
  events.on('tool:end', (ev) => console.log(`   [tool:end] ${ev.name} -> ${JSON.stringify(ev.data)}`));

  const agent = new Agent({
    name: 'math',
    instructions: 'Use the calculator tool for arithmetic.',
    model: new MockProvider(), // no handler -> smart default
    tools: [calculatorTool()],
  });

  const questions = ['What is (5+3)*2?', 'What is 123*456?', 'What is sqrt(81)+max(2,7)^2?', 'What is 100/8?'];
  for (const q of questions) {
    const result = await agent.run(q, { events });
    showResult(q, result);
  }

  // Reuse a sessionId to keep conversation history across runs.
  const second = await agent.run('What is 7*6?', { events, sessionId: 'demo-session' });
  console.log('Second run (reused session):', second.status, '->', second.text);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
