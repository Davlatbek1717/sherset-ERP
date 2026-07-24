'use client';

import { Icons } from '@moysklad/ui';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';

export type HeroState =
  | 'at_work'
  | 'outside'
  | 'not_arrived'
  | 'day_off'
  | 'connecting'
  | 'permission_denied'
  | 'gps_lost'
  | 'offline'
  | 'no_branch';

interface Skin {
  card: string;
  bubble: string;
  text: string;
  icon: ComponentType<{ className?: string }>;
  spin?: boolean;
}

const SUCCESS = 'var(--ms-success-500)';
const DESTRUCTIVE = 'var(--ms-destructive-500)';
const WARNING = 'var(--ms-warning-500)';

const SKIN: Record<HeroState, Skin> = {
  at_work: {
    card: 'border-[var(--ms-success-500)] bg-[var(--ms-success-50)]',
    bubble: 'bg-[var(--ms-success-500)] text-white',
    text: 'text-[var(--ms-success-700)]',
    icon: Icons.check,
  },
  outside: {
    card: 'border-[var(--ms-destructive-500)] bg-[var(--ms-destructive-50)]',
    bubble: 'bg-[var(--ms-destructive-500)] text-white',
    text: 'text-[var(--ms-destructive-600)]',
    icon: Icons.close,
  },
  not_arrived: {
    card: 'border-[var(--ms-warning-500)] bg-[var(--ms-warning-50)]',
    bubble: 'bg-[var(--ms-warning-500)] text-white',
    text: 'text-[var(--ms-warning-700)]',
    icon: Icons.clock,
  },
  day_off: {
    card: 'border-[var(--ms-border-default)] bg-[var(--ms-bg-muted)]',
    bubble: 'bg-[var(--ms-border-strong)] text-white',
    text: 'text-[var(--ms-text-muted)]',
    icon: Icons.calendar,
  },
  connecting: {
    card: 'border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]',
    bubble: 'bg-[var(--ms-brand-500)] text-white',
    text: 'text-[var(--ms-text-muted)]',
    icon: Icons.loading,
    spin: true,
  },
  permission_denied: {
    card: 'border-[var(--ms-destructive-500)] bg-[var(--ms-destructive-50)]',
    bubble: 'bg-[var(--ms-destructive-500)] text-white',
    text: 'text-[var(--ms-destructive-600)]',
    icon: Icons.warning,
  },
  gps_lost: {
    card: 'border-[var(--ms-warning-500)] bg-[var(--ms-warning-50)]',
    bubble: 'bg-[var(--ms-warning-500)] text-white',
    text: 'text-[var(--ms-warning-700)]',
    icon: Icons.warning,
  },
  offline: {
    card: 'border-[var(--ms-warning-500)] bg-[var(--ms-warning-50)]',
    bubble: 'bg-[var(--ms-warning-500)] text-white',
    text: 'text-[var(--ms-warning-700)]',
    icon: Icons.warning,
  },
  no_branch: {
    card: 'border-[var(--ms-warning-500)] bg-[var(--ms-warning-50)]',
    bubble: 'bg-[var(--ms-warning-500)] text-white',
    text: 'text-[var(--ms-warning-700)]',
    icon: Icons.regions,
  },
};

// silence unused-const lints for the semantic color names kept for reference
void [SUCCESS, DESTRUCTIVE, WARNING];

/** The big phone status card — swaps skin by state. Tokens + core Tailwind only. */
export function StatusHero({ state }: { state: HeroState }) {
  const t = useTranslations('pages.davomat');
  const skin = SKIN[state];
  const Icon = skin.icon;
  return (
    <div
      className={`rounded-[var(--ms-radius-lg)] border-2 p-6 text-center transition-colors ${skin.card}`}
      data-test-id="davomat-status-hero"
      data-state={state}
    >
      <div
        className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${skin.bubble} ${
          state === 'connecting' ? 'animate-pulse' : ''
        }`}
      >
        <Icon className={`h-8 w-8 ${skin.spin ? 'animate-spin' : ''}`} />
      </div>
      <p className={`mt-4 font-bold text-[32px] leading-tight ${skin.text}`}>
        {t(`hero_${state}`)}
      </p>
      <p className="mt-1 text-[var(--ms-text-muted)] text-base">{t(`hero_${state}_sub`)}</p>
    </div>
  );
}
