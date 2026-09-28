import { z } from "zod";

// Pass identifiers only. Task reads committed state instead of trusting a stale
// copy of user content in a queued payload.
export const projectCreatedPayloadSchema = z.strictObject({
  projectId: z.uuid(),
  ownerId: z.string().min(1),
});

export type ProjectCreatedPayload = z.infer<typeof projectCreatedPayloadSchema>;
