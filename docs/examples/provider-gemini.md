# Example: Provider demo — Gemini (live)

Runs against the real Gemini API. Requires `GEMINI_API_KEY` in your environment (or a `.env`
loaded with dotenv). Demonstrates **tool calling + structured output together**.

```bash
bun run example:gemini
```

## The code

```ts
import { z } from 'zod';
import { Agent, calculatorTool, GeminiProvider } from '@subhamoy/somoy';

const answerSchema = z.object({
  question: z.string(),
  answer: z.number(),
});

const model = GeminiProvider.fromEnv('gemini-3.1-flash-lite');

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

- `GeminiProvider.fromEnv(model?)` reads `GEMINI_API_KEY` and throws a clear error if it is
  missing. `new GeminiProvider({ apiKey })` also works.
- **Tool calling + `outputSchema` coexist**: Somoy only enables JSON mode when no tools are
  declared, so Gemini is free to call `calculator` first and then emit the schema JSON.
- Gemini 3.x models require thought-signature round-tripping; the adapter handles this
  automatically (see [Providers](/guide/providers)).
