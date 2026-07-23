'use client';

/**
 * Top-right account block + dropdown — moysklad 1:1 (LIVE-grounded 2026-07-04,
 * docs/audits/user-menu-2026-07-04/: 10-user-menu-open.png + _ground.json).
 *
 * Trigger (right-aligned, on the navy bar): two-line name/email · circular
 * avatar with a small GREEN org glyph docked at its bottom-right · «▾».
 * Dropdown items, exactly moysklad's set and order:
 *   Настройки пользователя → /settings/profile (#account — already built)
 *   Настройки              → /settings         (#scripttemplate — settings IA)
 *   Новости  [green badge] → notifications panel (moysklad opens the sidepage;
 *                            we raise the bell popover via OPEN_NOTIFICATIONS_EVENT)
 *   Спецпредложения        → /specialoffers    (#specialoffers)
 *   Подписка               → /subscription     (#payments)
 *   ───────────────────────
 *   Выход                  → logout → /login
 *
 * The name/email block truncates (max-w) so the header never overflows the
 * viewport at narrow widths (the user's 1536-px report).
 */

import { OPEN_NOTIFICATIONS_EVENT } from '@/components/notification-bell';
import { api } from '@/lib/api-client';
import { logout } from '@/lib/auth-store';
import { DropdownMenu } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function UserMenu({ name, email }: { name: string; email?: string }) {
  const t = useTranslations('user_menu');
  const router = useRouter();

  // «Новости» badge — the same unread feed the bell shows (shared query key,
  // React Query dedupes; no extra request).
  const { data } = useQuery<{ unreadCount: number }>({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unreadCount: number }>('/notifications?unreadOnly=true&limit=10'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unread = data?.unreadCount ?? 0;

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          className="ml-3 flex shrink-0 items-center gap-2.5 border-white/15 border-l pl-4 text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-white/60 max-md:ml-1 max-md:gap-1 max-md:border-l-0 max-md:pl-1"
          data-test-id="user-menu-trigger"
        >
          {/* Phones: avatar-only trigger — the two-line name/email block is the
              navbar's widest item and would overflow a 360px bar. */}
          <div className="min-w-0 max-w-[170px] text-right text-[11px] leading-tight max-md:hidden">
            <div className="truncate font-medium text-white">{name}</div>
            {email && <div className="truncate text-[10px] text-white/65">{email}</div>}
          </div>
          {/* avatar + the small green org glyph docked bottom-right (moysklad). */}
          <span className="relative inline-flex shrink-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-semibold text-white text-xs">
              {name[0]?.toUpperCase()}
            </span>
            <span
              aria-hidden
              className="-right-1 -bottom-0.5 absolute flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-[#8bc34a]"
            >
              <svg viewBox="0 0 8 8" className="h-2 w-2" aria-hidden="true">
                <path d="M1 1h6M1 3h6M1 5h4" stroke="#fff" strokeWidth="1.1" />
              </svg>
            </span>
          </span>
          <span aria-hidden className="text-[10px] text-white/65 leading-none">
            ▾
          </span>
        </button>
      }
      testId="user-menu"
    >
      <DropdownMenu.Item
        onSelect={() => router.push('/settings/profile')}
        testId="user-menu-account"
      >
        {t('user_settings')}
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => router.push('/settings')} testId="user-menu-settings">
        {t('settings')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => {
          // Defer past the menu's own dismissal — raising the bell popover in
          // the same tick gets torn down by the closing menu's dismissable layer.
          setTimeout(() => window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATIONS_EVENT)), 180);
        }}
        testId="user-menu-news"
      >
        <span className="flex w-full items-center justify-between gap-6">
          {t('news')}
          {unread > 0 && (
            <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#8bc34a] px-1 font-bold text-[10px] text-white tabular-nums leading-none">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => router.push('/specialoffers')} testId="user-menu-offers">
        {t('special_offers')}
      </DropdownMenu.Item>
      <DropdownMenu.Item
        onSelect={() => router.push('/subscription')}
        testId="user-menu-subscription"
      >
        {t('subscription')}
      </DropdownMenu.Item>
      <DropdownMenu.Separator />
      <DropdownMenu.Item
        onSelect={() => {
          void logout().finally(() => {
            window.location.href = '/login';
          });
        }}
        testId="user-menu-logout"
      >
        {t('logout')}
      </DropdownMenu.Item>
    </DropdownMenu>
  );
}
