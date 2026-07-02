'use client';

import { api } from '@/lib/api-client';
import { Button, Container, PageHeader } from '@moysklad/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface RateRow {
  date: string;
  currency: string;
  rate: string;
  nominal: number;
  source: string;
}

interface SyncResult {
  date: string;
  inserted: number;
  updated: number;
  total: number;
}

export default function ExchangeRatesPage() {
  const t = useTranslations('pages.exchange_rates');
  const qc = useQueryClient();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<'success' | 'error' | null>(null);

  const { data: rates, isLoading } = useQuery<RateRow[]>({
    queryKey: ['exchange-rates-latest'],
    queryFn: () => api.get<RateRow[]>('/exchange-rates/latest'),
  });

  const syncMut = useMutation<SyncResult>({
    mutationFn: () => api.post<SyncResult>('/exchange-rates/sync', {}),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['exchange-rates-latest'] });
      setStatusKind('success');
      setStatusMessage(t('sync_success', { count: String(result.total), date: result.date }));
    },
    onError: (e: Error) => {
      setStatusKind('error');
      setStatusMessage(t('sync_error', { error: e.message }));
    },
  });

  const handleSync = () => {
    setStatusMessage(null);
    syncMut.mutate();
  };

  return (
    <Container size="md" className="py-4">
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="mb-4 flex items-center gap-3">
        <Button
          onClick={handleSync}
          disabled={syncMut.isPending}
          data-test-id="exchange-rates-sync"
        >
          {syncMut.isPending ? t('syncing') : t('sync_button')}
        </Button>
        {statusMessage && (
          <span
            className={`text-sm ${
              statusKind === 'success'
                ? 'text-[var(--ms-text-success,#15803d)]'
                : 'text-[var(--ms-text-destructive)]'
            }`}
            data-test-id="exchange-rates-status"
          >
            {statusMessage}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-[var(--ms-text-muted)] text-sm">…</div>
      ) : !rates || rates.length === 0 ? (
        <div className="rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)] p-8 text-center text-[var(--ms-text-muted)] text-sm">
          {t('empty_title')}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--ms-border-default)] bg-[var(--ms-bg-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--ms-bg-muted)] text-[var(--ms-text-muted)] text-xs uppercase tracking-wide">
              <tr>
                <th className="h-9 px-3 text-left font-medium">{t('col_currency')}</th>
                <th className="h-9 px-3 text-right font-medium">{t('col_nominal')}</th>
                <th className="h-9 px-3 text-right font-medium">{t('col_rate')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_date')}</th>
                <th className="h-9 px-3 text-left font-medium">{t('col_source')}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr
                  key={`${r.currency}-${r.source}`}
                  className="border-[var(--ms-border-default)] border-t"
                  data-test-id={`exchange-rate-row-${r.currency}`}
                >
                  <td className="px-3 py-2 font-semibold tabular-nums">{r.currency}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.nominal}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rate}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] tabular-nums">{r.date}</td>
                  <td className="px-3 py-2 text-[var(--ms-text-muted)] text-xs">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
