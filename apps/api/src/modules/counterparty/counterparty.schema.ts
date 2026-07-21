import { z } from 'zod';
import { tryNormalizeUzPhone } from '../shared/phone.js';

/** UZ STIR (Soliq Identifikatsiya Raqami) — 9 digits (legal) or 14 digits (individual). */
export function isValidUzStir(s: string): boolean {
  if (!/^\d+$/.test(s)) return false;
  if (s.length !== 9 && s.length !== 14) return false;
  // Full soliq.uz checksum validation is complex; accept format for now.
  // Sprint 3 integration with soliq.uz will verify against registry.
  return true;
}

export const UzStirSchema = z
  .string()
  .refine(isValidUzStir, "STIR 9 yoki 14 raqamdan iborat bo'lishi kerak");

export const CompanyTypeSchema = z.enum([
  'legalUZ',
  'entrepreneurUZ',
  'individualUZ',
  'legal',
  'entrepreneur',
  'individual',
]);

export const UzRequisitesSchema = z.object({
  // Optional: physical persons may carry ПИНФЛ/birth fields without an ИНН.
  inn: UzStirSchema.optional(),
  okoned: z.string().optional(),
  mfo: z.string().optional(),
  account: z.string().optional(),
  // moysklad gear columns «ПИНФЛ» / «КПП» / «Дата рождения» / «Пол» — stored in
  // the requisites JSON blob (no migration). pinfl = 14-digit UZ personal id.
  pinfl: z.string().max(20).optional(),
  kpp: z.string().max(20).optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['male', 'female']).optional(),
});

// Structured address (moysklad's *Full pattern). All fields optional —
// caller may know city + street but not house, etc. Field set + order is
// LIVE-grounded against the counterparty edit DOM (docs/moysklad-reference/
// counterparties/detail/edit-default.html — both «Фактический адрес» and
// «Юридический адрес» blocks expose, in order: Индекс · Страна · Город ·
// Улица · Дом · Квартира/Офис · Другое · Комментарий к адресу):
//   postalCode «Индекс» · country «Страна» · city «Город» · street «Улица» ·
//   house «Дом» · apartment «Квартира/Офис» · addInfo «Другое» ·
//   comment «Комментарий к адресу». `region` is NOT shown in the counterparty
//   address block (it appears only in the Налоги/GST sub-form) — kept here so
//   addresses written by other callers round-trip unchanged.
export const AddressFullSchema = z.object({
  country: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  street: z.string().max(255).optional(),
  house: z.string().max(50).optional(),
  apartment: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  addInfo: z.string().max(500).optional(),
  // «Комментарий к адресу» — the free address comment shown below «Другое».
  comment: z.string().max(500).optional(),
});

const uuid = z.string().uuid();

