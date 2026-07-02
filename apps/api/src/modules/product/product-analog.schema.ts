import { z } from 'zod';

/**
 * «Аналоги» — add-an-analog request (moysklad product card → Аналоги tab).
 * The product whose list is edited is the route `:id`; the body carries the
 * analog product's id. A product cannot be its own analog and the same analog
 * cannot be added twice (the service enforces both → 400 / 409).
 */
export const AddAnalogSchema = z.object({
  analogId: z.string().uuid(),
});
export type AddAnalogInput = z.infer<typeof AddAnalogSchema>;
