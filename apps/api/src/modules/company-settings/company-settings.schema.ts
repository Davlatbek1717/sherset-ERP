import { z } from 'zod';
import {
  DEFAULT_SALE_DEBT_TERM_DAYS,
  SALE_DEBT_TERM_DAYS_MAX,
  SALE_DEBT_TERM_DAYS_MIN,
} from '../debt/sale-debt-registry.js';

/**
 * moysklad «Настройки компании» page payload (owner screenshots 2026-07-17).
 * One singleton row per account; every field on the page is explicit here so
 * a PUT always writes the full page state (no partial-merge surprises).
 *
 * 🔴 Q4 (2026-08-25) — `saleDebtTermDays` moysklad'da YO'Q, u Sherset
 * qo'shimchasi (reja:
 * `docs/plans/2026-08-25-kassa-qarzi-undirish-reyestri.md`, §Q4 vazifa 4).
 * Nega aynan shu yerda: sozlama akkaunt-singleton'iga tegishli va Sherset
 * sozlamalari (`messaging_*`, `receipt_printer_name`) allaqachon
 * `company_settings` jadvalida yashaydi — ikkinchi sozlamalar uyi
 * qurilmaydi (reja talabi: «yangi jadval ochilmasin»).
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
  /**
   * 🔴 Sherset (Q4) — «Kassa qarzining muddati (kun)».
   *
   * Kassadan qarzga sotilgan chek `Debt` reyestrida shu muddat bilan
   * ochiladi (`saleDebtDueAt(postedAt, termDays)`). `0` YAROQLI qiymat —
   * «o'sha kuniyoq muddati keladi»; NULL holati bu yerda YO'Q, chunki PUT
   * har doim to'liq sahifa holatini yozadi va ekran sozlanmagan akkauntga
   * default'ni ko'rsatadi ({@link COMPANY_SETTINGS_DEFAULTS}).
   *
   * Faqat YANGI cheklarga ta'sir qiladi — mavjud qarz qatorlarining
   * muddati QAYTA HISOBLANMAYDI (Q4 qabul mezoni).
   */
  saleDebtTermDays: z.coerce
    .number()
    .int()
    .min(SALE_DEBT_TERM_DAYS_MIN)
    .max(SALE_DEBT_TERM_DAYS_MAX),
});
export type UpdateCompanySettingsInput = z.infer<typeof UpdateCompanySettingsSchema>;

/**
 * Virtual defaults when the account has never saved the page — matches the
 * moysklad defaults visible on the owner's account (Запретить отгрузку OFF,
 * корзина ON, доп. поля ON), NOT the historical column defaults.
 *
 * `saleDebtTermDays` — Q1 ning kod-defaulti (14). U shu yerda QAYTA
 * yozilmaydi, `sale-debt-registry.ts` dan import qilinadi: ikki nusxa ikki
 * haqiqat bo'lardi va biri o'zgarganda ekran serverdan boshqa son
 * ko'rsatardi.
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
  saleDebtTermDays: DEFAULT_SALE_DEBT_TERM_DAYS,
};
