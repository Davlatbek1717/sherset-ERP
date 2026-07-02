import { z } from 'zod';

export const OneCDirectionSchema = z.enum(['pull-only', 'push-only', 'bidirectional']);
export type OneCDirection = z.infer<typeof OneCDirectionSchema>;

export const SaveOneCConfigSchema = z.object({
  endpointUrl: z.string().url().max(500),
  username: z.string().min(1).max(100),
  password: z.string().max(500).optional(),
  direction: OneCDirectionSchema.default('bidirectional'),
  pollIntervalMin: z.coerce.number().int().min(5).max(1440).default(60),
});
export type SaveOneCConfigInput = z.infer<typeof SaveOneCConfigSchema>;

export const OneCSyncStatusSchema = z.enum(['success', 'partial', 'failed']);
export type OneCSyncStatus = z.infer<typeof OneCSyncStatusSchema>;

export const ListOneCSyncLogsSchema = z.object({
  direction: z.enum(['pull', 'push']).optional(),
  status: OneCSyncStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListOneCSyncLogsInput = z.infer<typeof ListOneCSyncLogsSchema>;
