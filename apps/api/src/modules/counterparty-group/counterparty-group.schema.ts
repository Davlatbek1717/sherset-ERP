import { z } from 'zod';

// moysklad «Группы контрагентов» — flat named groups (account-scoped). Create/rename
// only; a counterparty's membership is managed on the counterparty side (m2m connect).
export const CreateCounterpartyGroupSchema = z.object({
  name: z.string().trim().min(1).max(255),
  index: z.number().int().optional(),
});
export const UpdateCounterpartyGroupSchema = CreateCounterpartyGroupSchema.partial();

export type CreateCounterpartyGroupInput = z.infer<typeof CreateCounterpartyGroupSchema>;
export type UpdateCounterpartyGroupInput = z.infer<typeof UpdateCounterpartyGroupSchema>;
