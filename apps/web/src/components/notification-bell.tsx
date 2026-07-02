'use client';

import { useApiMutation } from '@/hooks/use-api-mutation';
import { api } from '@/lib/api-client';
import { Button, Skeleton } from '@moysklad/ui';
import * as Popover from '@radix-ui/react-popover';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  entity: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  nextCursor: string | undefined;
  total: number;
  unreadCount: number;
}

function entityHref(kind: string, entity: string | null, entityId: string | null): string | null {
  if (!entityId) return null;
  if (kind.startsWith('task_') || entity === 'Task') return `/tasks/${entityId}`;
  if (kind === 'restock_assigned' || entity === 'RestockTask') return `/restock-tasks/${entityId}`;
  if (kind.startsWith('opportunity_') || entity === 'Opportunity')
    return `/opportunities/${entityId}`;
  if (kind === 'invoice_paid' || kind === 'invoice_overdue' || entity === 'InvoiceOut')
    return `/invoices-out/${entityId}`;
  return null;
}

function formatRelativeTime(
  isoString: string,
  t: ReturnType<typeof useTranslations<'notifications'>>,
): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('relative_time_now');
  if (minutes < 60) return t('relative_time_minutes_ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('relative_time_hours_ago', { count: hours });
  return new Date(isoString).toLocaleDateString();
}

export function NotificationBell() {
  const t = useTranslations('notifications');
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<NotificationsResponse>('/notifications?unreadOnly=true&limit=10'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const markReadMutation = useApiMutation({
    mutationFn: (ids: string[]) => api.post('/notifications/mark-read', { ids }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useApiMutation({
    mutationFn: () => api.post('/notifications/mark-all-read', {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = data?.unreadCount ?? 0;
  const items = data?.items ?? [];

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) {
      markReadMutation.mutate([item.id]);
    }
    const href = entityHref(item.kind, item.entity, item.entityId);
    if (href) {
      router.push(href);
    }
  };

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('title')}
          data-test-id="notification-bell-trigger"
          className="relative inline-flex h-8 w-8 items-center justify-center rounded text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/60"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="-top-0.5 -right-0.5 absolute inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--ms-destructive-500)] px-1 font-bold text-[10px] text-white leading-none tabular-nums"
              data-test-id="notification-bell-badge"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          data-test-id="notification-bell-popover"
          className="z-[var(--ms-z-popover)] w-[360px] overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] shadow-[var(--ms-shadow-lg)] outline-none"
        >
          {/* Header — moysklad parity: sticky, lighter weight, subtle separator */}
          <div className="flex items-center justify-between border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-surface)] px-4 py-2.5">
            <span className="font-semibold text-[13px] text-[var(--ms-text-primary)]">
              {t('title')}
            </span>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="h-auto px-0"
                data-test-id="notification-bell-mark-all"
              >
                {t('mark_all_read')}
              </Button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-2 p-3" data-test-id="notification-bell-loading">
                {['sk-a', 'sk-b', 'sk-c'].map((k) => (
                  <div key={k} className="flex gap-2">
                    <Skeleton className="h-2 w-2 mt-1.5 flex-shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 px-4 py-10 text-center text-[var(--ms-text-muted)]"
                data-test-id="notification-bell-empty"
              >
                <BellOff size={28} aria-hidden className="text-[var(--ms-text-disabled)]" />
                <span className="text-[13px]">{t('empty_title')}</span>
              </div>
            ) : (
              <ul>
                {items.map((item) => {
                  const isUnread = !item.readAt;
                  return (
                    <li
                      key={item.id}
                      className="border-[var(--ms-border-default)] border-b last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => handleItemClick(item)}
                        data-test-id={`notification-bell-item-${item.id}`}
                        data-unread={isUnread || undefined}
                        className={[
                          'block w-full px-4 py-2.5 text-left transition-colors',
                          'hover:bg-[var(--ms-bg-hover)] focus-visible:bg-[var(--ms-bg-hover)] focus-visible:outline-none',
                          isUnread ? 'bg-[var(--ms-brand-50)]' : '',
                        ].join(' ')}
                      >
                        <div className="flex items-start gap-2">
                          {isUnread ? (
                            <span
                              aria-hidden
                              className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-[var(--ms-text-brand)]"
                            />
                          ) : (
                            <span aria-hidden className="mt-1.5 h-2 w-2 flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 font-medium text-[13px] text-[var(--ms-text-primary)]">
                              {item.title}
                            </p>
                            {item.body && (
                              <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--ms-text-muted)]">
                                {item.body}
                              </p>
                            )}
                            <p className="mt-1 font-mono text-[11px] text-[var(--ms-text-muted)] tabular-nums">
                              {formatRelativeTime(item.createdAt, t)}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
