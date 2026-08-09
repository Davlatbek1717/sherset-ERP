import { z } from 'zod';
import { IsoDateTime, MinorAmount, Uuid } from './wire.js';

/**
 * `GET /counterparties` row — «Контрагенты».
 *
 * The most enriched list in the app: half of these keys are not columns at all.
 * `counterparty.service.ts#list` runs four batched aggregates over the page's
 * ids (posted demands, posted sales returns, latest `Call`, a NUMERIC discount
 * sum) and hand-assembles `balanceMinor` / `salesCount` / `profitMinor` / … onto
 * each row. Nothing on the FE could tell the difference between "the aggregate
 * was removed" and "this counterparty has no sales" — both render `0`.
 *
 * ⚠️ `salesAmount` is NOT the `Counterparty.salesAmount` column. The column is
 * a denormalised leftover the running app never writes (only import/sync sets
 * it); `list()` overwrites it with the LIVE posted-demand total. Reading the
 * column expecting the list figure is the trap.
 *
 * ⚠️ Every money aggregate here is BASE-CURRENCY ONLY (UZS): the service scopes
 * its `groupBy`s to `currency: BASE_CURRENCY` because `Demand.sumMinor` is in
 * the document's own currency and summing across currencies is meaningless. A
 * counterparty that only ever traded in USD reads `0`, not `null`.
 */

const NamedRef = z.object({ id: Uuid, name: z.string() });

/**
 * UZ requisites live in one JSON column rather than five columns (no migration
 * was taken for them), so every key is optional and the blob itself is nullable.
 */
export const UzRequisitesSchema = z.object({
  inn: z.string().optional(),
  pinfl: z.string().optional(),
  kpp: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
});
export type UzRequisites = z.infer<typeof UzRequisitesSchema>;

export const CounterpartyRowSchema = z.object({
  id: Uuid,
  name: z.string(),
  legalTitle: z.string().nullable(),
  companyType: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  fax: z.string().nullable(),
  code: z.string().nullable(),
  archived: z.boolean(),
  /** LIVE Σ posted-demand total (base currency) — see the header note. */
  salesAmount: MinorAmount,
  uzRequisites: UzRequisitesSchema.nullable(),
  /** «Комментарий» in the grid maps to the `description` column. */
  description: z.string().nullable(),
  actualAddress: z.string().nullable(),
  legalAddress: z.string().nullable(),
  discountCardNumber: z.string().nullable(),
  shared: z.boolean(),
  bonusPoints: z.number().int(),
  priceType: NamedRef.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  owner: NamedRef.nullable(),
  /** «Кто изменил» — stamped on update. */
  modifiedBy: NamedRef.nullable(),
  /** «Отдел» — the ACCESS department (`groupId`), not the grid's «Группы» column. */
  group: NamedRef.nullable(),
  /** «Группы» — the many-to-many counterparty grouping shown in the grid. */
  groups: z.array(NamedRef),
  /** CRM «Статус» — a tenant `State` row rendered as a coloured pill. */
  state: z.object({ id: Uuid, name: z.string(), color: z.string().nullable() }).nullable(),
  /** «Баланс» — base-currency net balance; `0` when there is no UZS balance row. */
  balanceMinor: MinorAmount,
  salesCount: z.number().int(),
  firstSaleDate: IsoDateTime.nullable(),
  lastSaleDate: IsoDateTime.nullable(),
  /** Σsum ÷ count in the integer tiyin domain — sub-tiyin remainder is dropped. */
  averageCheckMinor: MinorAmount,
  /** «Прибыль» = Σ revenue − Σ FIFO self-cost. Can be negative. */
  profitMinor: MinorAmount,
  returnsCount: z.number().int(),
  returnsSumMinor: MinorAmount,
  /** «Сумма скидок» — Σ(price × qty × discount%) as an exact DB NUMERIC aggregate. */
  discountSumMinor: MinorAmount,
  /** «Банк» / «Расчетный счет» — from the MAIN bank account only (isMain, else oldest). */
  bankName: z.string().nullable(),
  bankAccountNumber: z.string().nullable(),
  /** «Дата события» / «Текст события» — the latest `Call` (this app's only CRM event). */
  eventDate: IsoDateTime.nullable(),
  eventText: z.string().nullable(),
  attributes: z.record(z.unknown()).nullable(),
});
export type CounterpartyRow = z.infer<typeof CounterpartyRowSchema>;
