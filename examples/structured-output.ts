// Structured output with a one-pass repair: the first model response is invalid
// JSON, so Somoy feeds the validation errors back and re-validates.
import { z } from 'zod';
import { Agent } from '../src/index.js';
import { MockProvider } from '../src/provider/mock.js';

async function main() {
  const model = new MockProvider((_m, _o, index) => {
    if (index === 0) return { content: '{oops this is not json', finishReason: 'stop' as const };
    return {
      content: '{"title":"Repair Demo","items":[{"name":"alpha","count":3},{"name":"beta","count":7}]}',
      finishReason: 'stop' as const,
    };
  });

  const reportSchema = z.object({
    title: z.string(),
    items: z.array(z.object({ name: z.string(), count: z.number() })),
  });

  const agent = new Agent({
    name: 'reporter',
    instructions: 'Always respond with only valid JSON matching the requested schema.',
    model,
    outputSchema: reportSchema,
  });

  const result = await agent.run<z.infer<typeof reportSchema>>('Build a short report');
  console.log('Status:', result.status);
  console.log('Typed data (inferred from the zod schema):');
  console.log(JSON.stringify(result.data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});