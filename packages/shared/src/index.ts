import { z } from 'zod';

export const API_NAME = 'foretrace-api' as const;

export const healthPayloadSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});

export type HealthPayload = z.infer<typeof healthPayloadSchema>;

export function parseHealthPayload(data: unknown): HealthPayload {
  return healthPayloadSchema.parse(data);
}