export const CreateCounterpartySchema = z.object({
  name: z.string().min(1, 'Nomi majburiy').max(255),
  // .nullish() (not bare .optional()): the counterparty edit form (counterparties/[id])
  // clears every empty optional text/FK field by sending `null` (e.g. `v.legalTitle || null`,
  // `v.priceTypeId || null`). A bare .optional() rejects null ("Expected string, received
  // null") and 400'd EVERY save of a counterparty that had any of these fields blank — i.e.
  // essentially every counterparty. Update = Create.partial().extend, and .partial() only
  // adds `undefined`, never `null`, so the nullability must live here. Columns are all
  // nullable (String? / priceTypeId String? @onDelete SetNull) and the service applies null
  // cleanly (string → null; priceTypeId null → disconnect). Found by Phase-2 edit-save audit
  // (2026-06-08); same class as the customer-orders externalCode/description stragglers.
  legalTitle: z.string().max(255).nullish(),
  legalAddress: z.string().nullish(),
  legalAddressFull: AddressFullSchema.optional(),
  actualAddress: z.string().max(255).nullish(),
  actualAddressFull: AddressFullSchema.optional(),
  companyType: CompanyTypeSchema.default('legalUZ'),
  email: z.string().email("Email formati noto'g'ri").max(255).nullish().or(z.literal('')),
  phone: z
    .string()
    .max(40)
    .nullish()
    .transform((v) => {
      // Empty/cleared phone → null (NOT undefined). The update() service guard is
      // `if (parsed.phone !== undefined) data.phone = parsed.phone`, so returning
      // undefined here made an explicit clear a silent no-op — the old number was
      // retained on a 200 save (Phase-2 QA find, 2026-06-10). null reaches the guard
      // and clears the column, matching the sibling contact-person.schema.ts phone.
      if (!v || v.trim() === '') return null;
      // Normalise to E.164 +998... when the input is an Uzbek mobile;
      // pass non-UZ numbers through unchanged so international clients
      // can be saved without surprise rewrites.
      return tryNormalizeUzPhone(v) ?? v.trim();
    }),
  fax: z.string().max(50).nullish(),
  tags: z.array(z.string()).default([]),
  // Custom user-defined fields. Free-form key/value map; values are scalar
  // (string|number|bool|null) or shallow object/array. The service does
  // not interpret semantics — it stores as JSON.
  attributes: z.record(z.unknown()).optional(),
  uzRequisites: UzRequisitesSchema.optional(),
  description: z.string().nullish(),
  code: z.string().max(50).nullish(),
  externalCode: z.string().max(255).nullish(),
  syncId: uuid.optional(),
  discountCardNumber: z.string().max(100).nullish(),
  // Personal discount rules (per-counterparty). Free-form list.
  discounts: z.array(z.unknown()).optional(),
  // «Доступ» section (B6 S15 — grounded against the live counterparty card
  // `counterparties/detail/edit-default.html:175`: >Доступ< section with
  // >Сотрудник< (owner) · >Отдел< (group) · >Общий доступ< (shared)).
  // ownerId («Сотрудник») was previously NON-writable — create forced it to the
  // current user and update never handled it. Both columns are nullable
  // (Counterparty.ownerId/groupId @onDelete SetNull), so the editor's clear→null
  // must reach the service: .nullish() accepts an explicit null (a bare
  // .optional() would 400 the clear, the same class as the legalTitle nullish
  // note above). The service connect/disconnects on null; create falls back to
  // the current user when ownerId is absent (moysklad defaults the owner to the
  // creator).
  ownerId: uuid.nullish(),
  groupId: uuid.nullish(),
  priceTypeId: uuid.nullish(),
  // .nullish() (not bare .optional()): the edit form clears an unset FK by
  // sending `null` (stateId/bonusProgramId ?? null). A bare .optional() rejected
  // null ("Expected string, received null") and 400'd every edit-save of a
  // counterparty with no CRM status — same class as the ownerId/groupId nullish
  // note above. The service connect/disconnects on null.
  stateId: uuid.nullish(),
  bonusProgramId: uuid.nullish(),
  shared: z.boolean().default(false),
  // «Группы» (m2m) — the counterparty's group memberships, set wholesale from the
  // form's multi-select. Absent on update = leave unchanged; [] = clear all.
  groupIds: z.array(uuid).optional(),
});

