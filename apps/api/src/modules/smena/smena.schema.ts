import { z } from 'zod';

const uuid = z.string().uuid();

export const CreateSmenaSchema = z.object({
  name: z.string().min(1).max(100),
  scheduleId: uuid,
  organizationId: uuid,
  employeeIds: z.array(uuid).default([]),
});
export type CreateSmenaInput = z.infer<typeof CreateSmenaSchema>;

export const UpdateSmenaSchema = CreateSmenaSchema.partial();
export type UpdateSmenaInput = z.infer<typeof UpdateSmenaSchema>;

export const OpenSessionFromSmenaSchema = z.object({
  smenaId: uuid,
  outOfShiftReason: z.string().max(500).optional(),
  openingCashMinor: z.coerce.bigint().default(0n),
});
export type OpenSessionFromSmenaInput = z.infer<typeof OpenSessionFromSmenaSchema>;
