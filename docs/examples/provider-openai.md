# Example: Provider demo — OpenAI (live)

Runs against the real OpenAI API. Requires `OPENAI_API_KEY` in your environment (or a `.env`
loaded with dotenv). Demonstrates **tool calling + structured output together**.

```bash
bun run example:openai
```

## The code

```ts
import { z } from 'zod';
import { Agent, calculatorTool, OpenAIProvider } from '@subhamoy/somoy';

const answerSchema = z.object({
  question: z.string(),
  answer: z.number(),
});

const model = OpenAIProvider.fromEnv('gpt-4o-mini');

const agent = new Agent({
  name: 'math',
  instructions:
    'Use the calculator tool to compute the answer. Then respond with ONLY valid JSON matching: {"question": string, "answer": number}',
  model,
  tools: [calculatorTool()],
  outputSchema: answerSchema,
});

const result = await agent.run<z.infer<typeof answerSchema>>('What is (5+3)*2?');
console.log(result.status, result.data); // completed { question: '...', answer: 16 }
```

## Notes

- `OpenAIProvider.fromEnv(model?)` reads `OPENAI_API_KEY` and throws a clear error if it is
  missing. `new OpenAIProvider({ apiKey })` also works.
- **Tool calling + `outputSchema` coexist**: Somoy only enables JSON mode when no tools are
  declared, so the model can call `calculator` first and then emit the schema JSON.
- **Canonical tool names**: OpenAI returns un-namespaced tool-call names (`calculator`), so
  `tool:start` and `tool:end` report the same name.
- Tool parameters are emitted without `$schema` / `additionalProperties`, so one schema works
  unchanged across every provider.
- Custom `baseUrl` is supported for OpenAI-compatible endpoints
  (`new OpenAIProvider({ baseUrl: 'https://api.openrouter.ai/api/v1', model: '...' })`).
