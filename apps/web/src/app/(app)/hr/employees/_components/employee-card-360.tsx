'use client';

/**
 * Xodim kartasi 360° (4M.4 · menejer TZ §6.2) — MK04.
 *
 * Menejerning haqiqiy savoli «bu odam bilan nima bo'lyapti», javob esa olti
 * xil joyga tarqalgan edi: KPI navbati, davomat, smenalar, tuzatmalar,
 * bo'shatish holati va suhbat jurnali. Har birini alohida ochish menejerni
 * to'liq rasmni yig'ishdan voz kechishga majbur qilardi.
 *
 * ⚠️ Ekran YANGI hisob QILMAYDI — `GET hr/employees/:id/card` ni ko'rsatadi.
 * Raqamni bu yerda qayta hisoblash bir ko'rsatkichning ikki joyda ikki xil
 * chiqishiga olib kelardi.
 */

import { type EmployeeCard, hrEmployeeApi } from '@/lib/hr-api';
import { Badge, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { NoteJournal } from './note-journal';

export interface EmployeeCard360Props {
  employeeId: string;
}

export function EmployeeCard360({ employeeId }: EmployeeCard360Props) {
  const t = useTranslations('pages.hrEmployees');

  const { data, isLoading } = useQuery<EmployeeCard>({
    queryKey: ['hr-employee-card', employeeId],
    queryFn: () => hrEmployeeApi.card(employeeId),
    enabled: !!employeeId,
  });

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const { employee, kpi, attendance, shifts, offboarding } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--ms-text-strong)]">{employee.name}</span>
        {employee.archived && <Badge tone="neutral">{t('card_archived')}</Badge>}
        {employee.telegramBound && <Badge tone="brand">{t('card_telegram_bound')}</Badge>}
        {employee.roles.map((r) => (
          <Badge key={r} tone="neutral">
            {r}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Oylikni bloklaydigan kunlar — menejerning birinchi savoli. */}
        <Tile
          label={t('card_kpi_pending')}
          value={kpi.pendingTotal}
          testId="card-kpi-pending"
          tone={kpi.pendingTotal > 0 ? 'warning' : 'neutral'}
        />
        <Tile label={t('card_kpi_accepted')} value={kpi.acceptedTotal} testId="card-kpi-accepted" />
        <Tile label={t('card_corrections')} value={kpi.correctionCount} testId="card-corrections" />
        <Tile
          label={t('card_attendance_days')}
          value={attendance.monthDays}
          testId="card-attendance-days"
        />
        <Tile
          label={t('card_late_minutes')}
          value={attendance.monthLateMinutes}
          testId="card-late-minutes"
          tone={attendance.monthLateMinutes > 0 ? 'warning' : 'neutral'}
        />
        <Tile
          label={t('card_open_shifts')}
          value={shifts.openCount}
          testId="card-open-shifts"
          tone={shifts.openCount > 0 ? 'warning' : 'neutral'}
        />
        {/* Smena bo'lmagani «0» emas «—»: o'lchanmagan bilan nol bir xil ko'rinmasin. */}
        <Tile
          label={t('card_last_shift')}
          value={formatStamp(shifts.lastOpenedAt)}
          testId="card-last-shift"
        />
        <Tile label={t('card_hired_at')} value={formatDay(employee.hiredAt)} testId="card-hired" />
      </div>

      {/* Bo'shatish BLOKI faqat jarayon boshlanganda: boshlanmaganda «0/5»
          ko'rsatish xodim ketyapti degan yolg'on taassurot berardi. */}
      {offboarding?.started && (
        <div
          data-test-id="card-offboarding"
          className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3 text-sm"
        >
          <span className="font-medium text-[var(--ms-text-strong)]">{t('card_offboarding')}</span>{' '}
          <span className="text-[var(--ms-text-muted)]">
            {t('card_offboarding_progress', {
              done: offboarding.doneCount,
              total: offboarding.total,
            })}
          </span>
        </div>
      )}

      <NoteJournal employeeId={employeeId} notes={data.notes} />
    </div>
  );
}

function Tile({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: ReactNode;
  testId: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div className="rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-3">
      <div className="text-[var(--ms-text-muted)] text-xs">{label}</div>
      <div
        data-test-id={testId}
        className={
          tone === 'warning'
            ? 'font-semibold text-[var(--ms-text-warning)] text-lg tabular-nums'
            : 'font-semibold text-[var(--ms-text-strong)] text-lg tabular-nums'
        }
      >
        {value}
      </div>
    </div>
  );
}

function formatStamp(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
