'use client';

import { api } from '@/lib/api-client';
/**
 * /restock-tasks — «Joylashtirish vazifalari» list (Sherset custom). The
 * warehouse-keeper's queue of return-to-shelf tasks sent by cashiers. Each row
 * links to the checklist detail where lines are confirmed (QR scan / manual).
 */
import { restockStatusTone } from '@/lib/domain-status-tone';
import { Badge, Button, formatDate } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface RestockTaskRow {
  id: string;
  sourceName: string | null;
  storeName: string | null;
  assigneeName: string | null;
  createdByName: string | null;
  status: 'pending' | 'in_progress' | 'done';
  lineCount: number;
  confirmedCount: number;
  createdAt: string;
}

export default function RestockTasksPage() {
  const t = useTranslations('restock');
  const [mine, setMine] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['restock-tasks', mine],
    queryFn: () =>
      api.get<{ items: RestockTaskRow[] }>(
        `/restock-tasks?type=restock${mine ? '&mine=true' : ''}`,
      ),
  });
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-semibold text-[var(--ms-text-primary)] text-xl">{t('list_title')}</h1>
        <div className="flex gap-1 rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] p-0.5">
          <Button variant={mine ? 'ghost' : 'secondary'} size="sm" onClick={() => setMine(false)}>
            {t('filter_all')}
          </Button>
          <Button variant={mine ? 'secondary' : 'ghost'} size="sm" onClick={() => setMine(true)}>
            {t('filter_mine')}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--ms-radius-default)] border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
        <table className="w-full text-sm" data-test-id="restock-tasks-table">
          <thead>
            <tr className="border-[var(--ms-border-default)] border-b bg-[var(--ms-bg-muted)] text-left text-[var(--ms-text-secondary)] text-xs">
              <th className="px-3 py-2 font-medium">{t('col_source')}</th>
              <th className="px-3 py-2 font-medium">{t('col_omborchi')}</th>
              <th className="px-3 py-2 font-medium">{t('col_progress')}</th>
              <th className="px-3 py-2 font-medium">{t('col_status')}</th>
              <th className="px-3 py-2 font-medium">{t('col_date')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr
                key={row.id}
                className="border-[var(--ms-border-default)] border-b last:border-0 hover:bg-[var(--ms-row-hover)]"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/restock-tasks/${row.id}`}
                    className="font-medium text-[var(--ms-text-brand)] hover:underline"
                    data-test-id={`restock-task-link-${row.id}`}
                  >
                    {row.sourceName ?? t('source_fallback')}
                  </Link>
                  {row.storeName && (
                    <div className="text-[var(--ms-text-muted)] text-xs">{row.storeName}</div>
                  )}
                </td>
                <td className="px-3 py-2">{row.assigneeName ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.confirmedCount}/{row.lineCount}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={restockStatusTone(row.status)}>{t(`status_${row.status}`)}</Badge>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)]">
                  {formatDate(row.createdAt)}
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-10 text-center text-[var(--ms-text-muted)]"
                  data-test-id="restock-tasks-empty"
                >
                  {t('empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