export const UpdateCounterpartySchema = CreateCounterpartySchema.partial().extend({
  version: z.number().int().nonnegative(),
});

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const CounterpartyFilterSchema = z
  .object({
    search: z.string().optional(),
    companyType: CompanyTypeSchema.optional(),
    // «Показывать» tri-state (moysklad parity — captured value «Только обычные»;
    // see counterparties/states/02-filter-applied.png). 'false' (or absent, via
    // .default(false)) → only non-archived; 'true' → only archived; 'all' →
    // undefined → NO archive predicate (show both). Mirrors the products
    // ProductFilterSchema.archived tri-state (2026-06-11j) — kept as its own
    // union (not the shared boolFromString) so only this field accepts 'all'.
    // The service applies `archived: filter.archived` — undefined means Prisma
    // omits the column. NB the FE label is «Показывать» (filters.show), NOT the
    // shared «Статус» (fields.state) which is the CRM-state field below.
    archived: z
      .union([z.boolean(), z.enum(['true', 'false', 'all'])])
      .transform((v) => (v === 'all' ? undefined : typeof v === 'boolean' ? v : v === 'true'))
      .optional()
      .default(false),
    ownerId: uuid.optional(),
    groupId: uuid.optional(),
    // «Группы» — m2m counterparty-group membership, distinct from groupId (=Отдел).
    cpGroupId: uuid.optional(),
    // «Группы» multi-select (2026-07-21) — m2m guruh a'zoligi, OR-semantika
    // (kontragent tanlangan guruhlarning BIRORTASида bo'lsa mos). Query-param
    // vergul-ajratilgan uuid ro'yxati (`a,b,c`) → string[]. `cpGroupId` (single,
    // UI'siz) saqlanadi; bu multi-select filtr uchun.
    cpGroupIds: z
      .string()
      .optional()
      .transform((s) =>
        s
          ? s
              .split(',')
              .map((x) => x.trim())
              .filter((x) => x.length > 0)
          : [],
      )
      .refine((arr) => arr.every((x) => uuid.safeParse(x).success), {
        message: "cpGroupIds: har biri uuid bo'lishi kerak",
      }),
    // Auto-detected role for the /counterparties tabs (usage-based, not manual):
    //   customer → has any sale (retailSale OR demand)
    //   supplier → has any supply (kirim)
    role: z.enum(['customer', 'supplier']).optional(),
    stateId: uuid.optional(),
    // «Цены» — filter by the counterparty's assigned price type
    // (Counterparty.priceTypeId → PriceType). Picker hits /price-types.
    priceTypeId: uuid.optional(),
    // Filter by a single tag from the counterparty's `tags String[]` column
    // (moysklad's «Метки» filter). Matches when the row's tags array
    // contains this value (Prisma `{ tags: { has } }`). Empty string is
    // treated as "no filter".
    tags: z.string().trim().min(1).optional(),
    // moysklad-parity discrete Фильтр fields, each backed by an EXISTING column
    // (no migration). The combined top search box still ORs name/legalTitle/
    // email/phone/externalCode; these AND-narrow on a single attribute:
    //   Адрес            → actualAddress     (contains, insensitive)
    //   Код              → code              (contains, insensitive)
    //   ИНН              → uzRequisites.inn  (JSON-path string_contains; our
    //                      single UZ STIR — covers moysklad's «ИНН»/«ИНН (УЗ)»)
    //   Дисконтная карта → discountCardNumber (contains, insensitive)
    //   Общий доступ     → shared            (boolean tri-state)
    address: z.string().optional(),
    // «Наименование» / «Телефон» — discrete climart filter fields (contains).
    name: z.string().optional(),
    phone: z.string().optional(),
    code: z.string().optional(),
    inn: z.string().optional(),
    discountCard: z.string().optional(),
    shared: boolFromString.optional(),
    // «Баланс» от/до — major-currency-unit range over the base-currency (UZS)
    // CounterpartyBalance. Coerced from the query string; converted to tiyin in
    // the service. Negative bounds allowed (we may owe the counterparty). `.finite()`
    // rejects Infinity/NaN (e.g. '?balanceFrom=1e400' or a huge pasted number) with
    // a clean 400 instead of a raw 500 — BigInt(Math.round(Infinity)) throws RangeError.
    balanceFrom: z.coerce.number().finite().optional(),
    balanceTo: z.coerce.number().finite().optional(),
    // «Дата события (последнее)» / «Текст события» — filter by the counterparty's
    // CRM events (Calls): a call in the date range / whose summary contains text.
    // Approximation: "has a matching call" (some), not strictly "the last one".
    eventFrom: z.string().optional(),
    eventTo: z.string().optional(),
    eventText: z.string().optional(),
    // «Создан» / «Когда изменен» — half-open day ranges over createdAt / updatedAt
    // (YYYY-MM-DD strings; the To bound is widened to end-of-day in the service —
    // byte-identical to the cash-in/payment-in/products gold standard).
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
    updatedFrom: z.string().optional(),
    updatedTo: z.string().optional(),
    cursor: uuid.optional(),
    // Offset paging — the list sends `page` (1-based) for moysklad-style jump-to-
    // any-page («101-200 из N», real first/last). Other callers omit it (cursor).
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(250).default(25),
    // Sortable scalar columns only. «Сумма продаж» is rendered from the LIVE
    // posted-demand aggregate (not the denormalized salesAmount column the running
    // app never writes), so like the other computed money columns (Баланс/Средний
    // чек/Прибыль) it is NOT sortable — keeping it out of the enum.
    sortBy: z.enum(['name', 'code', 'createdAt', 'updatedAt']).default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
    // Dynamic custom «Дополнительные поля» filters arrive as attr_<code>=<value>;
    // .passthrough() keeps them on the parsed object for the service to read.
  })
  .passthrough();

// Bulk «Статус ▾» — set (or clear, stateId=null) a CRM State on many counterparties.
// moysklad's list-toolbar quick status-set; mirrors the customer-order
// status-change pattern but counterparties carry a real stateId FK.
export const BulkSetStateSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  stateId: uuid.nullable(),
});
export type BulkSetStateInput = z.infer<typeof BulkSetStateSchema>;

