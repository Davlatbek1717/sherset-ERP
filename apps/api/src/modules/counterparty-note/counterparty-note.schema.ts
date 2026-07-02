import { z } from 'zod';

const uuid = z.string().uuid();

/** Create a CRM «Заметка» on a counterparty (the «Создать заметку» composer). */
export const CreateCounterpartyNoteSchema = z.object({
  counterpartyId: uuid,
  text: z.string().trim().min(1, 'Matn kiritilmadi').max(10000),
});
export type CreateCounterpartyNoteInput = z.infer<typeof CreateCounterpartyNoteSchema>;

/** Edit a note's text (the «Редактировать» action on a «Заметка»). */
export const UpdateCounterpartyNoteSchema = z.object({
  text: z.string().trim().min(1, 'Matn kiritilmadi').max(10000),
});
export type UpdateCounterpartyNoteInput = z.infer<typeof UpdateCounterpartyNoteSchema>;

/** List notes for one counterparty (the «Заметки» / «Все события» streams). */
export const CounterpartyNoteFilterSchema = z.object({
  counterpartyId: uuid,
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CounterpartyNoteFilterInput = z.infer<typeof CounterpartyNoteFilterSchema>;
