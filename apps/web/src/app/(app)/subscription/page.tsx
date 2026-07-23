'use client';

/**
 * «Подписка» — the user-menu item's target (moysklad `#payments`, grounded
 * 2026-07-04). Shows the account's current plan from the auth state; a
 * self-hosted install has no billing, so the card is informational.
 */

import { useAuth } from '@/lib/auth-store';
import { useTranslations } from 'next-intl';

export default function SubscriptionPage() {
  const t = useTranslations('pages.subscription');
  const auth = useAuth();
  const plan = auth.user?.accountPlan ?? '—';
  return (
    <div className="px-6 py-5" data-test-id="subscription-page">
      <h1 className="mb-4 font-semibold text-[20px] text-[var(--ms-text-primary)]">{t('title')}</h1>
      <div className="max-w-[560px] rounded-[var(--ms-radius-md)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] px-4 py-3">
        <div className="mb-1 text-[12px] text-[var(--ms-text-muted)]">{t('plan_label')}</div>
        <div className="font-semibold text-[15px] text-[var(--ms-text-primary)] capitalize">
          {plan}
        </div>
        <p className="mt-3 text-[12px] text-[var(--ms-text-muted)] leading-relaxed">
          {t('self_hosted_note')}
        </p>
      </div>
    </div>
  );
}
