import { z } from 'zod';

/**
 * Wizard steps. String-based for forward compat (new steps don't break
 * existing rows). Web app picks an ordering and renders matching pages.
 *
 * Order on first run:
 *   organization → currency → store → first_product → first_counterparty
 *   → first_sale → email_setup → done
 *
 * Special terminals:
 *   done    — wizard completed all steps
 *   skipped — user dismissed before completing
 */
export const ONBOARDING_STEPS = [
  'organization',
  'currency',
  'store',
  'first_product',
  'first_counterparty',
  'first_sale',
  'email_setup',
  'done',
  'skipped',
] as const;
export const OnboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const UpdateOnboardingProgressSchema = z.object({
  currentStep: OnboardingStepSchema.optional(),
  completedSteps: z.array(OnboardingStepSchema).optional(),
});
export type UpdateOnboardingProgressInput = z.infer<typeof UpdateOnboardingProgressSchema>;

export const CompleteStepSchema = z.object({
  step: OnboardingStepSchema,
});
export type CompleteStepInput = z.infer<typeof CompleteStepSchema>;
