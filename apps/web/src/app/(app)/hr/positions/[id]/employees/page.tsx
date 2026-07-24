'use client';

/**
 * HR Lavozim → Xodimlar drill. Read-only list of employees whose free-text
 * `position` string matches the catalog row's name. Reuses hrEmployeeApi.list
 * with the new `position` filter. See spec §5.2.
 */

import { hrEmployeeApi, hrPositionApi } from '@/lib/hr-api';
import type { HrEmployeeListResult, HrPosition } from '@/lib/hr-api';
import { Avatar, EmptyState, ErrorState, Skeleton } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function HrPositionEmployeesPage() {
  const t = useTranslations('pages.hrPositions');
  const tEmp = useTranslations('pages.hrEmployees');
  const tCommon = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params.id;

  const posQuery = useQuery<HrPosition>({
    queryKey: ['hr-position', id],
    queryFn: () => hrPositionApi.findOne(id),
    enabled: !!id,
  });

  const name = posQuery.data?.name;

  const empQuery = useQuery<HrEmployeeListResult>({
    queryKey: ['hr-employees', 'by-position', name],
    queryFn: () => hrEmployeeApi.list({ position: name, limit: 50 }),
    enabled: !!name,
  });

  if (posQuery.isLoading) return <Skeleton className="h-40" />;
  if (posQuery.error || !name) {
    return (
      <div className="space-y-4">
        <Link href="/hr/positions" className="text-[var(--ms-text-link)] text-sm hover:underline">
          {t('drill_back')}
        </Link>
        <EmptyState title={t('not_found')} />
      </div>
    );
  }

  const rows = empQuery.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <div>
        <Link href="/hr/positions" className="text-[var(--ms-text-link)] text-sm hover:underline">
          {t('drill_back')}
        </Link>
        <h1 className="mt-1 font-semibold text-2xl text-[var(--ms-text-strong)]">
          {t('drill_title', { name })}
        </h1>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        {empQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : empQuery.error ? (
          <ErrorState
            title={tCommon('action_failed')}
            description={(empQuery.error as Error).message}
            onRetry={() => empQuery.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState title={t('drill_empty')} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{tEmp('col_name')}</th>
                <th className="px-3 py-2 text-left font-medium">{tEmp('col_department')}</th>
                <th className="px-3 py-2 text-left font-medium">{tEmp('col_telegram')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-[var(--ms-border-default)] border-b last:border-b-0"
                  data-test-id={`hr-position-employee-${row.id}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.name} size="sm" />
                      <span className="font-medium text-[var(--ms-text-primary)]">{row.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.department || '—'}
                  </td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                    {row.telegramPhone || row.phone || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
