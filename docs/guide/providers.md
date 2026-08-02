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

Supports function calling and JSON mode (`responseMimeType: 'application/json'`).

## OpenAI

```ts
import { OpenAIProvider } from '@subhamoy/somoy';
const model = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
// optionally: { model: 'gpt-4o-mini', baseUrl: '...' }
```

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

## Writing your own provider

Implement `ModelProvider` and convert your provider's messages/responses to `ChatMessage` /
`ModelResult`. That is the entire contract. Throw `TransientModelError` for retryable failures
(rate limits, 5xx) and `PermanentModelError` otherwise.