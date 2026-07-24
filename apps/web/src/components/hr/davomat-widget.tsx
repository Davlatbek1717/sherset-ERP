'use client';

/**
 * Compact GPS-davomat status + Keldim/Ketyapman widget, shown at the top of
 * the home dashboard so attendance can be marked the moment someone opens
 * sherset.biznesjon.uz — no separate navigation to /davomat required.
 * /davomat itself still exists as the full onboarding (consent + permission)
 * experience; this widget links there when the employee hasn't opted in yet.
 */

import { useDavomatStatus } from '@/hooks/use-davomat-status';
import { getCurrentPosition } from '@/lib/geolocation';
import { type DavomatManualResult, hrDavomatApi } from '@/lib/hr-api';
import { Button, useToast } from '@moysklad/ui';
import { useMutation } from '@tanstack/react-query';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

const TZ = 'Asia/Tashkent';
const fmtTime = (iso: string | null | undefined) =>
  iso ? formatInTimeZone(iso, TZ, 'HH:mm') : '—';

export function DavomatWidget() {
  const t = useTranslations('pages.davomat');
  const { data: myToday, refetch, isLoading } = useDavomatStatus();
  const { toast } = useToast();

  const manualMut = useMutation({
    mutationFn: async (kind: 'in' | 'out'): Promise<DavomatManualResult> => {
      const pos = await getCurrentPosition();
      const dto = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
      return kind === 'in' ? hrDavomatApi.checkIn(dto) : hrDavomatApi.checkOut(dto);
    },
    onSuccess: async (r) => {
      if (!r.ok && r.reason === 'outside') {
        toast.error(t('manual_outside'));
        return;
      }
      if (!r.ok) {
        toast.error(t('manual_failed'));
        return;
      }
      await refetch();
    },
    onError: () => toast.error(t('manual_gps_failed')),
  });

  if (isLoading || !myToday) return null;

  if (!myToday.optIn) {
    return (
      <Link
        href="/davomat"
        className="flex items-center justify-between rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 transition-colors hover:bg-[var(--ms-bg-hover)]"
        data-test-id="davomat-widget-optin-link"
      >
        <span className="font-medium text-[var(--ms-text-primary)] text-sm">
          {t('widget_not_enabled')}
        </span>
        <span className="font-medium text-[var(--ms-text-brand)] text-sm">
          {t('widget_enable_link')} →
        </span>
      </Link>
    );
  }

  const today = myToday.today;
  const status: 'not_arrived' | 'at_work' | 'left' = today
    ? today.checkOutTime
      ? 'left'
      : 'at_work'
    : 'not_arrived';

  return (
    <div
      className="flex flex-col gap-2 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 sm:flex-row sm:items-center sm:justify-between"
      data-test-id="davomat-widget"
    >
      <div className="flex items-center gap-1.5 font-medium text-sm">
        {status === 'at_work' && (
          <span className="text-[var(--ms-success-700)]">
            🟢 {t('widget_at_work')} · {fmtTime(today?.checkInTime)}
          </span>
        )}
        {status === 'left' && (
          <span className="text-[var(--ms-text-muted)]">
            ✓ {t('widget_left')} {fmtTime(today?.checkInTime)}–{fmtTime(today?.checkOutTime)}
          </span>
        )}
        {status === 'not_arrived' && (
          <span className="text-[var(--ms-warning-700)]">🟠 {t('widget_not_arrived')}</span>
        )}
      </div>
      {status !== 'left' && (
        <Button
          size="md"
          variant={status === 'at_work' ? 'destructive' : 'success'}
          disabled={manualMut.isPending}
          loading={manualMut.isPending}
          onClick={() => manualMut.mutate(status === 'at_work' ? 'out' : 'in')}
          data-test-id="davomat-widget-mark"
        >
          {status === 'at_work' ? t('manual_check_out') : t('manual_check_in')}
        </Button>
      )}
    </div>
  );
}
