# Guardrails

Guardrails run at three points and return a uniform `{ pass, reason? }`. A rejection is a normal
**`guardrail_rejected` result**, never a thrown error.

- **Input guardrails** — run before the model call (block empty/oversized/malicious input).
- **Output guardrails** — run on the final answer (strip/block sensitive data, enforce schema).
- **Tool guardrails** — run before a tool executes (approval-gate a delete or code-execution tool).

## Built-ins

```ts
import {
  emptyInputGuardrail,
  lengthLimitInputGuardrail,
  sensitiveOutputGuardrail,
  approvalToolGuardrail,
} from '@subhamoy/somoy';

const agent = new Agent({
  name: 'safe',
  instructions: '...',
  model,
  inputGuardrails: [emptyInputGuardrail(), lengthLimitInputGuardrail(4000)],
  outputGuardrails: [sensitiveOutputGuardrail([/\d{3}-\d{2}-\d{4}/])],
  toolGuardrails: [
    approvalToolGuardrail({
      requireApproval: (toolName, input) => toolName !== 'delete_record',
      message: 'Deletes require explicit approval.',
    }),
  ],
});
```

## Custom guardrail

```ts
const profanity = {
  name: 'no_profanity',
  run: (output: string) =>
    banned.some((w) => output.includes(w)) ? { pass: false, reason: 'Blocked word found.' } : { pass: true },
};
```

Rejections appear in the event stream as `guardrail:triggered` and surface in the trace.