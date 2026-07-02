import { z } from 'zod';

/**
 * Contract («Договоры») — a sales («Договор купли-продажи») or commission
 * («Договор комиссии») agreement between our organisation (ownAgent) and a
 * counterparty (agent). Documents (Demand / InvoiceOut / Supply / …) reference
 * it; it carries a currency-rate snapshot and a total-amount cap (sumMinor).
 *
 * NOTE: Contract has NO `version` column → NO optimistic-lock (plain
 * create/update/delete, unlike most catalog entities). Update is a `.partial()`
 * of Create with no version field.
 *
 * The capture's «Статус» column is OMITTED on purpose: the Contract model has
 * no status enum, so we do NOT fabricate one.
 */

const moneyMinor = z.string().regex(/^-?\d+$/, 'Sum must be an integer string (minor units)');
const rate = z.string().regex(/^\d+$/, 'Rate must be a non-negative integer string');

export const CreateContractSchema = z.object({
  // «Договор №» — the contract number/title.
  name: z.string().min(1).max(255),
  // «Код»
  code: z.string().max(50).nullish(),
  // «Тип договора» — 'Sales' = «Договор купли-продажи» (default),
  // 'Commission' = «Договор комиссии».
  contractType: z.enum(['Sales', 'Commission']).default('Sales'),
  // «Организация» — our organisation (Contract model field is ownAgentId).
  ownAgentId: z.string().uuid(),
  // «Контрагент» — the counterparty.
  agentId: z.string().uuid(),
  // «Валюта договора»
  currency: z.string().length(3).default('UZS'),
  // currency rate × 10^8 (BigInt-as-string)
  rateValue: rate.default('100000000'),
  // «Сумма договора» — money minor × 100 (BigInt-as-string)
  sumMinor: moneyMinor.default('0'),
  // «Процент от суммы продажи» — Commission contracts only.
  rewardPercent: z.coerce.number().int().min(0).max(100).nullish(),
  rewardType: z.string().max(30).nullish(),
  // «от» — contract date (ISO); defaults to now at create.
  moment: z.string().datetime({ offset: true }).optional(),
  // «Комментарий»
  description: z.string().nullish(),
  agentAccountId: z.string().uuid().nullish(),
  organizationAccountId: z.string().uuid().nullish(),
});
export type CreateContractInput = z.infer<typeof CreateContractSchema>;

// Update = same shape, all optional (Contract has NO version column → no
// optimistic-lock field appended, unlike price-type).
export const UpdateContractSchema = CreateContractSchema.partial();
export type UpdateContractInput = z.infer<typeof UpdateContractSchema>;