// moysklad's «Создать задачи» list-toolbar drawer — bulk-creates ONE task per
// selected counterparty (each linked via Task.agentId, assigned to that
// counterparty's owner). The shared description/dueAt/typeId apply to all.
export const BulkCreateTasksSchema = z.object({
  ids: z.array(uuid).min(1).max(500),
  // «Описание задач» — the task text (required). Task.title is derived from its
  // first line server-side; the full text goes to Task.description.
  description: z.string().trim().min(1).max(2000),
  // «Срок выполнения» — null = «Не ограничен».
  dueAt: z.coerce.date().nullish(),
  // LEGACY «Тип задач» — TaskType FK. Superseded by stateId (empty string → null).
  typeId: z.preprocess((v) => (typeof v === 'string' && v.length === 0 ? null : v), uuid.nullish()),
  // «Тип задач» — the task's `state` (State, entityType="task"). Empty string → null.
  stateId: z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    uuid.nullish(),
  ),
});
export type BulkCreateTasksInput = z.infer<typeof BulkCreateTasksSchema>;

// moysklad's «Изменить ▾» → «Массовое редактирование» — bulk-edits the selected
// counterparties. Each field is opt-in (only the keys present in `patch` are
// applied; the rest are left untouched), mirroring moysklad's per-field enable
// checkbox + fill/change/clear semantics. `null` = clear the field. Live-grounded
// 2026-06-18 (docs/audits/counterparty-mass-edit-live-spec-2026-06-18.md). The
// many-group «Добавить/Убрать группы» modes are deferred (need a counterparty↔group
// many-to-many model); `groupId` here is the single «Владелец-отдел».
export const BulkUpdateCounterpartySchema = z.object({
  ids: z.array(uuid).min(1).max(1000),
  patch: z
    .object({
      archived: z.boolean(),
      stateId: uuid.nullable(),
      companyType: CompanyTypeSchema,
      gender: z.enum(['male', 'female']).nullable(),
      birthDate: z.string().nullable(),
      priceTypeId: uuid.nullable(),
      ownerId: uuid.nullable(),
      groupId: uuid.nullable(),
      // «Группы» (many-to-many) — moysklad's three independent modes. Each is an
      // opt-in list of CounterpartyGroup ids: set = replace all memberships,
      // add = connect, remove = disconnect. Applied to every selected counterparty.
      setGroupIds: z.array(uuid),
      addGroupIds: z.array(uuid),
      removeGroupIds: z.array(uuid),
      shared: z.boolean(),
      // «Дополнительные поля» — custom-attribute values to SET (merged into the
      // existing attributes JSON per row, so other custom fields are preserved).
      attributes: z.record(z.unknown()),
    })
    .partial()
    .refine((p) => Object.keys(p).length > 0, {
      message: 'patch must set at least one field',
    }),
});
export type BulkUpdateCounterpartyInput = z.infer<typeof BulkUpdateCounterpartySchema>;

// === CounterpartyAccount (bank accounts) ===

export const CreateCounterpartyAccountSchema = z.object({
  accountNumber: z.string().min(1, 'Hisob raqami majburiy').max(50),
  bankName: z.string().max(255).optional(),
  bankLocation: z.string().max(255).optional(),
  correspondentAccount: z.string().max(50).optional(),
  // UZ MFO — exactly 5 digits.
  mfo: z
    .string()
    .regex(/^\d{5}$/, "MFO 5 ta raqamdan iborat bo'lishi kerak")
    .optional(),
  bankInn: z.string().max(20).optional(),
  swift: z.string().max(20).optional(),
  currency: z.string().length(3).default('UZS'),
  isMain: z.boolean().default(false),
});

export const UpdateCounterpartyAccountSchema = CreateCounterpartyAccountSchema.partial();

export type CreateCounterpartyInput = z.infer<typeof CreateCounterpartySchema>;
export type UpdateCounterpartyInput = z.infer<typeof UpdateCounterpartySchema>;
export type CounterpartyFilter = z.infer<typeof CounterpartyFilterSchema>;
export type CreateCounterpartyAccountInput = z.infer<typeof CreateCounterpartyAccountSchema>;
export type UpdateCounterpartyAccountInput = z.infer<typeof UpdateCounterpartyAccountSchema>;
