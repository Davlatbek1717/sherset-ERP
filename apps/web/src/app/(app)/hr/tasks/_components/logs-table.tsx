'use client';

/**
 * HR Tasks → Loglar (Logs) tab. Presentational: the parent page owns the
 * query (so the tab-count badge stays in sync) and passes the rows + filter
 * state down. Renders the status / date-range filter bar and the FSM-status
 * log table.
 */

import { hrTaskLogStatusTone } from '@/lib/domain-status-tone';
import type { HrTaskLogRow, HrTaskLogStatus } from '@/lib/hr-api';
import { Badge, EmptyState, Input, NativeSelect, Skeleton } from '@moysklad/ui';
import { formatInTimeZone } from 'date-fns-tz';
import { useTranslations } from 'next-intl';

const TZ = 'Asia/Tashkent';

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return formatInTimeZone(new Date(iso), TZ, 'yyyy-MM-dd HH:mm');
}

export interface LogsTableProps {
  rows: HrTaskLogRow[];
  isLoading: boolean;
  status: '' | HrTaskLogStatus;
  onStatus: (v: '' | HrTaskLogStatus) => void;
  dateFrom: string;
  onDateFrom: (v: string) => void;
  dateTo: string;
  onDateTo: (v: string) => void;
}

export function LogsTable({
  rows,
  isLoading,
  status,
  onStatus,
  dateFrom,
  onDateFrom,
  dateTo,
  onDateTo,
}: LogsTableProps) {
  const t = useTranslations('pages.hrTasks');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-log-status" className="text-[var(--ms-text-muted)] text-xs">
            {t('col_log_status')}
          </label>
          <NativeSelect
            id="hr-log-status"
            value={status}
            onChange={(e) => onStatus(e.target.value as '' | HrTaskLogStatus)}
            className="w-auto"
          >
            <option value="">{t('all')}</option>
            <option value="sent">{t('status_sent')}</option>
            <option value="pending_review">{t('status_pending_review')}</option>
            <option value="answered_yes">{t('status_answered_yes')}</option>
            <option value="answered_no">{t('status_answered_no')}</option>
            <option value="answered_text">{t('status_answered_text')}</option>
            <option value="approved">{t('status_approved')}</option>
            <option value="rejected">{t('status_rejected')}</option>
            <option value="failed">{t('status_failed')}</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-log-from" className="text-[var(--ms-text-muted)] text-xs">
            {t('date_from')}
          </label>
          <Input
            id="hr-log-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hr-log-to" className="text-[var(--ms-text-muted)] text-xs">
            {t('date_to')}
          </label>
          <Input
            id="hr-log-to"
            type="date"
            value={dateTo}
            onChange={(e) => onDateTo(e.target.value)}
            className="w-auto"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length > 0 ? (
        <table className="w-full border-collapse text-sm" data-test-id="hr-tasks-logs-table">
          <thead className="bg-[var(--ms-bg-app)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">{t('col_sent_at')}</th>
              <th className="px-3 py-2 text-left">{t('col_template')}</th>
              <th className="px-3 py-2 text-left">{t('col_employee')}</th>
              <th className="px-3 py-2 text-left">{t('col_log_status')}</th>
              <th className="px-3 py-2 text-left">{t('col_answered_at')}</th>
              <th className="px-3 py-2 text-left">{t('col_reviewer')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((log) => (
              <tr
                key={log.id}
                className="border-[var(--ms-border-default)] border-t hover:bg-[var(--ms-bg-app)]"
                data-test-id={`hr-log-row-${log.id}`}
              >
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {fmtDateTime(log.sentAt)}
                </td>
                <td className="px-3 py-2">{log.template?.title ?? '—'}</td>
                <td className="px-3 py-2">{log.employee?.name ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge tone={hrTaskLogStatusTone(log.status)}>{t(`status_${log.status}`)}</Badge>
                  {log.responseText && (
                    <div className="mt-1 line-clamp-1 text-[var(--ms-text-muted)] text-xs">
                      {log.responseText}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[var(--ms-text-muted)] text-xs">
                  {fmtDateTime(log.answeredAt)}
                </td>
                <td className="px-3 py-2">{log.reviewedBy?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState title={t('empty_logs')} description={t('empty_logs_hint')} />
      )}
    </div>
  );
}
