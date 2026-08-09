import { z } from 'zod';
import { EQUIPMENT_STATUSES, RETURN_CONDITIONS } from './equipment.js';

/**
 * Jihoz reyestrining kirish shartnomasi (MK05).
 *
 * ⚠️ `status` bu yerda ham `assigned` ni QABUL QILADI, lekin servis uni rad
 * etadi (`manualStatusBlockReason`) — sabab tushunarli xato matni bilan
 * qaytishi uchun. Zod darajasida jimgina tashlab yuborish «nega o'zgarmadi»
 * degan savolsiz muammoga olib kelardi (Zod jim tashlash bug-klassi).
 */
export const CreateEquipmentSchema = z.object({
  name: z.string().trim().min(1, 'Nom bo`sh bo`lmasin').max(200),
  inventoryNo: z.string().trim().max(64).nullish(),
  category: z.string().trim().max(32).nullish(),
  note: z.string().trim().max(1000).nullish(),
});

export const UpdateEquipmentSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    inventoryNo: z.string().trim().max(64).nullish(),
    category: z.string().trim().max(32).nullish(),
    note: z.string().trim().max(1000).nullish(),
    status: z.enum(EQUIPMENT_STATUSES as unknown as [string, ...string[]]).optional(),
  })
  .strict();

export const AssignEquipmentSchema = z.object({
  employeeId: z.string().uuid(),
  note: z.string().trim().max(1000).nullish(),
});

export const ReturnEquipmentSchema = z.object({
  condition: z.enum(RETURN_CONDITIONS as unknown as [string, ...string[]]).default('ok'),
  note: z.string().trim().max(1000).nullish(),
});

export const EquipmentFilterSchema = z.object({
  status: z.enum(EQUIPMENT_STATUSES as unknown as [string, ...string[]]).optional(),
  employeeId: z.string().uuid().optional(),
  q: z.string().trim().max(200).optional(),
});

export type CreateEquipmentInput = z.infer<typeof CreateEquipmentSchema>;
export type UpdateEquipmentInput = z.infer<typeof UpdateEquipmentSchema>;
export type AssignEquipmentInput = z.infer<typeof AssignEquipmentSchema>;
export type ReturnEquipmentInput = z.infer<typeof ReturnEquipmentSchema>;
export type EquipmentFilterInput = z.infer<typeof EquipmentFilterSchema>;
