'use client';

import { useTranslations } from 'next-intl';

/**
 * Yellow banner shown above the navbar when the account is on the
 * trial plan — mirrors moysklad's "Перейдите на платный тариф, чтобы
 * использовать все возможности МоегоСклада" strip with the orange
 * "Выбрать тариф" CTA on the right. Auto-hides for paid plans
 * (controlled by the parent — this component doesn't read the auth
 * store itself so it stays presentational and easy to test).
 */
export function TrialBanner({
  onSelectPlan,
}: {
  onSelectPlan?: () => void;
}) {
  const t = useTranslations('trial_banner');
  return (
    <div className="flex items-center justify-center gap-3 bg-[#FFF6D9] px-4 py-2 text-[13px] text-[var(--ms-text-primary)]">
      {/* Decorative sparkle / star icon — moysklad uses a small graphic
          on the left of the text. Keep inline so we don't pull in a
          separate asset for one banner. */}
      <span aria-hidden className="text-base text-[#F5A623]">
        ✦
      </span>
      <span className="hidden sm:inline">{t('message')}</span>
      <span className="inline sm:hidden">{t('message_short')}</span>
      <button
        type="button"
        onClick={onSelectPlan}
        className="ml-2 rounded bg-[#F5821F] px-3 py-1 font-medium text-[12px] text-white shadow-sm transition-colors hover:bg-[#E07410]"
      >
        {t('cta')}
      </button>
    </div>
  );
}
