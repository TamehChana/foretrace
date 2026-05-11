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

/** CLI → POST /organizations/.../projects/.../terminal/batches */
export const terminalIngestBatchSchema = z.object({
  taskId: z.string().uuid().optional(),
  lines: z
    .array(z.string())
    .min(1, 'Provide at least one line')
    .max(320, 'Too many lines in one batch')
    .refine(
      (arr) => arr.every((s) => s.length <= 12_288),
      'Each line exceeds 12kb',
    ),
  client: z
    .object({
      host: z.string().max(253).optional(),
      cwd: z.string().max(2048).optional(),
      revision: z.string().max(120).optional(),
    })
    .optional(),
});

export type TerminalIngestBatchInput = z.infer<
  typeof terminalIngestBatchSchema
>;

export function parseTerminalIngestBatch(
  data: unknown,
): TerminalIngestBatchInput {
  return terminalIngestBatchSchema.parse(data);
}
