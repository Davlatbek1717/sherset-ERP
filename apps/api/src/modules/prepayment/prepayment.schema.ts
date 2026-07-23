import { z } from 'zod';
import { csvUuid } from '../shared/csv.js';

/**
 * Prepayment (Предоплата) — advance payment received from a customer.
 *
 * Conceptually a money document like PaymentIn / CashIn, but with two key
 * differences:
 *
 *   1. There may not be an InvoiceOut yet — the customer is paying in
 *      advance, so the doc commonly links to a CustomerOrder instead (or
 *      nothing at all if it's a generic deposit).
 *   2. When taken at a retail till, the sum is split into cash / non-cash
 *      / QR components and the doc records the retail shift it belongs
 *      to. Wholesale/agency prepayments leave those fields at zero.
 *
 * Balance impact on post: −sumMinor (customer has paid us, their debt
 * shrinks — same sign convention as PaymentIn). On unpost / cancel:
 * +sumMinor (reverse).
 *
 * FSM:
 *   draft → posted (applicable=true, balance touched)
 *   posted → draft (unpost; reverse balance)
 *   draft|posted → cancelled (balance reversed if posted)
 */

export const PrepaymentStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PrepaymentState = z.infer<typeof PrepaymentStateSchema>;

export const PrepaymentTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PrepaymentTransitionTarget = z.infer<typeof PrepaymentTransitionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

const bigintMinor = z.string().regex(/^\d+$/, 'BigInt minor (faqat raqam)');

export const CreatePrepaymentSchema = z
  .object({
    agentId: z.string().uuid(),
    organizationId: z.string().uuid(),
    // moysklad parity — Договор / Проект (advance has counterparty).
    contractId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    // moysklad parity (§19) — Счёт организации / Счёт контрагента
    // (advance is money received; cols exist, no migration).
    organizationAccountId: z.string().uuid().nullish(),
    agentAccountId: z.string().uuid().nullish(),
    customerOrderId: z.string().uuid().nullish(),
    retailShiftId: z.string().uuid().nullish(),
    retailStoreId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    /** Total advance amount in BigInt minor units. */
    sumMinor: bigintMinor,
    /** VAT component embedded in sumMinor (informational). */
    vatSumMinor: bigintMinor.default('0'),
    /** Split components when taken at retail. Sum of three must == sumMinor. */
    cashSumMinor: bigintMinor.default('0'),
    noCashSumMinor: bigintMinor.default('0'),
    qrSumMinor: bigintMinor.default('0'),
    vatEnabled: z.boolean().default(true),
    vatIncluded: z.boolean().default(false),
    taxSystem: z.string().max(30).optional(),
    currency: z.string().length(3).default('UZS'),
    rateValue: bigintMinor.default('100000000'),
    description: z.string().max(4096).optional(),
    externalCode: z.string().max(255).optional(),
    applicable: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Retail split, when set, has to add up. Skip the check if all three
      // components are zero (typical for wholesale prepayments).
      const cash = BigInt(data.cashSumMinor);
      const noCash = BigInt(data.noCashSumMinor);
      const qr = BigInt(data.qrSumMinor);
      const total = cash + noCash + qr;
      if (total === 0n) return true;
      return total === BigInt(data.sumMinor);
    },
    {
      message: 'cashSum + noCashSum + qrSum != sumMinor',
      path: ['sumMinor'],
    },
  );

export type CreatePrepaymentInput = z.infer<typeof CreatePrepaymentSchema>;

export const UpdatePrepaymentSchema = z
  .object({
    agentId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    contractId: z.string().uuid().nullish(),
    projectId: z.string().uuid().nullish(),
    organizationAccountId: z.string().uuid().nullish(),
    agentAccountId: z.string().uuid().nullish(),
    customerOrderId: z.string().uuid().nullish(),
    retailShiftId: z.string().uuid().nullish(),
    retailStoreId: z.string().uuid().nullish(),
    moment: z.string().optional(),
    sumMinor: bigintMinor.optional(),
    vatSumMinor: bigintMinor.optional(),
    cashSumMinor: bigintMinor.optional(),
    noCashSumMinor: bigintMinor.optional(),
    qrSumMinor: bigintMinor.optional(),
    vatEnabled: z.boolean().optional(),
    vatIncluded: z.boolean().optional(),
    taxSystem: z.string().max(30).nullable().optional(),
    currency: z.string().length(3).optional(),
    rateValue: bigintMinor.optional(),
    description: z.string().max(4096).nullable().optional(),
    externalCode: z.string().max(255).nullable().optional(),
    // Optimistic-lock token (moysklad parity). REQUIRED on update — a caller
    // that forgets it must NOT silently bypass the lost-update guard. Carries
    // the integer `version` the edit form loaded; the service runs the update
    // as WHERE id+version and 409s on a mismatch. (.strict() rejects unknown
    // keys, so it MUST be a declared field.) CreatePrepaymentSchema stays
    // untouched — new rows have no prior version.
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdatePrepaymentInput = z.infer<typeof UpdatePrepaymentSchema>;

export const PrepaymentFilterSchema = z.object({
  /** «Статус» — Prepayment.state FSM filter. */
  state: PrepaymentStateSchema.optional(),
  /** «Контрагент» — Prepayment.agentId. */
  agentId: z.string().uuid().optional(),
  agentIds: csvUuid.optional(),
  /** «Группа контрагента» — filters via the agent (Counterparty) relation's groupId. */
  agentGroupId: z.string().uuid().optional(),
  /** «Организация» — Prepayment.organizationId. */
  organizationId: z.string().uuid().optional(),
  organizationIds: csvUuid.optional(),
  customerOrderId: z.string().uuid().optional(),
  retailShiftId: z.string().uuid().optional(),
  /** «Владелец-сотрудник» — Prepayment.ownerId. */
  ownerId: z.string().uuid().optional(),
  /** «Владелец-отдел» — Prepayment.groupId (owner department). */
  groupId: z.string().uuid().optional(),
  /** «Проведено» — Prepayment.applicable flag (tri-state in the UI). */
  applicable: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  /**
   * «Когда изменен» — moysklad parity. Filters on `updatedAt` between the
   * two ISO dates (mirrors momentFrom/To).
   */
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().nonnegative().optional(),
  sumMinorTo: z.coerce.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  // Tri-state boolean filters — moysklad's retail prepayment panel surfaces
  // all three (printed/published/shared). Columns exist on Prepayment.
  printed: boolFromString.optional(),
  published: boolFromString.optional(),
  shared: boolFromString.optional(),
  // Reference: visual-captures/07-module/prepayment/dom/00-clean-default.html
  // — the prepayment list filter is the RETAIL variant (Период · Тип оплаты ·
  // Товар или группа · Точка продаж · Контрагент · Группа контрагента ·
  // Организация · Статус · Проведено · Напечатано · Отправлено ·
  // Владелец-сотрудник · Владелец-отдел · Общий доступ · Когда изменен ·
  // Кто изменил · Сумма). Unlike «Входящие платежи», it has NO Договор /
  // Проект / Счёт организации / Счёт контрагента / Канал продаж / Статья
  // расходов / Назначение платежа. «Кто изменил» (modifiedById) is SKIPPED —
  // no `updatedById` column. «Тип оплаты» / «Товар или группа» /
  // «Точка продаж» are retail-POS facets with no list-picker route + outside
  // the money-page pattern, so they remain SKIPPED.
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().uuid().optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'createdAt', 'updatedAt', 'agent', 'organization'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PrepaymentFilterInput = z.infer<typeof PrepaymentFilterSchema>;
