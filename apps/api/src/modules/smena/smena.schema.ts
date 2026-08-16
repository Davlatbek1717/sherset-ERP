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

/**
 * P11 — xodim kartasidan smenaga biriktirish (`PUT /admin/smenas/employee/:id`).
 *
 * Yo'nalish `PUT /roles/employee/:id {roleIds}` bilan bir xil: to'liq
 * ALMASHTIRISH (qo'shish/olib tashlash emas), shunda karta ekranidagi
 * belgilangan holat aynan DB holatiga aylanadi.
 */
export const SetEmployeeSmenasSchema = z.object({
  smenaIds: z.array(uuid).max(50),
});
export type SetEmployeeSmenasInput = z.infer<typeof SetEmployeeSmenasSchema>;

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
  // 2026-08-16 (egasi: «har smena 0 dan») — yashiqdagi boshlang'ich DOLLAR
  // (sentda). Ilgari bu yo'lda umuman qabul qilinmasdi va ustun jim 0 bo'lib
  // qolardi; endi ochilish shakli yuboradi. So'm bilan bir xil qat'iylik:
  // manfiy rad etiladi (kamomad yashirish yo'li).
  openingCashUsdMinor: z.coerce
    .string()
    .regex(/^\d+$/, 'openingCashUsdMinor must be a non-negative integer')
    .default('0'),
});
export type OpenSessionFromSmenaInput = z.infer<typeof OpenSessionFromSmenaSchema>;
