/// <reference types="node" />

// Provider demo: Gemini (live, requires GEMINI_API_KEY) — how you get the output.
//
// Demonstrates TOOL CALLING + STRUCTURED OUTPUT together. Somoy only enables
// JSON mode when no tools are declared, so an outputSchema and tools coexist.
//
// Three Gemini-specific behaviors handled for you:
//   - Gemini returns tool-call names NAMESPACED (e.g. "default_api:calculator").
//     Somoy matches them to your registered tool, so you see the raw name on
//     tool:start and the CANONICAL tool name on tool:end — and the tool actually runs.
//   - Tool parameters are emitted Gemini-compatible (no $schema / additionalProperties),
//     which older Gemini versions would otherwise reject with a 400.
//   - Gemini 3.x THINKING models (e.g. gemini-3.1-flash-lite) attach a `thoughtSignature`
//     to each function-call PART (a sibling of `functionCall`). It MUST be echoed back at
//     the part level when history is replayed, or the follow-up request fails with a 400
//     ("missing a thought_signature"). Somoy captures and replays it automatically, so no
//     action is needed. Older Gemini models (gemini-2.x) work fine without signatures.
//
// Expected output (with a valid GEMINI_API_KEY):
//
//   Q: What is (5+3)*2?
//      [tool:start] default_api:calculator args={"expression":"(5+3)*2"}
//      [tool:end] calculator -> {"result":16}
//      status     : completed
//      text       : "{\"question\":\"What is (5+3)*2?\",\"answer\":16}"
//      data       : {"question":"What is (5+3)*2?","answer":16}   <- typed! inferred from the zod schema
//      turns      : 2                  <- tool call + final JSON answer
//      toolCalls  : 1
//      agents     : ["math"]
//      durationMs : 1234
//
// `run()` ALWAYS resolves to a `RunResult` VALUE, never a throw:
//   - check `result.status` first
//   - because the agent declares an `outputSchema`, `result.data` is the parsed,
//     typed structured output (generic: `agent.run<z.infer<typeof schema>>`)
//   - `result.text` is the raw model text (the JSON string)
import { z } from 'zod';
import { Agent, AgentEventBus, calculatorTool, GeminiProvider, type RunResult } from '../src/index.js';

const answerSchema = z.object({
  question: z.string(),
  answer: z.number(),
});

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
  events.on('tool:start', (ev) => console.log(`   [tool:start] ${ev.toolCall.name} args=${JSON.stringify(ev.toolCall.args)}`));
  events.on('tool:end', (ev) => console.log(`   [tool:end] ${ev.name} -> ${JSON.stringify(ev.data)}`));

  // fromEnv() throws a clear error if GEMINI_API_KEY is missing.
  // To hit an alternative endpoint, pass baseUrl: new GeminiProvider({ baseUrl, model }).
  const model = GeminiProvider.fromEnv('gemini-3.1-flash-lite');

  const agent = new Agent({
    name: 'math',
    instructions:
      'Use the calculator tool to compute the answer. Then respond with ONLY valid JSON matching: {"question": string, "answer": number}',
    model,
    tools: [calculatorTool()],
    outputSchema: answerSchema,
  });

  const question = 'What is (5+3)*2?';
  const result = await agent.run<z.infer<typeof answerSchema>>(question, { events });
  showResult(question, result);

  // With an outputSchema, `result.data` is fully typed:
  if (result.status === 'completed' && result.data) {
    console.log('   result.data.answer =', result.data.answer); // 16
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
