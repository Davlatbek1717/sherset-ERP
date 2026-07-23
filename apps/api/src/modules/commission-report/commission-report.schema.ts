import { z } from 'zod';

/**
 * CommissionReport (Отчёт комиссионера) — settlement document used in
 * consignment-style trade.
 *
 *  - Out («Выданный отчёт комиссионера»): WE are the commissioner. We sold
 *    goods that belong to the consigner and now report back the volume + cut.
 *  - In  («Полученный отчёт комиссионера»): WE are the consigner. Someone else
 *    sold our goods on commission and reports back to us.
 *
 * moysklad's `#commissionreport` list shows BOTH types in ONE feed with a «Тип
 * документа» column + filter (grounded 2026-06-27: the create menu offers both,
 * «Тип документа» = Все / Полученный / Выданный). We store the two as separate
 * tables, so the list service UNIONs them into one normalized, server-paginated
 * read-model (mirrors payments.service.ts). Read-only — the create/post flow
 * joins the dedicated consignment FSM sprint.
 */
export const CommissionReportStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type CommissionReportState = z.infer<typeof CommissionReportStateSchema>;

/** «Тип документа» — out = Выданный, in = Полученный (empty ⇒ «Все»). */
export const CommissionReportKindSchema = z.enum(['out', 'in']);
export type CommissionReportKind = z.infer<typeof CommissionReportKindSchema>;

/**
 * Unified «Отчёты комиссионера» list query. Reference filters are comma-separated
 * UUIDs (the FE MultiCombobox sends `ids.map(x=>x.id).join(',')`) → parsed to
 * `IN (...)` in the service. Booleans arrive as 'true'/'false' query strings.
 * Pagination is page/pageSize (the union can't cursor cleanly across two tables).
 */
export const CommissionReportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  // Sort columns are union scalars (+ agent_name resolved in the outer select).
  sortBy: z
    .enum([
      'moment',
      'name',
      'sum',
      'commission',
      'otherServices',
      'commitentSum',
      'payed',
      'agent',
    ])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).max(100).optional(),
  // «Тип документа»
  kind: CommissionReportKindSchema.optional(),
  // Multi-value reference filters (comma-separated UUIDs → IN (...)).
  organizationIds: z.string().optional(),
  agentIds: z.string().optional(),
  agentGroupIds: z.string().optional(),
  agentOwnerIds: z.string().optional(),
  contractIds: z.string().optional(),
  ownerIds: z.string().optional(),
  groupIds: z.string().optional(),
  // Single-value enum + tri-state boolean filters.
  state: CommissionReportStateSchema.optional(),
  // «Статус» — the account-defined CUSTOM workflow status (State id). Filters the
  // UNION on c.status_id. Distinct from `state` (FSM); moysklad's «Статус» filter
  // lists the custom statuses, posting lives in the «Проведено» flag.
  statusId: z.string().uuid().optional(),
  applicable: z.enum(['true', 'false']).optional(),
  printed: z.enum(['true', 'false']).optional(),
  // «Отправлено» — the EDI/emailed flag (published column).
  published: z.enum(['true', 'false']).optional(),
  shared: z.enum(['true', 'false']).optional(),
  // Date ranges (ISO or YYYY-MM-DD; unparseable values ignored).
  momentFrom: z.string().optional(),
  momentTo: z.string().optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
});
export type CommissionReportListQuery = z.infer<typeof CommissionReportListQuerySchema>;

/**
 * One position line on a commission-report create («Выданный» editor «Товары»
 * grid: Наименование · Кол-во · Цена · НДС · Сумма · Комиссия). Phase-1 the
 * server computes the document totals from these lines but does NOT persist the
 * individual rows (no positions table yet — that joins the consignment FSM
 * sprint with /[id]); the created draft surfaces in the list with correct
 * Сумма / Комиссия / Сумма комитента.
 */
export const CommissionReportPositionInputSchema = z.object({
  assortmentId: z.string().uuid(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .default('1'),
  priceMinor: z.string().regex(/^\d+$/).default('0'),
  discount: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .default('0'),
  vat: z.coerce.number().int().min(0).max(100).nullable().default(null),
  vatEnabled: z.boolean().default(true),
  // «Комиссия» — per-line reward (tiyin/minor).
  commissionMinor: z.string().regex(/^\d+$/).default('0'),
});
export type CommissionReportPositionInput = z.infer<typeof CommissionReportPositionInputSchema>;

/**
 * «Выданный отчёт комиссионера» create payload. The model is header-only, so the
 * persisted fields are the document header + the totals the server computes from
 * `positions`. The editor's Период / Проект / Канал продаж / «Комиссия»-mode
 * fields render for parity but have no model column yet (Phase-1 — they land with
 * the positions migration). Always creates a `draft`.
 */
export const CommissionReportCreateSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  // «Статус» — account-defined custom status (State row, entityType=
  // "commissionreportout"); tenant + entityType validated in the service. Null/omit
  // ⇒ the grey «Статус» pill (no status).
  statusId: z.string().uuid().nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((s) => s.toUpperCase())
    .default('UZS'),
  rateValue: z.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  // «Проведено» — moysklad checks it by default on a new commission report. The
  // model is header-only (Phase-1), so posting just flips state→posted + stamps
  // postedAt (no stock/ledger side-effects); defaults true to mirror moysklad.
  applicable: z.boolean().default(true),
  description: z.string().max(4000).nullable().optional(),
  // «от» — document datetime. Lenient: any Date-parseable string; defaults to now.
  moment: z.string().min(1).optional(),
  // «Владелец» popover.
  ownerId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  shared: z.boolean().optional(),
  positions: z.array(CommissionReportPositionInputSchema).default([]),
});
export type CommissionReportCreateInput = z.infer<typeof CommissionReportCreateSchema>;

/**
 * «Полученный отчёт комиссионера» create payload — mirrors the «Выданный» schema
 * (header-only, server-computed totals from `positions` = «Реализовано комиссионером»)
 * plus the in-report-only fields: «Входящий номер» + its date, and «Прочие услуги»
 * (a flat non-commission service amount). `organizationId` is the «Организация-
 * продавец», `agentId` the «Контрагент-комиссионер». Always a draft unless «Проведено».
 */
export const CommissionReportInCreateSchema = z.object({
  organizationId: z.string().uuid(),
  agentId: z.string().uuid(),
  contractId: z.string().uuid().nullable().optional(),
  // «Статус» — custom status (State row, entityType="commissionreportin").
  statusId: z.string().uuid().nullable().optional(),
  // «Входящий номер» + «от» — the commissioner's own document number/date.
  incomingNumber: z.string().max(50).nullable().optional(),
  incomingDate: z.string().min(1).nullable().optional(),
  // «Прочие услуги» — flat non-commission service amount (tiyin/minor).
  otherServicesMinor: z.string().regex(/^\d+$/).default('0'),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/)
    .transform((s) => s.toUpperCase())
    .default('UZS'),
  rateValue: z.string().regex(/^\d+$/).default('100000000'),
  vatEnabled: z.boolean().default(true),
  vatIncluded: z.boolean().default(false),
  applicable: z.boolean().default(true),
  description: z.string().max(4000).nullable().optional(),
  moment: z.string().min(1).optional(),
  ownerId: z.string().uuid().nullable().optional(),
  groupId: z.string().uuid().nullable().optional(),
  shared: z.boolean().optional(),
  positions: z.array(CommissionReportPositionInputSchema).default([]),
});
export type CommissionReportInCreateInput = z.infer<typeof CommissionReportInCreateSchema>;
