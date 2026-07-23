import { z } from 'zod';

/**
 * moysklad «Настройки компании» page payload (owner screenshots 2026-07-17).
 * One singleton row per account; every field on the page is explicit here so
 * a PUT always writes the full page state (no partial-merge surprises).
 */
export const UpdateCompanySettingsSchema = z.object({
  /** «Правила нумерации документов»: false = Внутри календарного года,
   *  true = По порядку за всю историю. */
  globalOperationNumbering: z.boolean(),
  /** «Обратный адрес в письмах». */
  emailReplyMode: z.enum(['EMPLOYEE', 'COMPANY']),
  /** «Запретить отгрузку товаров, которых нет на складе». */
  checkShippingStock: z.boolean(),
  /** «Автоматически устанавливать минимальную цену». */
  checkMinPrice: z.boolean(),
  /** «Перемещать удаленные документы на 7 дней в корзину». */
  useRecycleBin: z.boolean(),
  /** «Использовать партии товаров». */
  useConsignments: z.boolean(),
  /** «Включить отображение дополнительных полей товаров и услуг в позициях документов». */
  showPositionAttributes: z.boolean(),
  /** «Страна для базовых настроек» — 2-letter code. */
  accountCountry: z
    .string()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toUpperCase()),
});
export type UpdateCompanySettingsInput = z.infer<typeof UpdateCompanySettingsSchema>;

/**
 * Virtual defaults when the account has never saved the page — matches the
 * moysklad defaults visible on the owner's account (Запретить отгрузку OFF,
 * корзина ON, доп. поля ON), NOT the historical column defaults.
 */
export const COMPANY_SETTINGS_DEFAULTS: UpdateCompanySettingsInput = {
  globalOperationNumbering: false,
  emailReplyMode: 'EMPLOYEE',
  checkShippingStock: false,
  checkMinPrice: false,
  useRecycleBin: true,
  useConsignments: false,
  showPositionAttributes: true,
  accountCountry: 'UZ',
};
