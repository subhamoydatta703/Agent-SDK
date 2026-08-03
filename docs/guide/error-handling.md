# Error Handling

Somoy deliberately returns **results, not throws**, for every expected failure mode. You never write
`try/catch` to handle a loop detection, a guardrail rejection, or a model outage.

## The contract

Every exit path resolves to a `RunResult` with a `status` discriminant:

| Status | Meaning |
| --- | --- |
| `completed` | a final answer (and `data` if `outputSchema` set) |
| `max_turns_exceeded` | turn budget exhausted |
| `max_tool_calls_exceeded` | tool-call budget exhausted |
| `error` | loop/handoff loop, model failure, timeout, structured-output failure |
| `guardrail_rejected` | an input/output/tool guardrail blocked the run |

`error` carries a `RunErrorInfo` with a `kind`:
`loop_detected | handoff_loop | model_error | tool_error | timeout | structured_output | invalid_input`.

## Example

```ts
const result = await agent.run('do something');
switch (result.status) {
  case 'completed': console.log(result.text); break;
  case 'guardrail_rejected': console.warn('Guardrail:', result.reason); break;
  case 'max_turns_exceeded': console.warn('Budget:', result.reason); break;
  default: console.error(result.error?.kind, result.error?.message);
}
```

## When Somoy does throw

Thrown errors are reserved for **genuine bugs or misuse**, e.g. an invalid agent name, a missing
`ModelProvider`, or an empty tool description. If you hit one of those, it is a programming error —
not a runtime model failure.

## Actionable messages

Provider adapters scrub secrets at the boundary, and error messages tell you what failed and what to
check (missing key, wrong model, status code) instead of dumping internal stack traces.