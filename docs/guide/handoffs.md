# Handoffs (multi-agent delegation)

Handoffs let one agent transfer control to another specialist with the relevant transcript — never
a blind reset.

## How it works

The loop registers a reserved `handoff_to` tool whenever you pass an `AgentRegistry`. The model may
call it with `{ receiver, reason }`. The loop:

1. verifies the receiver exists in the registry,
2. checks the **handoff chain** to prevent ping-pong (A → B → A) within the last K hops
   (`handoffLoopWindow`, default 3),
3. records the handoff as a distinct event, transfers context, and continues iterating under the
   receiving agent.

## Route a task to a specialist (triage)

```ts
import { Agent, AgentRegistry } from '@subhamoy/somoy';

const triage = new Agent({ name: 'triage', instructions: 'Assess complexity, then delegate.', model });
const research = new Agent({ name: 'research', instructions: 'Do deep research.', model });
const math = new Agent({ name: 'math', instructions: 'Do arithmetic.', model });

const registry = new AgentRegistry([triage, research, math]);
const result = await triage.run('Write a short study of the reasons behind the price of oil.', { registry });
console.log(result.agents); // ['triage', 'research', 'math']
```

This is the natural home for tiered routing / doctor-style triage by task complexity.

## Loop prevention

If a handoff would revisit an agent already in the recent chain, the run aborts with a
`handoff_loop` error result instead of spinning forever.