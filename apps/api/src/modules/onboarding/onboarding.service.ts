import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  CompleteStepSchema,
  ONBOARDING_STEPS,
  type OnboardingStep,
  UpdateOnboardingProgressSchema,
} from './onboarding.schema.js';

/**
 * OnboardingService — single-row-per-account wizard tracker.
 *
 * Web app polls `/onboarding/progress` on /dashboard mount; if status
 * isn't 'done' or 'skipped' it shows the wizard pinned to whatever the
 * `currentStep` is. Each completed step calls `/onboarding/complete-step`.
 *
 * Idempotent: re-completing a step is a no-op (avoids races on dual
 * tabs). The current step always advances to the next non-completed
 * step in the standard order.
 */
@Injectable()
export class OnboardingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProgress(accountId: string, userId: string) {
    const existing = await this.prisma.client.onboardingProgress.findUnique({
      where: { accountId },
    });
    if (existing) return existing;
    return this.prisma.client.onboardingProgress.create({
      data: {
        accountId,
        startedById: userId,
      },
    });
  }

  async completeStep(accountId: string, userId: string, raw: unknown) {
    const r = CompleteStepSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    const { step } = r.data;
    const current = await this.getProgress(accountId, userId);

    const completed = new Set(current.completedSteps as OnboardingStep[]);
    completed.add(step);
    const completedArray = [...completed];
    const next = this.advanceTo(completedArray);

    return this.prisma.client.onboardingProgress.update({
      where: { accountId },
      data: {
        completedSteps: completedArray,
        currentStep: next,
        ...(next === 'done' ? { completedAt: new Date() } : {}),
      },
    });
  }

  async skip(accountId: string, userId: string) {
    await this.getProgress(accountId, userId);
    return this.prisma.client.onboardingProgress.update({
      where: { accountId },
      data: {
        currentStep: 'skipped',
        skippedAt: new Date(),
      },
    });
  }

  async restart(accountId: string, userId: string) {
    await this.getProgress(accountId, userId);
    return this.prisma.client.onboardingProgress.update({
      where: { accountId },
      data: {
        currentStep: 'organization',
        completedSteps: [],
        completedAt: null,
        skippedAt: null,
      },
    });
  }

  /**
   * Manual progress override (admin only). Lets a tenant operator skip
   * to a specific step or mark a step uncompleted for re-walking.
   */
  async overrideProgress(accountId: string, userId: string, raw: unknown) {
    const r = UpdateOnboardingProgressSchema.safeParse(raw);
    if (!r.success) {
      throw new BadRequestException(r.error.issues.map((i) => i.message).join(', '));
    }
    await this.getProgress(accountId, userId);
    const data: Record<string, unknown> = {};
    if (r.data.currentStep !== undefined) data.currentStep = r.data.currentStep;
    if (r.data.completedSteps !== undefined) data.completedSteps = r.data.completedSteps;
    return this.prisma.client.onboardingProgress.update({
      where: { accountId },
      data,
    });
  }

  /** Pick the next not-yet-completed step in canonical order; 'done' if all. */
  private advanceTo(completed: OnboardingStep[]): OnboardingStep {
    const set = new Set(completed);
    for (const step of ONBOARDING_STEPS) {
      if (step === 'done' || step === 'skipped') continue;
      if (!set.has(step)) return step;
    }
    return 'done';
  }
}
