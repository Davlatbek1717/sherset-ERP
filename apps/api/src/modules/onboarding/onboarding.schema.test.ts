import { describe, expect, it } from 'vitest';
import {
  CompleteStepSchema,
  ONBOARDING_STEPS,
  OnboardingStepSchema,
  UpdateOnboardingProgressSchema,
} from './onboarding.schema.js';

describe('OnboardingStepSchema', () => {
  it.each(ONBOARDING_STEPS)('accepts %s', (s) => {
    expect(OnboardingStepSchema.safeParse(s).success).toBe(true);
  });

  it('rejects unknown step', () => {
    expect(OnboardingStepSchema.safeParse('first_invoice').success).toBe(false);
  });
});

describe('CompleteStepSchema', () => {
  it('accepts a known step', () => {
    expect(CompleteStepSchema.safeParse({ step: 'first_product' }).success).toBe(true);
  });

  it('rejects missing step', () => {
    expect(CompleteStepSchema.safeParse({}).success).toBe(false);
  });
});

describe('UpdateOnboardingProgressSchema', () => {
  it('accepts empty object (no-op)', () => {
    expect(UpdateOnboardingProgressSchema.safeParse({}).success).toBe(true);
  });

  it('accepts currentStep + completedSteps array', () => {
    const r = UpdateOnboardingProgressSchema.safeParse({
      currentStep: 'first_sale',
      completedSteps: ['organization', 'currency', 'store'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown step in completedSteps array', () => {
    expect(
      UpdateOnboardingProgressSchema.safeParse({
        completedSteps: ['organization', 'first_invoice'],
      }).success,
    ).toBe(false);
  });
});
