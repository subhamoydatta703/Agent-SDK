/// <reference types="node" />

// Tiered-routing / doctor-style triage: a lightweight router agent hands off to a
// specialist based on task complexity. Demonstrates handoff_to + loop protection.
import { Agent, AgentEventBus, AgentRegistry } from '../src/index.js';
import { MockProvider } from '../src/provider/mock.js';

async function main() {
  const events = new AgentEventBus();
  const model = new MockProvider((_m, _o, index) => {
    if (index === 0) {
      return {
        content: '',
        toolCalls: [{ id: 'h1', name: 'handoff_to', args: { receiver: 'researcher', reason: 'in-depth research is required' } }],
        finishReason: 'tool_calls' as const,
      };
    }
    return { content: 'Here is the researched answer.', finishReason: 'stop' as const };
  });

  const router = new Agent({
    name: 'triage',
    instructions: 'You are a triage router. Assess the task and delegate to the best specialist via handoff_to.',
    model,
  });
  const researcher = new Agent({
    name: 'researcher',
    instructions: 'You perform deep research and return a thorough, well-structured answer.',
    model,
  });
  const specialist = new Agent({
    name: 'calculator',
    instructions: 'You perform precise arithmetic and return the numeric answer.',
    model,
  });

  const registry = new AgentRegistry([router, researcher, specialist]);
  events.onAny((ev) => console.log('  -', ev.type, JSON.stringify(ev)));

  const result = await router.run('Produce a short research briefing on renewable energy storage.', { registry });
  console.log('\nAgents visited:', result.agents.join(' -> '));
  console.log('Result status:', result.status);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});