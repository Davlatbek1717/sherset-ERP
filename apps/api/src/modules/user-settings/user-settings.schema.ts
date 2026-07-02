import { z } from 'zod';

/**
 * UserSettings (moysklad «Настройки пользователя» / `#account`) — per-employee
 * preferences + «Значения по умолчанию» (default org/store/counterparty/
 * supplier/project that pre-fill new documents). The model already exists
 * (packages/db UserSettings, keyed `employeeId @unique`); this wires it.
 *
 * All fields optional (PATCH-style partial). Reference ids use `.nullish()`
 * so the client can CLEAR a default (send null) — distinct from "leave as-is"
 * (omit the key).
 */
export const UpdateUserSettingsSchema = z.object({
  locale: z.string().max(10).optional(),
  printFormat: z.string().max(20).optional(),
  defaultScreen: z.string().max(40).nullish(),
  // «Значения по умолчанию» — pre-fill new documents.
  defaultCompanyId: z.string().uuid().nullish(),
  defaultStoreId: z.string().uuid().nullish(),
  defaultProjectId: z.string().uuid().nullish(),
  defaultCustomerId: z.string().uuid().nullish(),
  defaultSupplierId: z.string().uuid().nullish(),
  // «Настройки»
  fieldsPerRow: z.coerce.number().int().min(1).max(10).optional(),
  autoShowReports: z.boolean().optional(),
  mailFooter: z.boolean().optional(),
});
export type UpdateUserSettingsInput = z.infer<typeof UpdateUserSettingsSchema>;
