'use client';

import { api } from '@/lib/api-client';
import { Input, useDebounce } from '@moysklad/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface AuditRow {
  id: string;
  userId: string | null;
  entity: string;
  entityId: string;
  action: string;
  at: string;
}
interface AuditResponse {
  items: AuditRow[];
  total: number;
  nextCursor?: string;
}

/**
 * Audit log viewer — uses moysklad's existing `/admin/audit-logs` endpoint.
 * Filters: entity, search (free-text), dateFrom, dateTo. Pagination is
 * cursor-based on the backend; this v1 shows page 1 only (next-page wiring
 * can be added when needed).
 */
export function AuditView() {
  const t = useTranslations('pages.analitika_settings');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 300);
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(entity ? { entity } : {}),
    ...(dateFrom ? { dateFrom: new Date(dateFrom).toISOString() } : {}),
    ...(dateTo ? { dateTo: new Date(dateTo).toISOString() } : {}),
    limit: '50',
  });
  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ['analitika', 'audit', params.toString()],
    queryFn: () => api.get<AuditResponse>(`/admin/audit-logs?${params.toString()}`),
    placeholderData: (prev) => prev,
  });
  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <p className="text-[var(--ms-text-muted)] text-sm">{t('audit_hint')}</p>

      {/* Filters */}
      <div className="grid gap-3 rounded-lg border border-[var(--ms-border)] bg-white p-3 lg:grid-cols-4">
        <label className="space-y-1.5 text-xs">
          <span className="block font-medium text-[var(--ms-text-primary)]">
            {t('audit_entity')}
          </span>
          <Input
            value={entity}
            placeholder="Counterparty, Inventory…"
            onChange={(e) => setEntity(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="block font-medium text-[var(--ms-text-primary)]">
            {t('audit_action')}
          </span>
          <Input
            value={searchInput}
            placeholder="create, update…"
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="block font-medium text-[var(--ms-text-primary)]">
            {t('audit_date')} ↓
          </span>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="space-y-1.5 text-xs">
          <span className="block font-medium text-[var(--ms-text-primary)]">
            {t('audit_date')} ↑
          </span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-[var(--ms-border)] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[var(--ms-bg-subtle)] text-[var(--ms-text-muted)] text-xs uppercase">
            <tr>
              <th className="w-40 px-3 py-2 text-left font-semibold">{t('audit_date')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('audit_entity')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('audit_action')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('audit_actor')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ms-border)]">
            {items.map((row) => (
              <tr key={row.id} className="hover:bg-[var(--ms-bg-subtle)]">
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {new Date(row.at).toLocaleString('ru-RU')}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-[var(--ms-text-primary)]">{row.entity}</div>
                  <div className="font-mono text-[10px] text-[var(--ms-text-muted)]">
                    {row.entityId}
                  </div>
                </td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">{row.action}</td>
                <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">
                  {row.userId ?? '—'}
                </td>
              </tr>
            ))}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-[var(--ms-text-muted)]">
                  {t('audit_empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
