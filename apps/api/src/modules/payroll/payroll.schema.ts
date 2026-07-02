import { z } from 'zod';

/**
 * Payroll (Ish haqi / Зарплата) — per-employee monthly payroll record.
 *
 * Single-employee model: one Payroll = one Employee × one period.
 * Multi-employee batch payroll happens at the UI level (clerk creates
 * N Payroll docs at once); the doc stays simple.
 *
 * Line items break down earnings (positive sumMinor) and deductions
 * (negative sumMinor). Header sumMinor is the net = SUM(line.sumMinor),
 * denormalised on every line edit / on transition.
 *
 * FSM: draft → posted (commits the official record). No stock/balance
 * cascade — the actual cash transfer is a separate CashOut document.
 */

const uuid = z.string().uuid();

export const PayrollStateSchema = z.enum(['draft', 'posted', 'cancelled']);
export type PayrollState = z.infer<typeof PayrollStateSchema>;

export const PayrollTransitionSchema = z.enum(['post', 'unpost', 'cancel']);
export type PayrollTransitionTarget = z.infer<typeof PayrollTransitionSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

/**
 * Line itemType is a free-form enum so accounting teams can add their
 * own categories without a migration. UI maps known values to labels;
 * unknown values render as the raw string.
 */
export const PayrollLineItemTypeSchema = z.enum([
  'salary', // Asosiy oylik
  'bonus', // Mukofot
  'overtime', // Qo'shimcha ish
  'vacation', // Ta'til to'lovi
  'sick', // Kasallik varaqasi
  'tax_income', // Daromad solig'i (deduction)
  'tax_social', // Ijtimoiy fond (deduction)
  'advance', // Avans (deduction)
  'penalty', // Jarima (deduction)
  'other', // Boshqa
]);

const bigintSignedMinor = z.string().regex(/^-?\d+$/, 'BigInt minor (manfiy / musbat raqam)');

export const PayrollLineInputSchema = z.object({
  itemType: z.union([PayrollLineItemTypeSchema, z.string().min(1).max(40)]),
  itemName: z.string().min(1).max(255),
  /** Signed: positive = earning, negative = deduction. Stored as BigInt. */
  sumMinor: bigintSignedMinor,
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type PayrollLineInput = z.infer<typeof PayrollLineInputSchema>;

export const CreatePayrollSchema = z.object({
  organizationId: uuid,
  employeeId: uuid,
  periodStart: z.string(),
  periodEnd: z.string(),
  moment: z.string().optional(),
  currency: z.string().length(3).default('UZS'),
  rateValue: z.string().regex(/^\d+$/).default('100000000'),
  description: z.string().max(4096).optional(),
  externalCode: z.string().max(255).optional(),
  applicable: z.boolean().optional(),
  /** Lines required — at least 1 line. Header sumMinor is derived from them. */
  lines: z.array(PayrollLineInputSchema).min(1, 'Kamida 1 ta satr'),
});
export type CreatePayrollInput = z.infer<typeof CreatePayrollSchema>;

export const UpdatePayrollSchema = z
  .object({
    organizationId: uuid.optional(),
    employeeId: uuid.optional(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    moment: z.string().optional(),
    currency: z.string().length(3).optional(),
    rateValue: z.string().regex(/^\d+$/).optional(),
    description: z.string().max(4096).nullable().optional(),
    externalCode: z.string().max(255).nullable().optional(),
    /** Replace-all semantics: omit to leave existing lines, pass [] to clear them. */
    lines: z.array(PayrollLineInputSchema).optional(),
    // Optimistic-lock token (moysklad parity). REQUIRED on update so a forgetful
    // caller cannot silently bypass the lost-update guard. Absent on Create.
    version: z.number().int().nonnegative(),
  })
  .strict();
export type UpdatePayrollInput = z.infer<typeof UpdatePayrollSchema>;

export const PayrollFilterSchema = z.object({
  state: PayrollStateSchema.optional(),
  organizationId: uuid.optional(),
  employeeId: uuid.optional(),
  ownerId: uuid.optional(),
  applicable: boolFromString.optional(),
  search: z.string().max(100).optional(),
  includeDeleted: boolFromString.optional(),
  periodFrom: z.string().optional(),
  periodTo: z.string().optional(),
  sumMinorFrom: z.coerce.number().int().optional(),
  sumMinorTo: z.coerce.number().int().optional(),
  currency: z.string().length(3).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z
    .enum(['moment', 'name', 'sumMinor', 'periodStart', 'createdAt', 'updatedAt'])
    .default('moment'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});
export type PayrollFilterInput = z.infer<typeof PayrollFilterSchema>;
