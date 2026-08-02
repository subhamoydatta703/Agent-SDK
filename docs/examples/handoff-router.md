# Example: Triage router with handoffs

This worked example builds a tiered-routing (doctor-style triage) system: a lightweight router hands
off to a specialist based on task complexity. Run it with:

```bash
bun run example:handoff
```

## The idea

A single generic agent answers everything poorly. A router observes the request and delegates to the
best specialist. Handoffs transfer the whole transcript — the specialist sees what the user asked and
what the router already did.

## 1. Define the agents

```ts
const router = new Agent({
  name: 'triage',
  instructions: 'Assess task complexity and delegate to the best specialist via handoff_to.',
  model,
});
const researcher = new Agent({
  name: 'researcher',
  instructions: 'Perform deep research and return a thorough answer.',
  model,
});
const math = new Agent({
  name: 'math',
  instructions: 'Perform precise arithmetic.',
  model,
});
```

## 2. Register the agents

```ts
const registry = new AgentRegistry([router, researcher, math]);
```

Passing the registry tells the loop to expose the `handoff_to` reserved tool.

## 3. Run

```ts
const result = await router.run('Produce a short research briefing on renewable energy storage.', { registry });
console.log(result.agents.join(' -> ')); // triage -> researcher
```

## 4. What happens under the hood

1. The router's model decides this needs deep research and emits `handoff_to({ receiver: 'researcher', reason })`.
2. The loop checks the handoff chain (no ping-pong), records `handoff:start`/`handoff:end` events.
3. Context is transferred — the researcher sees the conversation, not a blank slate.
4. The researcher produces the final answer; the run completes.

## Loop protection

If a specialist tried to hand back to the router within the last few hops, the run would abort with a
`handoff_loop` error result instead of bouncing forever.