'use client';

import { HomepageTabs } from '@/components/homepage-tabs';
import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Container, PageHeader } from '@moysklad/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

// ---------------------------------------------------------------------------
// Backend contract — mirror the OnboardingProgress row returned by
// GET /onboarding/progress (apps/api onboarding module — already tested).
// No invented fields: these are exactly the columns the endpoint ships.
// ---------------------------------------------------------------------------

type OnboardingStep =
  | 'organization'
  | 'currency'
  | 'store'
  | 'first_product'
  | 'first_counterparty'
  | 'first_sale'
  | 'email_setup'
  | 'done'
  | 'skipped';

interface OnboardingProgress {
  id: string;
  accountId: string;
  currentStep: OnboardingStep;
  completedSteps: string[];
  startedAt: string;
  completedAt: string | null;
  skippedAt: string | null;
  startedById: string | null;
}

// The 7 functional steps in moysklad order. `done`/`skipped` are terminal
// states, not checklist rows.
const STEPS = [
  'organization',
  'currency',
  'store',
  'first_product',
  'first_counterparty',
  'first_sale',
  'email_setup',
] as const;

type FunctionalStep = (typeof STEPS)[number];

// Each step's CTA points at an existing in-app route (all verified to exist).
const STEP_ROUTES: Record<FunctionalStep, string> = {
  organization: '/settings/organizations',
  currency: '/settings',
  store: '/stores',
  first_product: '/products/new',
  first_counterparty: '/counterparties/new',
  first_sale: '/customer-orders/new',
  email_setup: '/settings',
};

const PROGRESS_KEY = ['onboarding-progress'] as const;

export default function GettingStartedPage() {
  const t = useTranslations('pages.getting_started');
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<OnboardingProgress>({
    queryKey: PROGRESS_KEY,
    queryFn: () => api.get<OnboardingProgress>('/onboarding/progress'),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PROGRESS_KEY });
  };

  const completeStepMut = useApiMutation({
    mutationFn: (step: FunctionalStep) =>
      api.post<OnboardingProgress>('/onboarding/complete-step', { step }),
    onSuccess: invalidate,
  });

  const skipMut = useApiMutation({
    mutationFn: () => api.post<OnboardingProgress>('/onboarding/skip', {}),
    onSuccess: invalidate,
  });

  const restartMut = useApiMutation({
    mutationFn: () => api.post<OnboardingProgress>('/onboarding/restart', {}),
    onSuccess: invalidate,
  });

  const completedSet = new Set(data?.completedSteps ?? []);
  const completedCount = STEPS.filter((s) => completedSet.has(s)).length;
  const progressPct = Math.round((completedCount / STEPS.length) * 100);

  const isSkipped = data?.currentStep === 'skipped';
  const isAllDone = data?.currentStep === 'done' || completedCount === STEPS.length;

  return (
    <Container size="md" className="space-y-6 py-4">
      {/* Page-level tab strip (Показатели / … / Начало работы) */}
      <HomepageTabs activeKey="onboarding" />

      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {isLoading && <div className="text-[var(--ms-text-muted)] text-sm">{t('loading')}</div>}

      {error && !isLoading && (
        <div className="rounded border border-[var(--ms-destructive-500)] bg-[var(--ms-destructive-50)] p-3 text-[var(--ms-text-destructive)] text-sm">
          {(error as Error).message || t('error_generic')}
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Progress indicator — "{done} / {total}" + thin bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--ms-text-primary)] text-sm tabular-nums">
                {t('progress', { done: completedCount, total: STEPS.length })}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--ms-bg-muted)]">
              <div
                className="h-full rounded-full bg-[var(--ms-text-brand)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {isSkipped ? (
            <div className="space-y-3 rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)] p-4">
              <p className="text-[var(--ms-text-muted)] text-sm">{t('skipped_notice')}</p>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => restartMut.mutate()}
                loading={restartMut.isPending}
              >
                {t('restart')}
              </Button>
            </div>
          ) : isAllDone ? (
            <div className="space-y-3 rounded border border-[var(--ms-success-500)] bg-[var(--ms-success-50)] p-4">
              <p className="flex items-center gap-2 font-medium text-[var(--ms-text-success)] text-sm">
                <span aria-hidden>✓</span>
                {t('all_done')}
              </p>
              <Button
                type="button"
                variant="tertiary"
                onClick={() => restartMut.mutate()}
                loading={restartMut.isPending}
              >
                {t('restart')}
              </Button>
            </div>
          ) : (
            <>
              {/* The checklist */}
              <ul className="divide-y divide-[var(--ms-border-default)] rounded border border-[var(--ms-border-default)]">
                {STEPS.map((step) => {
                  const isCompleted = completedSet.has(step);
                  const isCurrent = data.currentStep === step;
                  return (
                    <li
                      key={step}
                      className={`flex items-start gap-3 p-4 ${
                        isCurrent
                          ? 'border-[var(--ms-text-brand)] border-l-2 bg-[var(--ms-bg-muted)]'
                          : ''
                      }`}
                    >
                      {/* Status icon */}
                      <div className="mt-0.5 shrink-0">
                        {isCompleted ? (
                          <span
                            aria-hidden
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ms-success-500)] text-[11px] text-white"
                          >
                            ✓
                          </span>
                        ) : isCurrent ? (
                          <span
                            aria-hidden
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--ms-text-brand)]"
                          >
                            <span className="h-2 w-2 rounded-full bg-[var(--ms-text-brand)]" />
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className="inline-flex h-5 w-5 rounded-full border-2 border-[var(--ms-border-strong)]"
                          />
                        )}
                      </div>

                      {/* Title + description */}
                      <div className="min-w-0 flex-1">
                        <div
                          className={`font-medium text-sm ${
                            isCompleted
                              ? 'text-[var(--ms-text-muted)] line-through'
                              : 'text-[var(--ms-text-primary)]'
                          }`}
                        >
                          {t(`steps.${step}.title`)}
                        </div>
                        <div className="mt-0.5 text-[var(--ms-text-muted)] text-xs">
                          {t(`steps.${step}.desc`)}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2">
                        {isCompleted ? (
                          <span className="text-[var(--ms-text-muted)] text-xs">
                            ✓ {t('done_label')}
                          </span>
                        ) : (
                          <>
                            <a
                              href={STEP_ROUTES[step]}
                              className="inline-flex h-8 items-center rounded-[var(--ms-radius-default)] bg-[var(--ms-text-brand)] px-3 font-medium text-sm text-white hover:opacity-90"
                            >
                              {t('cta')}
                            </a>
                            <Button
                              type="button"
                              variant="tertiary"
                              onClick={() => completeStepMut.mutate(step)}
                              loading={
                                completeStepMut.isPending && completeStepMut.variables === step
                              }
                            >
                              {t('mark_done')}
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Footer action — skip setup */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="tertiary"
                  onClick={() => skipMut.mutate()}
                  loading={skipMut.isPending}
                >
                  {t('skip')}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </Container>
  );
}
