'use client';

import type { AttendanceDayStatus } from '@/lib/hr-api';
import { Badge } from '@moysklad/ui';
import { useTranslations } from 'next-intl';

export type BadgeStatus = AttendanceDayStatus | 'at_work' | 'left';

const TONE: Record<BadgeStatus, 'success' | 'destructive' | 'warning' | 'neutral'> = {
  present: 'success',
  at_work: 'success',
  late: 'destructive',
  absent: 'neutral',
  dayoff: 'neutral',
  left: 'neutral',
};

/** Single source of the attendance status vocabulary (daily + monthly + board). */
export function AttendanceStatusBadge({
  status,
  lateMinutes,
}: {
  status: BadgeStatus;
  lateMinutes?: number;
}) {
  const t = useTranslations('pages.davomat');
  const suffix = status === 'late' && lateMinutes ? ` +${lateMinutes}` : '';
  return (
    <Badge tone={TONE[status]}>
      {t(`badge_${status}`)}
      {suffix}
    </Badge>
  );
}
