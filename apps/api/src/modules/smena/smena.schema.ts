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
  // Asosiy `OpenSessionSchema` naqshi (cashier-session.schema.ts): faqat
  // raqamlar — manfiy ochilish naqdi RAD etiladi. `z.coerce.bigint()`
  // manfiyni qabul qilardi, bu esa «ochilishda kam edi» bahonasi bilan
  // kamomadni yashirish yo'li edi. String saqlanadi, BigInt'ga servis o'giradi.
  openingCashMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'openingCashMinor must be a non-negative integer')
    .default('0'),
});
export type OpenSessionFromSmenaInput = z.infer<typeof OpenSessionFromSmenaSchema>;
