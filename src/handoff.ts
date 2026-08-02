import { z } from 'zod';

export const HANDOFF_TOOL = 'handoff_to';

export const handoffInputSchema = z.object({
  receiver: z.string().min(1).describe('Name of the agent to hand off to'),
  reason: z.string().min(1).describe('Why this task should be delegated to that agent'),
});

export type HandoffInput = z.infer<typeof handoffInputSchema>;