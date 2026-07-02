import { z } from 'zod';

const uuid = z.string().uuid();

const optionalEmpty = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().max(max).nullish(),
  );

const optionalEmptyEmail = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.length === 0 ? null : v),
    z.string().email().max(max).nullish(),
  );

/**
 * One settlement account («Расчётный счёт») as edited INLINE on the org form.
 * moysklad keeps an organization's accounts inside the Юр.лицо editor (not a
 * separate page), so the org save carries the FULL desired account set.
 *
 * `id` present → update that existing account; `id` absent → create a new one.
 * The card's required «Расчётный счёт» field maps to `name` (the value shown in
 * document account pickers — climart's «Сум»/«Доллар»/… live here). `accountNumber`
 * is round-tripped by the form so inline edits never clobber a stored number.
 */
export const OrganizationAccountInputSchema = z.object({
  id: z.string().uuid().optional(),
  // Optimistic-lock token for an EXISTING account (absent on a new card). Threaded
  // so the inline save can't silently clobber a concurrent edit made via the
  // standalone bank-accounts page — parity with the standalone account endpoint.
  version: z.number().int().nonnegative().optional(),
  // `.trim()` so a whitespace-only «Расчётный счёт» can't be persisted as a blank
  // display value (the FE already trims; this closes the direct-API hole).
  name: z.string().trim().min(1).max(255),
  currency: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .default('UZS'),
  isDefault: z.coerce.boolean().default(false),
  bankName: optionalEmpty(255),
  bankLocation: optionalEmpty(255),
  accountNumber: optionalEmpty(50),
  correspondentAccount: optionalEmpty(50),
  bic: optionalEmpty(20),
});
export type OrganizationAccountInput = z.infer<typeof OrganizationAccountInputSchema>;

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
  legalTitle: optionalEmpty(255),
  legalAddress: optionalEmpty(2000),
  companyType: z.enum(['legalUZ', 'entrepreneurUZ', 'individualUZ']).default('legalUZ'),
  email: optionalEmptyEmail(255),
  phone: optionalEmpty(20),
  director: optionalEmpty(255),
  directorPosition: optionalEmpty(255),
  chiefAccountant: optionalEmpty(255),
  // moysklad «Внешний код» — universal external-system sync key (the
  // Organization model already carries the column; UpdateOrganizationSchema
  // inherits this via .partial()).
  externalCode: optionalEmpty(50),
  payerVat: z.coerce.boolean().default(true),
  uzRequisites: z
    .object({
      inn: z.string().max(20).optional(),
      okoned: z.string().max(20).optional(),
      mfo: z.string().max(20).optional(),
    })
    .nullish(),
  // moysklad parity: the org's settlement accounts, edited inline. OPTIONAL —
  // when omitted the org's accounts are left untouched; when present it is the
  // FULL desired set (replace semantics — an existing account missing from the
  // array is deleted, guarded by balance + ledger-reference checks server-side).
  accounts: z.array(OrganizationAccountInputSchema).max(50).optional(),
});
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = CreateOrganizationSchema.partial().extend({
  // Optimistic-lock token: the `version` the edit form loaded. Required on
  // every field-edit save so a stale copy can't silently overwrite a newer one.
  version: z.number().int().nonnegative(),
});
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : v === 'true'));

export const OrganizationFilterSchema = z.object({
  archived: boolFromString.optional(),
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: uuid.optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});
export type OrganizationFilterInput = z.infer<typeof OrganizationFilterSchema>;
