import { z } from 'zod';

/**
 * Reusable bonus/fine rule — an admin-defined template (name + kind +
 * amount) that can be applied to an employee with one click, writing a
 * ledger row with source='rule' and ruleId set.
 *
 * `condition` is forward-compat metadata (yangibolim shape
 * `{type: 'checkbox'|'rule', config}`) — stored but not auto-evaluated in
 * P5c. Manual apply is the supported flow; auto-trigger is a future hook.
 */
export const RuleConditionSchema = z
  .object({
    type: z.enum(['checkbox', 'rule']).default('checkbox'),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

export const CreateBonusFineRuleSchema = z.object({
  name: z.string().min(1, 'Nom kiritilishi shart').max(255),
  kind: z.enum(['bonus', 'fine']),
  amountMinor: z.union([z.string(), z.number(), z.bigint()]).refine(
    (v) => {
      try {
        return BigInt(v) > 0n;
      } catch {
        return false;
      }
    },
    { message: "Miqdor musbat bo'lishi kerak" },
  ),
  condition: RuleConditionSchema,
  isActive: z.boolean().default(true),
});
export type CreateBonusFineRuleInput = z.infer<typeof CreateBonusFineRuleSchema>;

export const UpdateBonusFineRuleSchema = CreateBonusFineRuleSchema.partial();
export type UpdateBonusFineRuleInput = z.infer<typeof UpdateBonusFineRuleSchema>;

/** Apply a rule to one employee — creates a source='rule' ledger row. */
export const ApplyBonusFineRuleSchema = z.object({
  ruleId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});
export type ApplyBonusFineRuleInput = z.infer<typeof ApplyBonusFineRuleSchema>;
