# Reliability

Somoy is built to fail safely and retry intelligently.

## Retries with exponential backoff

Transient model-provider failures (rate limits, 5xx) are retried automatically with exponential
backoff plus jitter. Retries are capped and configurable via `runConfig`:

```ts
await agent.run('input', {
  runConfig: { maxRetries: 3, retryBaseDelayMs: 200 },
});
```

Retry events appear on the bus (`retry`) and in the trace.

## Timeouts

Two configurable timeouts protect every run:

```ts
runConfig: {
  modelTimeoutMs: 30_000,  // per model call
  timeoutMs: 60_000,       // whole run
}
```

The run timeout is propagated to running tools as an `AbortSignal`, so in-flight work can actually
cancel.

## No secrets in logs

API keys are never logged, traced, or included in error messages. Adapters scrub them at the
provider boundary before any message leaves the adapter.

## Safe failure shape

Any budget/limit/timeout problem returns a normal `RunResult` (`max_turns_exceeded` or an `error`
result) rather than crashing your process.