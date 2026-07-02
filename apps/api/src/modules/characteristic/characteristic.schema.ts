import { z } from 'zod';

/**
 * Characteristic (Характеристика модификации) — account-level dictionary of
 * variant characteristic names (e.g. «Цвет», «Размер»). moysklad keeps these as
 * reusable { id, name, type:'string' } entries so the «Создание модификаций»
 * modal can offer existing names. Creating one needs only a non-empty `name`
 * (moysklad: "необходимо и достаточно указать непустое поле name").
 */
export const CreateCharacteristicSchema = z.object({
  name: z.string().trim().min(1, 'Nom majburiy').max(255),
});
export type CreateCharacteristicInput = z.infer<typeof CreateCharacteristicSchema>;

export const CharacteristicFilterSchema = z.object({
  search: z.string().max(255).optional(),
});
export type CharacteristicFilterInput = z.infer<typeof CharacteristicFilterSchema>;
