# Structured Output

Declare an `outputSchema` on the agent and the run's `data` field becomes that exact type — no
manual casting.

```ts
import { z } from 'zod';
import { Agent, MockProvider } from '@subhamoy/somoy';

const reportSchema = z.object({
  title: z.string(),
  items: z.array(z.object({ name: z.string(), count: z.number() })),
});

const agent = new Agent({
  name: 'reporter',
  instructions: 'Respond with only valid JSON.',
  model: new MockProvider(),
  outputSchema: reportSchema,
});

const result = await agent.run<z.infer<typeof reportSchema>>('Build a report');
if (result.status === 'completed') {
  console.log(result.data.title); // typed!
}
```

## Repair pass

If the model returns invalid JSON, Somoy does **one** repair pass: it feeds the validation errors
back to the model and re-parses. If that still fails, the run returns `status: 'error'` with kind
`structured_output` and the validation issues attached — it never silently coerces bad data.