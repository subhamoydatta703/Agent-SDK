# Providers

Somoy is provider-agnostic through a single `ModelProvider` interface. Every adapter implements
`complete()`, so the agent loop never knows (or cares) which model powers it.

```ts
interface ModelProvider {
  readonly id: string;
  complete(messages: ChatMessage[], opts?: ModelCallOptions): Promise<ModelResult>;
}
```

## Gemini (default for live use)

```ts
import { GeminiProvider } from '@subhamoy/somoy';
const model = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
// optionally: { model: 'gemini-2.0-flash' }
```

`GeminiProvider.fromEnv(model?)` is the simplest path — it reads `GEMINI_API_KEY` and throws a
clear, actionable error if it is missing.

Supports function calling and JSON mode (`responseMimeType: 'application/json'`).

> **Gemini 3.x note:** Gemini 3 models (e.g. `gemini-3.1-flash-lite`) require the
> `thought_signature` returned on the model's function call to be echoed back when history is
> replayed. The adapter captures and replays this automatically; no action is needed. For a
> keyless round-trip check, `gemini-2.5-flash` and `gemini-2.0-flash` also work without signatures.

## OpenAI

```ts
import { OpenAIProvider } from '@subhamoy/somoy';
const model = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
// optionally: { model: 'gpt-4o-mini', baseUrl: '...' }
```

`OpenAIProvider.fromEnv(model?)` reads `OPENAI_API_KEY` and throws a clear error if missing.

## Mock (offline, no key)

```ts
import { MockProvider } from '@subhamoy/somoy';
const model = new MockProvider((messages, opts, index) => ({
  content: 'Hello',
  finishReason: 'stop',
}));
```

Use the `MockProvider` for tests and demos — no network, no key. It also records every call in
`model.calls` so you can assert on what the loop asked for.

The **default** handler is smart: when a `calculator` tool is registered, `new MockProvider()`
auto-extracts the arithmetic expression from the question and answers with the computed value —
so `new MockProvider()` works out of the box for arithmetic agents. Pass a custom handler (or use
`setHandler`) to take full control.

## Writing your own provider

Implement `ModelProvider` and convert your provider's messages/responses to `ChatMessage` /
`ModelResult`. That is the entire contract. Throw `TransientModelError` for retryable failures
(rate limits, 5xx) and `PermanentModelError` otherwise.