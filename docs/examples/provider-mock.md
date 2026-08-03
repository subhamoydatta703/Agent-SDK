# Example: Provider demo — Mock (offline)

The default `MockProvider` is **smart**: when a `calculator` tool is registered it
auto-extracts the arithmetic expression from the question and answers with the computed
value — no hardcoded handler required. It works for *any* expression, not just a canned one,
including questions with trailing words like `calculate 5+3 now`.

```bash
bun run example:mock
```

## The code

```ts
import { Agent, calculatorTool, MockProvider } from '@subhamoy/somoy';

const agent = new Agent({
  name: 'math',
  instructions: 'Use the calculator tool for arithmetic.',
  model: new MockProvider(), // no handler -> smart default
  tools: [calculatorTool()],
});

for (const q of ['What is (5+3)*2?', 'What is 123*456?', 'calculate 5+3 now']) {
  const result = await agent.run(q);
  console.log(result.status, result.text);
}
```

Each question produces `status=completed` and the computed value — e.g.
`The result is 16.`, `The result is 56088.`, `The result is 12.5.`

## How the smart default works

- If the last message is a **tool result**, it answers with the returned value.
- If the last message is a **user question**, it extracts the math expression by trying
  contiguous word slices (so leading and trailing words are both ignored), validates it with
  the same recursive-descent parser used by `calculatorTool` (`safeEval`), and emits a
  `calculator` tool call.
- Passing a custom handler (or calling `setHandler`) still takes full precedence.

See also the [Mock provider](/guide/providers) docs.
